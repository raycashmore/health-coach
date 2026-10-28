import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import type { WearableReviewInput } from '@health-coach/health-core/wearable-review';
import { explainWearableReview } from './explain-wearable-review';

const input: WearableReviewInput = {
  calculationVersion: '2',
  status: 'change',
  coverage: [
    {
      metric: 'steps',
      days: 21,
      recentDays: 3,
      baselineDays: 18,
      comparable: true,
      origins: ['example.private-origin'],
      originsChanged: true
    }
  ],
  limitations: ['Wear time is unknown.'],
  evidence: [
    {
      id: 'steps',
      unit: 'steps/day',
      recentMean: 8000,
      baselineMean: 5000,
      difference: 3000,
      recentDays: 3,
      baselineDays: 18,
      recentStart: '2026-10-25',
      baselineStart: '2026-10-07',
      endDate: '2026-10-27',
      origins: ['example.private-origin'],
      notable: true
    }
  ]
};
const explanation = {
  observation: 'Recorded steps increased.',
  evidenceIds: ['steps'],
  uncertainty: 'Wear time is unknown.',
  contextQuestion: 'Was your routine different?'
};
function model(output: object) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined }
      },
      warnings: []
    }
  });
}
describe('bounded model explanation', () => {
  it('uses SDK structured generation, returns usage and supplies only derived evidence', async () => {
    const provider = model(explanation);
    const result = await explainWearableReview(input, provider);
    expect(result.explanation).toEqual(explanation);
    expect(result.inputTokens).toBe(10);
    const prompt = JSON.stringify(provider.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('baselineMean');
    expect(prompt).not.toContain('example.private-origin');
    expect(prompt).toContain('originsChanged');
    expect(prompt).toContain('explicitly state that source or priority changes');
    expect(provider.doGenerateCalls).toHaveLength(1);
  });
  it('rejects model output referencing a signal that was not supplied', async () => {
    await expect(
      explainWearableReview(input, model({ ...explanation, evidenceIds: ['sleepMinutes'] }))
    ).rejects.toThrow('unavailable evidence');
  });
});
