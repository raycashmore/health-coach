import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export const webEnvironmentPath = resolve(projectRoot, 'apps/web/.env.local');
export const mobileEnvironmentPath = resolve(projectRoot, 'apps/mobile/.env.local');

export function readEnvironment(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
}

export function writePrivateEnvironment(path, values) {
  let contents = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Z_]+$/.test(name) || /[\r\n]/.test(value)) throw new Error('Invalid environment setting.');
    const encoded = [JSON.stringify(value), `'${value}'`].find(
      (candidate) => parseEnv(`VALUE=${candidate}`).VALUE === value
    );
    if (encoded === undefined) throw new Error('Environment value could not be encoded safely.');
    const line = `${name}=${encoded}`;
    const pattern = new RegExp(`^${name}=.*$`, 'm');
    contents = pattern.test(contents) ? contents.replace(pattern, () => line) : `${contents.trimEnd()}\n${line}\n`;
  }
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, contents, { mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, path);
}

export function requireLocalSupabase(environment) {
  let url;
  try {
    url = new URL(environment.NEXT_PUBLIC_SUPABASE_URL);
  } catch {
    throw new Error('Configure local Supabase first: pnpm supabase:start.');
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '54321' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error('Phone tooling requires local Supabase on port 54321; remote targets are left untouched.');
  }
  if (!environment.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Local Supabase client key is missing.');
}

export function isMain(moduleUrl) {
  return Boolean(process.argv[1] && fileURLToPath(moduleUrl) === resolve(process.argv[1]));
}
