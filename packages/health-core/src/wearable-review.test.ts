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
    expect(review.coverage[0]).toMatchObject({ originsChanged: false, recentDays: 3, baselineDays: 18 });
  });
  it('does not convert missing days into zero or compare an incomplete recent window', () => {
    const input = snapshot();
    input.days[20]!.steps = null;
    const missing = buildWearableReview(input, asOf);
    expect(missing.status).toBe('insufficient-data');
    expect(missing.limitations).toContain(
      'Steps: 2/3 recent days and 18/18 baseline days with records. Need all 3 recent days and at least 7 baseline days.'
    );
    input.days[20]!.steps = { value: 0, origins: ['example.source'] };
    expect(buildWearableReview(input, asOf).evidence[0]?.recentDays).toBe(3);
  });
  it('requires seven baseline days and reports the missing coverage', () => {
    const input = snapshot();
    for (const day of input.days.slice(0, 12)) day.steps = null;
    const missing = buildWearableReview(input, asOf);
    expect(missing.status).toBe('insufficient-data');
    expect(missing.coverage[0]).toMatchObject({ recentDays: 3, baselineDays: 6, comparable: false });
    input.days[11]!.steps = { value: 5000, origins: ['example.source'] };
    expect(buildWearableReview(input, asOf).evidence[0]?.baselineDays).toBe(7);
  });
  it('treats a different ordering of the same contributors as stable', () => {
    const input = snapshot();
    input.days.forEach((day, index) => {
      day.steps!.origins = index % 2 ? ['example.band', 'example.phone'] : ['example.phone', 'example.band'];
    });
    expect(buildWearableReview(input, asOf).coverage[0]?.originsChanged).toBe(false);
  });
  it('allows recorded sleep comparisons after a source replacement but warns about recording differences', () => {
    const input = snapshot();
    input.days.forEach((day, index) => {
      day.sleepMinutes = { value: index < 18 ? 420 : 480, origins: [index < 18 ? 'example.old' : 'example.new'] };
    });
    const result = buildWearableReview(input, asOf);
    expect(result.evidence.find((item) => item.id === 'sleepMinutes')).toMatchObject({ difference: 60 });
    expect(result.coverage[1]).toMatchObject({ originsChanged: true, comparable: true });
    expect(result.limitations).toContain(
      'Recorded sleep: contributing sources vary across days. Source or priority changes may affect the recorded difference.'
    );
  });
  it('does not infer a meaningful change from stable recorded totals', () => {
    const input = snapshot();
    for (const day of input.days) day.steps!.value = 5000;
    expect(buildWearableReview(input, asOf).status).toBe('no-change');
  });
  it('compares native aggregate totals when contributing sources vary and exposes the uncertainty', () => {
    const input = snapshot();
    input.days[20]!.steps!.origins = ['example.source', 'example.phone'];
    const result = buildWearableReview(input, asOf);
    expect(result.status).toBe('change');
    expect(result.evidence[0]).toMatchObject({ recentMean: 8000, baselineMean: 5000 });
    expect(result.coverage[0]).toMatchObject({ originsChanged: true, comparable: true });
    expect(result.coverage[0]?.origins).toEqual(['example.phone', 'example.source']);
    expect(result.limitations).toContain(
      'Steps: contributing sources vary across days. Source or priority changes may affect the recorded difference.'
    );
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
