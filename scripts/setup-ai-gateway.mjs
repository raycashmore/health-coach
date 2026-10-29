import { parseArgs } from 'node:util';
import { isMain, readEnvironment, webEnvironmentPath, writePrivateEnvironment } from './development-environment.mjs';
import { parseGatewayKey, runPrivateCommand } from './private-command.mjs';

export function createDevelopmentGatewayKey(
  team,
  { run = runPrivateCommand, save = writePrivateEnvironment, read = readEnvironment } = {}
) {
  if (!team || !/^[A-Za-z0-9_-]+$/.test(team)) throw new Error('Provide the intended Vercel team with --team.');
  if (read(webEnvironmentPath).AI_GATEWAY_API_KEY) {
    throw new Error('A server Gateway key is already configured; it was left unchanged.');
  }
  const key = parseGatewayKey(
    run('vercel', [
      'ai-gateway',
      'api-keys',
      'create',
      '--scope',
      team,
      '--name',
      'Health Coach local development',
      '--limit',
      '1',
      '--refresh-period',
      'none',
      '--expiration',
      '7d'
    ])
  );
  save(webEnvironmentPath, { AI_GATEWAY_API_KEY: key });
}

if (isMain(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { team: { type: 'string' } } });
    createDevelopmentGatewayKey(values.team);
    console.log(
      'Gateway key saved in ignored server configuration: US$1 total limit, seven-day expiry. AI was not enabled.'
    );
  } catch {
    console.error(
      'Gateway key setup did not complete. Existing keys are not overwritten. If creation succeeded but saving failed, revoke the key named Health Coach local development in Vercel. No private command output is printed.'
    );
    process.exitCode = 1;
  }
}
