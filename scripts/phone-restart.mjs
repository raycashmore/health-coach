import { createConnection, createServer } from 'node:net';
import { lstatSync, unlinkSync } from 'node:fs';

async function send(path, message) {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let response = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('Phone restart control timed out.')));
    socket.on('connect', () => socket.end(message));
    socket.on('data', (data) => (response += data.toString()));
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

export async function requestPhoneRestart(path) {
  let response;
  try {
    response = await send(path, 'restart');
  } catch {
    throw new Error(
      'No managed phone stack is available to restart. Stop any existing stack from its owner, then start pnpm dev:phone.'
    );
  }
  if (response !== 'restarting') throw new Error(response || 'The phone stack refused the restart.');
}

export async function createPhoneRestartControl(path, restart) {
  const server = createServer((socket) => {
    let message = '';
    // A disconnected or idle client must not crash or indefinitely block the supervisor.
    socket.on('error', () => undefined);
    socket.setTimeout(2000, () => socket.destroy());
    socket.on('data', (data) => {
      message += data.toString();
      if (message.length > 32) socket.destroy();
    });
    socket.on('end', () => {
      if (message === 'status') return socket.end('running');
      if (message !== 'restart') return socket.end('Unknown phone control request.');
      const result = restart();
      socket.end(result === true ? 'restarting' : result);
    });
  });
  const listen = () =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(path, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  try {
    await listen();
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    try {
      await send(path, 'status');
    } catch (probeError) {
      if (probeError.code !== 'ECONNREFUSED' || !lstatSync(path).isSocket()) throw probeError;
      unlinkSync(path);
      await listen();
      return server;
    }
    throw new Error('A managed phone stack is already running.');
  }
  return server;
}
