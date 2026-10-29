import { z } from 'zod';

export const wearableCalculationVersion = '2';
export const wearablePromptVersion = '3';
export const wearableMetrics = ['steps', 'sleepMinutes'] as const;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const measurementSchema = z.object({
  value: z.number().finite().nonnegative(),
  origins: z
    .array(z.string().min(1).max(200))
    .min(1)
    .max(20)
    .transform((origins) => [...new Set(origins)].sort())
});

export const wearableSnapshotSchema = z.object({
  timeZone: z
    .string()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
  syncedAt: z.string().datetime(),
  completedBefore: dateSchema,
  days: z
    .array(
      z.object({
        date: dateSchema,
        steps: measurementSchema.nullable(),
        sleepMinutes: measurementSchema.extend({ value: z.number().finite().min(0).max(1500) }).nullable()
      })
    )
    .length(21)
});

export type WearableSnapshot = z.infer<typeof wearableSnapshotSchema>;

export const wearableReviewRequestSchema = z.object({
  snapshot: wearableSnapshotSchema,
  question: z.string().trim().max(500).default('')
});

export type WearableEvidence = {
  id: (typeof wearableMetrics)[number];
  unit: 'steps/day' | 'recorded sleep minutes/day';
  recentMean: number;
  baselineMean: number;
  difference: number;
  recentDays: number;
  baselineDays: number;
  recentStart: string;
  baselineStart: string;
  endDate: string;
  origins: string[];
  notable: boolean;
};

export type WearableReviewInput = {
  calculationVersion: string;
  status: 'change' | 'no-change' | 'insufficient-data';
  evidence: WearableEvidence[];
  coverage: {
    metric: (typeof wearableMetrics)[number];
    days: number;
    recentDays: number;
    baselineDays: number;
    comparable: boolean;
    origins: string[];
    originsChanged: boolean;
  }[];
  limitations: string[];
};

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateInZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Replay with an explicit asOf; later observations and unfinished days are rejected. */
export function buildWearableReview(value: unknown, asOf = new Date()): WearableReviewInput {
  const snapshot = wearableSnapshotSchema.parse(value);
  if (snapshot.completedBefore !== dateInZone(asOf, snapshot.timeZone)) {
    throw new Error('Read the latest completed days before reviewing.');
  }
  const age = asOf.getTime() - Date.parse(snapshot.syncedAt);
  if (age < -60_000 || age > 60 * 60 * 1000) {
    throw new Error('The wearable read is stale or from the future. Read again.');
  }
  snapshot.days.forEach((day, index) => {
    if (day.date !== shiftDate(snapshot.completedBefore, index - 21)) {
      throw new Error('Expected 21 consecutive completed days without duplicates.');
    }
  });
  const evidence: WearableEvidence[] = [];
  const coverage: WearableReviewInput['coverage'] = [];
  for (const metric of wearableMetrics) {
    const measured = snapshot.days.filter((day) => day[metric] !== null);
    const recent = snapshot.days.slice(-3).flatMap((day) => (day[metric] ? [day[metric]] : []));
    const baseline = snapshot.days.slice(0, -3).flatMap((day) => (day[metric] ? [day[metric]] : []));
    const originKeys = new Set(measured.map((day) => [...day[metric]!.origins].sort().join('|')));
    // Native Health Connect aggregates already deduplicate activity and sleep by user priority.
    // Contributors may vary without invalidating a comparison of the recorded totals.
    const comparable = recent.length === 3 && baseline.length >= 7;
    const origins = [...new Set(measured.flatMap((day) => day[metric]!.origins))].sort();
    coverage.push({
      metric,
      days: measured.length,
      recentDays: recent.length,
      baselineDays: baseline.length,
      comparable,
      origins,
      originsChanged: originKeys.size > 1
    });
    if (!comparable) continue;
    const average = (items: typeof recent) => items.reduce((sum, item) => sum + item.value, 0) / items.length;
    const round = (number: number) => Math.round(number * 10) / 10;
    const recentMean = average(recent);
    const baselineMean = average(baseline);
    const difference = recentMean - baselineMean;
    // Exploratory display thresholds, not clinical limits or significance tests.
    const threshold = metric === 'steps' ? Math.max(1000, baselineMean * 0.2) : 45;
    evidence.push({
      id: metric,
      unit: metric === 'steps' ? 'steps/day' : 'recorded sleep minutes/day',
      recentMean: round(recentMean),
      baselineMean: round(baselineMean),
      difference: round(difference),
      recentDays: recent.length,
      baselineDays: baseline.length,
      recentStart: shiftDate(snapshot.completedBefore, -3),
      baselineStart: shiftDate(snapshot.completedBefore, -21),
      endDate: shiftDate(snapshot.completedBefore, -1),
      origins,
      notable: Math.abs(difference) >= threshold
    });
  }
  return {
    calculationVersion: wearableCalculationVersion,
    status:
      evidence.length === 0 ? 'insufficient-data' : evidence.some((item) => item.notable) ? 'change' : 'no-change',
    evidence,
    coverage,
    limitations: [
      'Recorded totals do not establish complete device wear or explain a cause.',
      'Sleep is the Health Connect recorded duration within local midnight-to-midnight windows, not a last-night score.',
      'The short comparison is exploratory; weekday mix, travel and source changes can affect it.',
      'Only steps and recorded sleep are reviewed. Labs, genetics and other signals are not assessed.',
      ...coverage
        .filter((item) => item.originsChanged)
        .map(
          (item) =>
            `${item.metric === 'steps' ? 'Steps' : 'Recorded sleep'}: contributing sources vary across days. Source or priority changes may affect the recorded difference.`
        ),
      ...coverage
        .filter((item) => !item.comparable)
        .map(
          (item) =>
            `${item.metric === 'steps' ? 'Steps' : 'Recorded sleep'}: ${item.recentDays}/3 recent days and ${item.baselineDays}/18 baseline days with records. Need all 3 recent days and at least 7 baseline days.`
        )
    ]
  };
}

export const wearableExplanationSchema = z.object({
  observation: z.string().min(1).max(1200),
  evidenceIds: z.array(z.enum(wearableMetrics)).min(1).max(2),
  uncertainty: z.string().min(1).max(600),
  contextQuestion: z.string().min(1).max(300)
});
export type WearableExplanation = z.infer<typeof wearableExplanationSchema>;

export function validateWearableExplanation(value: unknown, input: WearableReviewInput): WearableExplanation {
  const explanation = wearableExplanationSchema.parse(value);
  if (
    input.status === 'insufficient-data' ||
    explanation.evidenceIds.some((id) => !input.evidence.some((item) => item.id === id))
  ) {
    throw new Error('The explanation references unavailable evidence.');
  }
  return explanation;
}
