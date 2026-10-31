import { isMain, readEnvironment, webEnvironmentPath } from './development-environment.mjs';

export async function runModelSmoke({ allowPaid, model, generate }) {
  if (!allowPaid) throw new Error('Explicit --allow-paid is required. This check invokes the configured model once.');
  if (!model || !/^[a-z0-9.-]+\/[a-z0-9._-]+$/.test(model))
    throw new Error('Configure WEARABLE_REVIEW_MODEL in the server environment first.');
  const { buildWearableReview, dateInZone, shiftDate } = await import('../packages/health-core/src/wearable-review.ts');
  const now = new Date();
  const completedBefore = dateInZone(now, 'UTC');
  const input = buildWearableReview(
    {
      timeZone: 'UTC',
      completedBefore,
      sleepGrouping: 'next-wake-day',
      syncedAt: now.toISOString(),
      days: Array.from({ length: 21 }, (_, index) => ({
        date: shiftDate(completedBefore, index - 21),
        steps: { value: 5000, origins: ['example.synthetic-source'] },
        sleepMinutes: null
      }))
    },
    now
  );
  const explain = generate ?? (await import('../apps/web/lib/explain-wearable-review.ts')).explainWearableReview;
  const result = await explain(input, model);
  return {
    passed: true,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    elapsedMs: result.elapsedMs
  };
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--allow-paid') {
      throw new Error('Use pnpm ai:smoke --allow-paid to authorize one synthetic generation.');
    }
    const environment = readEnvironment(webEnvironmentPath);
    if (!environment.AI_GATEWAY_API_KEY) throw new Error('Configure the server Gateway key first.');
    process.env.AI_GATEWAY_API_KEY = environment.AI_GATEWAY_API_KEY;
    console.log(JSON.stringify(await runModelSmoke({ allowPaid: true, model: environment.WEARABLE_REVIEW_MODEL })));
  } catch {
    console.error(
      'Model readiness was not established. Use --allow-paid and verify the configured model, key and Gateway account permissions. Private requests, responses and errors are suppressed.'
    );
    process.exitCode = 1;
  }
}
