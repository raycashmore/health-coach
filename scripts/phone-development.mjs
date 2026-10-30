import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync, chmodSync, fchmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  isMain,
  mobileEnvironmentPath,
  projectRoot,
  readEnvironment,
  requireLocalSupabase,
  webEnvironmentPath,
  writePrivateEnvironment
} from './development-environment.mjs';
import { runPrivateCommand } from './private-command.mjs';

const ports = [8081, 54321, 3000];
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

export function selectDevice(output, requested) {
  const devices = output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 2);
  const candidates = requested ? devices.filter(([id]) => id === requested) : devices;
  if (candidates.length !== 1)
    throw new Error(
      'Connect one Android device, or select it with --device. For Wi-Fi, enable Wireless debugging and pair with adb pair.'
    );
  if (candidates[0][1] === 'unauthorized') throw new Error('Unlock the phone and accept Allow USB debugging.');
  if (candidates[0][1] !== 'device')
    throw new Error('The selected Android device is offline. Reconnect wireless debugging or USB.');
  return candidates[0][0];
}

export async function probeService(url, accepts, request = fetch) {
  try {
    const response = await request(url, { signal: AbortSignal.timeout(2000) });
    return (await accepts(response)) ? 'ready' : 'unexpected';
  } catch {
    return 'unreachable';
  }
}

async function serviceStates() {
  const [auth, web, metro] = await Promise.all([
    probeService('http://127.0.0.1:54321/auth/v1/health', (response) => response.ok),
    probeService('http://127.0.0.1:3000/api/wearable-review', (response) => response.status === 405),
    probeService(
      'http://127.0.0.1:8081/status',
      async (response) => response.ok && (await response.text()).includes('packager-status:running')
    )
  ]);
  return { auth, web, metro };
}

export async function checkOwnerAuthentication(environment, request = fetch) {
  if (!environment.LOCAL_OWNER_PASSWORD) return false;
  try {
    const response = await request('http://127.0.0.1:54321/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.NEXT_PUBLIC_SUPABASE_ANON_KEY },
      body: JSON.stringify({ email: 'owner@local.invalid', password: environment.LOCAL_OWNER_PASSWORD }),
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function checkMobileConfiguration(web, mobile) {
  if (
    mobile.EXPO_PUBLIC_SUPABASE_URL !== 'http://127.0.0.1:54321' ||
    mobile.EXPO_PUBLIC_HEALTH_COACH_API_URL !== 'http://127.0.0.1:3000' ||
    mobile.EXPO_PUBLIC_SUPABASE_ANON_KEY !== web.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
    throw new Error('Mobile configuration does not match the local debugging tunnel. Run pnpm dev:phone.');
  if (mobile.EXPO_PUBLIC_LOCAL_OWNER_PASSWORD && mobile.EXPO_PUBLIC_LOCAL_OWNER_PASSWORD !== web.LOCAL_OWNER_PASSWORD) {
    throw new Error('Development login prefill is out of date. Run pnpm dev:phone.');
  }
}

async function waitForService(url, accepts, stopped) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (stopped()) return;
    if ((await probeService(url, accepts)) === 'ready') return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('A development server did not become ready. Inspect the private .scratch/dev-phone logs.');
}

export async function phoneDevelopment({ start, requestedDevice }) {
  const web = readEnvironment(webEnvironmentPath);
  requireLocalSupabase(web);
  const device = selectDevice(runPrivateCommand('adb', ['devices']), requestedDevice);
  const adb = (args) => runPrivateCommand('adb', ['-s', device, ...args]);
  if (!adb(['shell', 'pm', 'path', 'com.example.healthcoach']).trim()) {
    throw new Error('Install the native development build first: pnpm --filter @health-coach/mobile android.');
  }
  const states = await serviceStates();
  if (states.auth !== 'ready')
    throw new Error('Local Supabase is unavailable. Start it without resetting data: pnpm supabase:start.');
  if (!(await checkOwnerAuthentication(web)))
    throw new Error(
      'Local owner sign-in failed. Configure a throwaway LOCAL_OWNER_PASSWORD, then run pnpm supabase:owner.'
    );
  if (start) {
    writePrivateEnvironment(mobileEnvironmentPath, {
      EXPO_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      EXPO_PUBLIC_HEALTH_COACH_API_URL: 'http://127.0.0.1:3000',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: web.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      EXPO_PUBLIC_LOCAL_OWNER_PASSWORD: web.LOCAL_OWNER_PASSWORD
    });
    for (const port of ports) adb(['reverse', `tcp:${port}`, `tcp:${port}`]);
  }
  checkMobileConfiguration(web, readEnvironment(mobileEnvironmentPath));
  const tunnels = adb(['reverse', '--list']);
  if (
    ports.some(
      (port) =>
        !tunnels.split('\n').some((line) => line.trim().split(/\s+/).slice(-2).join(' ') === `tcp:${port} tcp:${port}`)
    )
  ) {
    throw new Error('One or more debugging tunnels are missing. Run pnpm dev:phone.');
  }
  if (!start) {
    if (Object.values(states).some((state) => state !== 'ready'))
      throw new Error('Phone connection/authentication pass, but web or Metro is unavailable. Run pnpm dev:phone.');
    console.log(
      'Phone, installed app, tunnels, local configuration, owner sign-in, web and Metro checks passed. No health records were read or model requests made.'
    );
    return;
  }

  const children = [];
  const helpers = [];
  let stopping = false;
  const stop = () => {
    for (const child of [...children, ...helpers]) {
      if (child.exitCode === null) {
        try {
          process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
        } catch {
          /* Already stopped. */
        }
      }
    }
  };
  const onSignal = () => {
    stopping = true;
    stop();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const directory = resolve(projectRoot, '.scratch/dev-phone');
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    // Auxiliary processes are stopped with the stack but never end it, and start each run with a fresh log.
    const launch = (name, args, env, { auxiliary = false } = {}) => {
      const descriptor = openSync(resolve(directory, `${name}.log`), auxiliary ? 'w' : 'a', 0o600);
      fchmodSync(descriptor, 0o600);
      const child = spawn(pnpm, args, {
        cwd: projectRoot,
        env,
        stdio: ['ignore', descriptor, descriptor],
        detached: process.platform !== 'win32'
      });
      closeSync(descriptor);
      if (auxiliary) {
        helpers.push(child);
        return;
      }
      child.on('error', () => {
        stopping = true;
        stop();
        process.exitCode = 1;
      });
      children.push(child);
    };
    // CI disables Metro's file watching, so edits would never reach the phone; stdin is ignored, so Expo cannot prompt.
    const { CI: _ci, ...environmentWithoutCi } = process.env;
    if (states.web === 'unexpected' || states.metro === 'unexpected')
      throw new Error('A required port is serving an unexpected application; it was left untouched.');
    if (states.web !== 'ready')
      launch('web', ['--filter', '@health-coach/web', 'exec', 'next', 'dev', '--hostname', '127.0.0.1'], {
        ...process.env,
        ...web,
        INNGEST_DEV: '1'
      });
    if (states.metro !== 'ready') {
      launch('metro', ['--filter', '@health-coach/mobile', 'exec', 'expo', 'start', '--dev-client', '--localhost'], {
        ...environmentWithoutCi,
        ...readEnvironment(mobileEnvironmentPath),
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`
      });
    }
    // Metro strips types without checking them, so a watching tsc reports mobile type errors on every run.
    launch(
      'typecheck',
      ['--filter', '@health-coach/mobile', 'exec', 'tsc', '--noEmit', '--watch', '--preserveWatchOutput'],
      environmentWithoutCi,
      { auxiliary: true }
    );
    await Promise.all([
      waitForService(
        'http://127.0.0.1:3000/api/wearable-review',
        (response) => response.status === 405,
        () => stopping
      ),
      waitForService(
        'http://127.0.0.1:8081/status',
        async (response) => response.ok && (await response.text()).includes('packager-status:running'),
        () => stopping
      )
    ]);
    if (stopping) return;
    adb(['shell', 'am', 'force-stop', 'com.example.healthcoach']);
    adb([
      'shell',
      'am',
      'start',
      '-a',
      'android.intent.action.VIEW',
      '-d',
      'health-coach://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081',
      'com.example.healthcoach'
    ]);
    console.log(
      'Phone development is ready over localhost tunnels. Private logs: .scratch/dev-phone/. No model request was made.'
    );
    const exited = (child) =>
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise((resolve) => child.once('exit', resolve));
    if (!children.length) {
      // Every server was reused; stay up only so the type checker keeps watching until Ctrl-C.
      await Promise.all(helpers.map(exited));
      return;
    }
    await Promise.race(children.map(exited));
    if (!stopping) throw new Error('A development server exited. Inspect the private .scratch/dev-phone logs.');
  } finally {
    stop();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
  }
}

if (isMain(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: { start: { type: 'boolean', default: false }, device: { type: 'string' } }
    });
    await phoneDevelopment({ start: values.start, requestedDevice: values.device });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : 'Phone setup failed. Private command output was suppressed.'
    );
    process.exitCode = 1;
  }
}
