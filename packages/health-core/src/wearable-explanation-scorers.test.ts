import { describe, expect, it } from 'vitest';
import { scoreWearableExplanation } from './wearable-explanation-scorers.js';
import { buildWearableReview, shiftDate } from './wearable-review.js';
import type { WearableExplanation, WearableSnapshot } from './wearable-review.js';

const asOf = new Date('2026-10-28T03:00:00Z');

function review(options: { sleepSources?: (index: number) => string[] } = {}) {
  const snapshot: WearableSnapshot = {
    completedBefore: '2026-10-28',
    sleepGrouping: 'next-wake-day',
    timeZone: 'Australia/Sydney',
    syncedAt: asOf.toISOString(),
    days: Array.from({ length: 21 }, (_, index) => ({
      date: shiftDate('2026-10-28', index - 21),
      steps: { value: index < 18 ? 5000 : 8000, origins: ['example.source'] },
      sleepMinutes: {
        value: index < 18 ? 450 : 360,
        origins: options.sleepSources?.(index) ?? ['example.source']
      }
    }))
  };
  return buildWearableReview(snapshot, asOf);
}

function explanation(overrides: Partial<WearableExplanation> = {}): WearableExplanation {
  return {
    observation:
      'Over the last 3 days you averaged 8,000 steps a day, 3,000 more than the 5,000 a day over the 18 days before. Sleep averaged 6 hours, 1 hour 30 minutes less than the earlier 7 hours 30 minutes.',
    evidenceIds: ['steps', 'sleepMinutes'],
    uncertainty: null,
    contextQuestion: null,
    ...overrides
  };
}

describe('wearable explanation scoring', () => {
  it('passes a concise, grounded explanation with hours and minutes and no caveat', () => {
    expect(scoreWearableExplanation(explanation(), review())).toEqual([]);
  });

  it('flags a figure that cannot be derived from the evidence, including derived statistics', () => {
    const input = review();
    const invented = explanation({ observation: 'Steps rose 9,500 a day.' });
    const percentage = explanation({ observation: 'Steps rose 60% over the earlier days.' });
    expect(scoreWearableExplanation(invented, input)).toContain('ungrounded-number');
    expect(scoreWearableExplanation(percentage, input)).toContain('ungrounded-number');
    expect(scoreWearableExplanation(explanation({ observation: 'Steps ended on 2026-10-01.' }), input)).toContain(
      'ungrounded-number'
    );
  });

  it('accepts rounded step figures and decimal hours that match the evidence', () => {
    const rounded = explanation({ observation: 'About 8,000 steps a day, with sleep near 6.0 hours.' });
    expect(scoreWearableExplanation(rounded, review())).toEqual([]);
  });

  it('flags sleep written as raw minutes of an hour or more but not short durations', () => {
    const input = review();
    expect(
      scoreWearableExplanation(explanation({ observation: 'Sleep averaged 360 minutes, 90 minutes less.' }), input)
    ).toContain('sleep-in-raw-minutes');
    expect(
      scoreWearableExplanation(explanation({ observation: 'Sleep averaged 6 hours, 1 hour 30 minutes less.' }), input)
    ).not.toContain('sleep-in-raw-minutes');
  });

  it('flags mention of the exploratory display threshold the owner cannot see', () => {
    const failures = scoreWearableExplanation(
      explanation({ observation: 'Steps rose past the exploratory display threshold: 8,000 a day.' }),
      review()
    );
    expect(failures).toContain('exposed-display-threshold');
  });

  it('flags a caveat when sources did not change, and a boilerplate disclaimer anywhere', () => {
    const input = review();
    expect(
      scoreWearableExplanation(explanation({ uncertainty: 'This short comparison is only a rough guide.' }), input)
    ).toContain('unneeded-caveat');
    expect(
      scoreWearableExplanation(
        explanation({ observation: 'Steps rose to 8,000 a day. This is not medical advice.' }),
        input
      )
    ).toContain('unneeded-caveat');
  });

  it('allows a source-change caveat for a discussed signal when contributing sources varied', () => {
    const input = review({ sleepSources: (index) => (index < 10 ? ['example.band'] : ['example.phone']) });
    const caveat = 'Sleep sources changed across days, so the difference may reflect source or priority changes.';
    expect(scoreWearableExplanation(explanation({ uncertainty: caveat }), input)).toEqual([]);
    expect(scoreWearableExplanation(explanation({ evidenceIds: ['steps'], uncertainty: caveat }), input)).toContain(
      'unneeded-caveat'
    );
  });

  it('flags diagnosis, recovery, advice and causal claims the prompt prohibits', () => {
    const input = review();
    for (const observation of [
      'Steps rose to 8,000 a day, a sign of recovery.',
      'Steps rose to 8,000 a day; you should keep walking.',
      'Sleep fell, probably caused by stress.'
    ]) {
      expect(scoreWearableExplanation(explanation({ observation }), input)).toContain('out-of-scope-claim');
    }
  });

  it('reports every failure of a response mirroring the owner-rated Not useful pattern', () => {
    const failures = scoreWearableExplanation(
      explanation({
        observation:
          'Sleep averaged 360 minutes, crossing the exploratory display threshold, 90 minutes below the earlier 450 minutes.',
        evidenceIds: ['sleepMinutes'],
        uncertainty: 'This is not medical advice and the comparison is exploratory.'
      }),
      review()
    );
    expect(failures).toHaveLength(3);
    expect(failures).toEqual(
      expect.arrayContaining(['sleep-in-raw-minutes', 'exposed-display-threshold', 'unneeded-caveat'])
    );
  });
  it('flags percentages and years that are not part of the evidence dates', () => {
    const input = review();
    expect(scoreWearableExplanation(explanation({ observation: 'Steps were 60% higher.' }), input)).toContain(
      'ungrounded-number'
    );
    expect(scoreWearableExplanation(explanation({ observation: 'Steps ended on 3 March 2031.' }), input)).toContain(
      'ungrounded-number'
    );
  });

  it('flags raw sleep minutes when the model copies the evidence unit wording', () => {
    const failures = scoreWearableExplanation(
      explanation({ observation: 'Sleep averaged 360 recorded sleep minutes a day.' }),
      review()
    );
    expect(failures).toContain('sleep-in-raw-minutes');
  });

  it('does not flag an echo of the exploratory limitation or a source-change caveat phrased as "due to"', () => {
    const input = review({ sleepSources: (index) => (index < 10 ? ['example.band'] : ['example.phone']) });
    const failures = scoreWearableExplanation(
      explanation({
        observation: 'In this exploratory comparison, steps averaged 8,000 a day.',
        uncertainty: 'The sleep difference may be due to a source change.'
      }),
      input
    );
    expect(failures).toEqual([]);
  });

  it('allows a caveat about a signal that could not be compared, using its coverage counts', () => {
    const snapshot: WearableSnapshot = {
      completedBefore: '2026-10-28',
      sleepGrouping: 'next-wake-day',
      timeZone: 'Australia/Sydney',
      syncedAt: asOf.toISOString(),
      days: Array.from({ length: 21 }, (_, index) => ({
        date: shiftDate('2026-10-28', index - 21),
        steps: { value: index < 18 ? 5000 : 8000, origins: ['example.source'] },
        sleepMinutes: index === 19 ? null : { value: 400, origins: ['example.source'] }
      }))
    };
    const input = buildWearableReview(snapshot, asOf);
    const caveat = 'Sleep had records on only 2 of the 3 recent days, so it is not compared.';
    expect(
      scoreWearableExplanation(
        explanation({ evidenceIds: ['steps'], observation: 'Steps averaged 8,000 a day.', uncertainty: caveat }),
        input
      )
    ).toEqual([]);
  });

  it('flags reassurance about health status', () => {
    expect(
      scoreWearableExplanation(explanation({ observation: 'Steps rose to 8,000 a day, which is normal.' }), review())
    ).toContain('out-of-scope-claim');
  });
});
