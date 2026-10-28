import { describe, expect, it } from 'vitest';
import { buildWearableReview, shiftDate, validateWearableExplanation } from './wearable-review.js';
import type { WearableSnapshot } from './wearable-review.js';

const asOf = new Date('2026-10-28T03:00:00Z');
function snapshot(): WearableSnapshot {
  return {
    completedBefore: '2026-10-28',
    timeZone: 'Australia/Sydney',
    syncedAt: asOf.toISOString(),
    days: Array.from({ length: 21 }, (_, index) => ({
      date: shiftDate('2026-10-28', index - 21),
      steps: { value: index < 18 ? 5000 : 8000, origins: ['example.source'] },
      sleepMinutes: null
    }))
  };
}

describe('wearable comparison and replay', () => {
  it('compares completed windows and exposes the exact supporting values and coverage', () => {
    const review = buildWearableReview(snapshot(), asOf);
    expect(review.status).toBe('change');
    expect(review.evidence[0]).toMatchObject({
      recentMean: 8000,
      baselineMean: 5000,
      difference: 3000,
      recentDays: 3,
      baselineDays: 18
    });
    expect(review.coverage[1]).toMatchObject({ days: 0, comparable: false });
  });
  it('does not convert missing days into zero or compare an incomplete recent window', () => {
    const input = snapshot();
    input.days[20]!.steps = null;
    expect(buildWearableReview(input, asOf).status).toBe('insufficient-data');
    input.days[20]!.steps = { value: 0, origins: ['example.source'] };
    expect(buildWearableReview(input, asOf).evidence[0]?.recentDays).toBe(3);
  });
  it('does not infer a meaningful change from stable recorded totals', () => {
    const input = snapshot();
    for (const day of input.days) day.steps!.value = 5000;
    expect(buildWearableReview(input, asOf).status).toBe('no-change');
  });
  it('withholds comparisons when device origins change', () => {
    const input = snapshot();
    input.days[20]!.steps!.origins = ['example.other-source'];
    const result = buildWearableReview(input, asOf);
    expect(result.status).toBe('insufficient-data');
    expect(result.coverage[0]?.origins).toEqual(['example.other-source', 'example.source']);
  });
  it('rejects unfinished/future days, duplicates, stale sync and future sync', () => {
    const future = snapshot();
    future.days[20]!.date = '2026-10-28';
    expect(() => buildWearableReview(future, asOf)).toThrow();
    const duplicate = snapshot();
    duplicate.days[20]!.date = duplicate.days[19]!.date;
    expect(() => buildWearableReview(duplicate, asOf)).toThrow();
    expect(() => buildWearableReview(snapshot(), new Date('2026-10-28T05:00:00Z'))).toThrow();
    expect(() => buildWearableReview(snapshot(), new Date('2026-10-28T02:00:00Z'))).toThrow();
  });
  it('replays a historical snapshot only at its original time boundary', () => {
    const input = snapshot();
    expect(buildWearableReview(input, asOf).evidence).toHaveLength(1);
    expect(() => buildWearableReview(input, new Date('2026-10-29T03:00:00Z'))).toThrow();
  });
  it('rejects explanations citing unavailable signals', () => {
    const input = buildWearableReview(snapshot(), asOf);
    const explanation = {
      observation: 'Recorded steps changed.',
      uncertainty: 'Wear time is unknown.',
      contextQuestion: 'Was the routine unusual?',
      evidenceIds: ['steps']
    };
    expect(validateWearableExplanation(explanation, input)).toEqual(explanation);
    expect(() => validateWearableExplanation({ ...explanation, evidenceIds: ['sleepMinutes'] }, input)).toThrow();
  });
});
