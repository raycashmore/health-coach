import { buildWearableReview, shiftDate } from '../../packages/health-core/src/wearable-review.ts';

export const question =
  'My recorded sleep looks lower this week. Is that real, and is there anything in my notes that explains it?';
export const cases = Object.freeze([
  { id: 'source', expected: 'recording-source-change' },
  { id: 'missing', expected: 'unexplained-change' },
  { id: 'different-words', expected: 'explained-by-owner-note' },
  { id: 'no-change', expected: 'no-meaningful-change' }
]);
export function syntheticCase(id) {
  if (!cases.some((item) => item.id === id)) throw new Error('Unknown synthetic case');
  const snapshot = {
    completedBefore: '2026-10-22',
    sleepGrouping: 'next-wake-day',
    timeZone: 'UTC',
    syncedAt: '2026-10-22T12:00:00Z',
    days: Array.from({ length: 21 }, (_, i) => ({
      date: shiftDate('2026-10-22', i - 21),
      steps: { value: i < 18 ? 8100 : 7800, origins: ['source-1'] },
      sleepMinutes: {
        value: i < 18 || id === 'no-change' ? 442 : [352, 338, 361][i - 18],
        origins: id === 'source' && i >= 18 ? ['source-1', 'source-2'] : ['source-1']
      }
    }))
  };
  const note = (documentId, date, heading, text) => ({
    id: `note:${documentId}:v1:0:L1-2`,
    documentId,
    revision: 'v1',
    date,
    headingPath: [heading],
    startLine: 1,
    endLine: 2,
    text
  });
  const notes = [note('old', '2026-09-12', 'Launch week', 'Sleep was short all week with late finishes.')];
  if (id === 'source')
    notes.push(note('app', '2026-10-19', 'Trying things', 'Installed a phone app to track nights alongside the band.'));
  if (id === 'different-words')
    notes.push(note('travel', '2026-10-19', 'Away', 'Red-eye flight tonight, then three nights in a hotel.'));
  return { snapshot, comparison: buildWearableReview(snapshot, new Date(snapshot.syncedAt)), notes };
}
