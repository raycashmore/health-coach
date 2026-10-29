import { spawnSync } from 'node:child_process';

// Child-process errors can embed captured stdout/stderr, including newly minted credentials.
export function runPrivateCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    ...options,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 45_000,
    maxBuffer: 1024 * 1024
  });
  if (result.error || result.status !== 0) throw new Error('Command failed; private output was suppressed.');
  return result.stdout;
}

export function parseGatewayKey(output) {
  const key = output.trim();
  if (!/^vck_[A-Za-z0-9_-]+$/.test(key)) {
    throw new Error('Unexpected Gateway credential format; private output was suppressed.');
  }
  return key;
}
