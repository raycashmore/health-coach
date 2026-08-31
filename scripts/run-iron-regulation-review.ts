import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { runIronRegulationReview } from '../apps/web/lib/run-iron-regulation-review';

type ReviewTarget = 'local';

function getReviewTarget(): ReviewTarget {
  const target = process.argv.at(2);
  const value = process.argv.at(3);

  if (target === '--target' && value === 'local') {
    return value;
  }

  throw new Error('Usage: tsx scripts/run-iron-regulation-review.ts --target local');
}

async function main(): Promise<void> {
  getReviewTarget();
  const environmentFile = resolve(process.cwd(), 'apps/web/.env.local');
  await access(environmentFile, constants.R_OK);
  process.loadEnvFile(environmentFile);

  const outcome = await runIronRegulationReview();
  console.log(
    outcome === 'stored'
      ? 'Stored the bounded iron-regulation Health Review.'
      : 'No bounded iron-regulation Health Review is applicable.'
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'The bounded iron-regulation Health Review could not run.';
  console.error(message);
  process.exitCode = 1;
});
