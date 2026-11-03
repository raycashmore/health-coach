import { mkdir, open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cases, syntheticCase } from './investigation/fixtures.mjs';
import { runInvestigation } from './investigation/run.mjs';
import { createGatewayComparison, verifyGatewayCatalog } from './investigation/gateway.mjs';

// Exact opt-in, a fresh ignored output directory and a supplied existing key are required.
// This entry point never creates a credential or changes a remote budget.
const allowanceText = process.argv[3];
const allowanceUsd = Number(allowanceText);
if (
  process.argv.length !== 4 ||
  process.argv[2] !== '--allow-usd' ||
  !/^\d+\.\d{2}$/.test(allowanceText ?? '') ||
  !Number.isFinite(allowanceUsd) ||
  allowanceUsd <= 0 ||
  allowanceUsd > 1.28
) {
  console.error('Paid execution requires --allow-usd with an owner-approved amount up to 1.28 (two decimals).');
  process.exitCode = 1;
} else if (!process.env.AI_GATEWAY_API_KEY) {
  console.error('Supply the existing Gateway key through the environment.');
  process.exitCode = 1;
} else {
  try {
    await verifyGatewayCatalog();
    await mkdir(resolve('outputs'), { recursive: true, mode: 0o700 });
    const directory = resolve('outputs', `investigation-${Date.now()}`);
    await mkdir(directory, { mode: 0o700 });
    const ledger = await open(resolve(directory, 'spend.jsonl'), 'wx', 0o600);
    try {
      const comparison = createGatewayComparison({
        apiKey: process.env.AI_GATEWAY_API_KEY,
        allowanceUsd,
        record: async (event) => {
          await ledger.writeFile(`${JSON.stringify(event)}\n`);
          await ledger.sync();
        }
      });
      const results = [];
      for (const item of cases)
        for (const mode of ['agent', 'fixed']) {
          const arm = comparison.requestFor(`${mode}:${item.id}`);
          const result = await runInvestigation({
            fixture: syntheticCase(item.id),
            mode,
            request: arm.request,
            execution: 'gateway'
          });
          results.push({
            case: item.id,
            arm: mode,
            expected: item.expected,
            ...result,
            metrics: { ...result.metrics, ...arm.metrics() },
            rubric: 'unverified',
            ownerRating: 'unverified',
            comprehension: 'unverified'
          });
          await writeFile(resolve(directory, 'results.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
          if (comparison.stopped) throw new Error('comparison-stopped');
        }
      console.log(
        `Synthetic comparison saved locally: ${directory}. Manual rubric and owner ratings remain unverified.`
      );
    } finally {
      await ledger.close();
    }
  } catch {
    console.error(
      'Comparison stopped. Inspect the local ledger before any new paid attempt; no automatic retry was made.'
    );
    process.exitCode = 1;
  }
}
