import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLedger, liveEnvelope } from './live-budget.mjs';

if (
  !liveEnvelope.agentOnly ||
  !process.env.HC_SPIKE_LEDGER ||
  !process.env.HC_SPIKE_RESULTS ||
  !process.env.HC_SPIKE_CREDENTIALS
)
  throw new Error('Model-comparison arm requires explicit registered configuration');
await createLedger(process.env.HC_SPIKE_LEDGER);
const directory = path.dirname(fileURLToPath(import.meta.url));
const child = spawn(
  process.execPath,
  [path.join(directory, 'node_modules/eve/bin/eve.js'), 'eval', '--max-concurrency', '1', '--skip-report', '--verbose'],
  { cwd: path.join(directory, 'live'), env: process.env, stdio: 'inherit' }
);
child.once('error', () => {
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
