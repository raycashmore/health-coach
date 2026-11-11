import type { SyntheticContextScenario } from '@health-coach/health-core/lab-context';
import type { ContextRequest, ContextStore, Publication } from './contracts';
import { assembleContextPacket } from './packet';

/** Fixed public-safe fixture. Never reads files, the Personal Health Record or a model. */
export function syntheticContextCase(ownerId: string, scenario: SyntheticContextScenario) {
  const request: ContextRequest = {
    ownerId,
    caseId: '00000000-0000-4000-8000-000000000283',
    question: 'Show the latest laboratory panel alongside activity and relevant notes.',
    asOf: '2026-01-22T14:00:00Z',
    panels: [
      {
        id: 'synthetic-panel',
        sourceId: 'synthetic-laboratory',
        collectionDate: '2026-01-20',
        results: Array.from({ length: 11 }, (_, index) => ({
          id: `synthetic-result-${index + 1}`,
          name: `Example marker ${index + 1}`,
          value: 12 + index,
          unit: 'example units',
          referenceRange: '8–10',
          aliases: []
        }))
      }
    ],
    activity: {
      id: '00000000-0000-4000-8000-000000000284',
      timeZone: 'Australia/Sydney',
      days: [
        { date: '2026-01-19', steps: 4200, sleepMinutes: null },
        { date: '2026-01-21', steps: null, sleepMinutes: 430 },
        { date: '2026-01-22', steps: 5100, sleepMinutes: 450 },
        { date: '2026-01-23', steps: 99999, sleepMinutes: 999 }
      ]
    }
  };
  if (scenario === 'ambiguous-dates') request.panels[0]!.collectionDate = null;
  const publication: Publication = {
    revision:
      scenario === 'deleted-notes'
        ? '00000000-0000-4000-8000-000000000287'
        : scenario === 'corrected-notes'
          ? '00000000-0000-4000-8000-000000000286'
          : '00000000-0000-4000-8000-000000000285',
    publishedAt:
      scenario === 'deleted-notes'
        ? '2026-01-22T11:00:00Z'
        : scenario === 'corrected-notes'
          ? '2026-01-22T10:00:00Z'
          : '2026-01-21T00:00:00Z',
    totalMatches: scenario === 'deleted-notes' ? 0 : 3,
    sections:
      scenario === 'deleted-notes'
        ? []
        : [
            {
              id: 'synthetic-section',
              documentId: 'synthetic-notes',
              headingPath: ['Example routine'],
              startLine: 3,
              endLine: 4,
              authoredDate: null,
              text:
                scenario === 'corrected-notes'
                  ? 'Correction: the example routine was unchanged. The earlier statement was mistaken; timing remains uncertain.'
                  : 'The example routine may have changed; timing is uncertain. This statement does not establish a cause.'
            },
            {
              id: 'synthetic-conflicting-section',
              documentId: 'synthetic-routine-log',
              headingPath: ['Routine log'],
              startLine: 1,
              endLine: 2,
              authoredDate: null,
              text:
                scenario === 'corrected-notes'
                  ? 'A separate example log says the routine stayed unchanged. Its timing remains uncertain.'
                  : 'A separate example log says the routine stayed unchanged. This conflicts with the possible change reported in the original note; neither undated account establishes when it happened.'
            }
          ]
  };
  const store: ContextStore = {
    search: async () => {
      if (scenario === 'notes-unavailable') throw new Error('synthetic-source-unavailable');
      return publication;
    },
    isCurrent: async (revision) => scenario !== 'stale-notes' && revision === publication.revision
  };
  return { request, store };
}

export function loadSyntheticContextPacket(ownerId: string, scenario: SyntheticContextScenario) {
  const { request, store } = syntheticContextCase(ownerId, scenario);
  return assembleContextPacket(request, { store, activityAvailable: scenario !== 'activity-unavailable' });
}
