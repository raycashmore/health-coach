import { expect, it, vi } from 'vitest';
import type { WearableSnapshot } from '@health-coach/health-core/wearable-review';

vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => undefined }) } }));
vi.mock('./read-wearable-snapshot', () => ({}));
import { isStale } from './use-wearable-review';

const snapshot = (syncedAt: string, completedBefore: string): WearableSnapshot => ({
  sleepGrouping: 'next-wake-day',
  completedBefore,
  days: [],
  syncedAt,
  timeZone: 'UTC'
});

it('treats a review as stale after 30 minutes or once the day has changed', () => {
  const now = new Date('2026-10-30T10:00:00Z');
  expect(isStale(snapshot('2026-10-30T09:45:00Z', '2026-10-30'), now)).toBe(false);
  expect(isStale(snapshot('2026-10-30T09:15:00Z', '2026-10-30'), now)).toBe(true);
  expect(isStale(snapshot('2026-10-30T09:59:00Z', '2026-10-29'), now)).toBe(true);
});
