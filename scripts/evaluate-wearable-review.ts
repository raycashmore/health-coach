import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  explanationFailureCodes,
  scoreWearableExplanation
} from '@health-coach/health-core/wearable-explanation-scorers';
import type { ExplanationFailure } from '@health-coach/health-core/wearable-explanation-scorers';
import {
  buildWearableReview,
  validateWearableExplanation,
  wearableMetrics,
  wearableSnapshotSchema
} from '@health-coach/health-core/wearable-review';

const ratings = ['useful', 'not-useful', 'concerning'] as const;
const caseSchema = z.object({
  snapshot: wearableSnapshotSchema,
  asOf: z.string().datetime(),
  expectedStatus: z.enum(['change', 'no-change', 'insufficient-data']),
  expectedEvidenceIds: z.array(z.enum(wearableMetrics)),
  explanation: z.unknown().optional(),
  ownerRating: z.enum(ratings).optional()
});

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Provide a private JSON case-set path. No model calls are made.');
  const cases = z
    .array(caseSchema)
    .min(1)
    .parse(JSON.parse(await readFile(path, 'utf8')));
  let statusPasses = 0;
  let retrievalPasses = 0;
  let explanationPasses = 0;
  let explanationCount = 0;
  let flaggedExplanations = 0;
  const failureCounts = Object.fromEntries(explanationFailureCodes.map((code) => [code, 0])) as Record<
    ExplanationFailure,
    number
  >;
  const byRating = Object.fromEntries(ratings.map((rating) => [rating, { explanations: 0, flagged: 0 }])) as Record<
    (typeof ratings)[number],
    { explanations: number; flagged: number }
  >;
  for (const entry of cases) {
    try {
      const input = buildWearableReview(entry.snapshot, new Date(entry.asOf));
      if (input.status === entry.expectedStatus) statusPasses += 1;
      if (
        JSON.stringify(input.evidence.map((item) => item.id).sort()) ===
        JSON.stringify([...entry.expectedEvidenceIds].sort())
      )
        retrievalPasses += 1;
      if (entry.explanation !== undefined) {
        explanationCount += 1;
        try {
          const explanation = validateWearableExplanation(entry.explanation, input);
          explanationPasses += 1;
          const failures = scoreWearableExplanation(explanation, input);
          for (const code of failures) failureCounts[code] += 1;
          if (failures.length > 0) flaggedExplanations += 1;
          if (entry.ownerRating) {
            byRating[entry.ownerRating].explanations += 1;
            if (failures.length > 0) byRating[entry.ownerRating].flagged += 1;
          }
        } catch {
          /* Count only; never print private content. */
        }
      }
    } catch {
      /* An invalid replay is a failed case. */
    }
  }
  console.log(
    JSON.stringify({
      caseCount: cases.length,
      statusPasses,
      retrievalPasses,
      explanationCount,
      explanationPasses,
      flaggedExplanations,
      failureCounts,
      byRating
    })
  );
  if (
    statusPasses !== cases.length ||
    retrievalPasses !== cases.length ||
    explanationPasses !== explanationCount ||
    flaggedExplanations > 0
  )
    process.exitCode = 1;
}
main().catch(() => {
  console.error('Wearable evaluation failed. Check the private file format and replay boundaries.');
  process.exitCode = 1;
});
