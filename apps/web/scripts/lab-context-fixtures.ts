import { randomUUID } from 'node:crypto';
import { MockLanguageModelV4 } from 'ai/test';
import type { ContextAnswer, ContextRequest, Publication } from '../lib/lab-context/contracts';

export function syntheticRequest(): ContextRequest {
  return {
    caseId: randomUUID(),
    ownerId: randomUUID(),
    question: 'What do my latest lab results mean alongside recent activity and notes?',
    asOf: '2026-01-22T04:00:00Z',
    panels: [
      {
        id: 'panel-example',
        sourceId: 'source-example',
        collectionDate: '2026-01-20',
        results: [
          { id: 'result-example', name: 'Marker A', aliases: [], value: 12, unit: 'units', referenceRange: '8–10' }
        ]
      }
    ],
    activity: {
      id: randomUUID(),
      timeZone: 'Australia/Sydney',
      days: [
        { date: '2026-01-19', steps: 100, sleepMinutes: null },
        { date: '2026-01-22', steps: 9999, sleepMinutes: null }
      ]
    }
  };
}
export function syntheticPublication(): Publication {
  return {
    totalMatches: 1,
    revision: randomUUID(),
    publishedAt: '2026-01-21T00:00:00Z',
    sections: [
      {
        id: 'section-example',
        documentId: 'document-example',
        headingPath: ['Example'],
        startLine: 1,
        endLine: 2,
        authoredDate: '2026-01-18',
        text: 'Marker A routine changed, but the date is uncertain.'
      }
    ]
  };
}
export function fakeContextModel(
  answer: ContextAnswer = {
    findings: [{ text: 'Marker A is above the supplied source range.', evidenceIds: ['lab-1'] }],
    limitations: ['Activity coverage is incomplete; clinical significance is unknown.']
  }
) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'text', text: JSON.stringify(answer) }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 50, text: 30, reasoning: 20 }
      },
      warnings: []
    }
  });
}
