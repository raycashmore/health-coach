import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLedger, liveEnvelope } from './live-budget.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes('--live');
if (!live && !process.argv.includes('--fixture'))
  throw new Error('Choose --fixture or the owner-approved --live comparison');
if (live && process.argv.includes('--fixture')) throw new Error('Choose one transport');
const output = path.join(directory, '.eve', live ? 'approved-comparison' : `fixture-${Date.now()}`);
let credentialsFile;
if (live) {
  credentialsFile =
    process.env.HC_SPIKE_CREDENTIALS ?? path.resolve(directory, '../../private-data/retrieval-cloud/credentials.env');
  const values = parseEnv(await readFile(credentialsFile, 'utf8'));
  if (!values.AI_GATEWAY_API_KEY?.trim()) throw new Error('Approved Gateway credential unavailable');
  const response = await fetch('https://ai-gateway.vercel.sh/v1/models', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Cannot verify current pricing');
  const { data } = await response.json();
  const model = data.find((item) => item.id === liveEnvelope.model);
  if (
    !model?.tags?.includes('tool-use') ||
    Number(model.pricing?.input) > 0.0000004 ||
    Number(model.pricing?.output) > 0.0000016 ||
    !Number(model.pricing?.input) ||
    !Number(model.pricing?.output)
  )
    throw new Error('Model/pricing no longer fits the approved reservation');
}
await mkdir(output, { recursive: true, mode: 0o700 });
if (!live) {
  credentialsFile = path.join(output, 'fixture.env');
  await writeFile(credentialsFile, 'AI_GATEWAY_API_KEY=placeholder', { mode: 0o600 });
}
const ledgerFile = path.join(output, 'ledger.json');
// Exclusive creation prevents a second paid comparison, including after a crash.
await createLedger(ledgerFile);
const child = spawn(
  process.execPath,
  [path.join(directory, 'node_modules/eve/bin/eve.js'), 'eval', '--max-concurrency', '1', '--skip-report', '--verbose'],
  {
    cwd: path.join(directory, 'live'),
    env: {
      ...process.env,
      EVE_TELEMETRY_DISABLED: '1',
      HC_SPIKE_DRY_RUN: live ? '0' : '1',
      HC_SPIKE_LEDGER: ledgerFile,
      HC_SPIKE_CREDENTIALS: credentialsFile,
      HC_SPIKE_RESULTS: output
    },
    stdio: 'inherit'
  }
);
child.on('error', () => {
  process.exitCode = 1;
});
child.on('exit', async (code) => {
  process.exitCode = code ?? 1;
  const ledger = JSON.parse(await readFile(ledgerFile, 'utf8'));
  const tokens = ledger.requests.reduce((sum, row) => sum + (row.tokenCostNanoUsd ?? 0), 0) / 1e9;
  console.log(
    JSON.stringify({
      transport: live ? 'live' : 'fixture',
      requests: ledger.requests.length,
      knownTokenCostUsdAtReservedRates: tokens,
      unknownCostRequests: ledger.requests.filter((row) => row.tokenCostNanoUsd === undefined).length,
      committedReservationUsd: ledger.requests.length * 0.0176,
      outputDirectory: path.relative(directory, output)
    })
  );
});
