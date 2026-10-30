import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { buildWearableReview, dateInZone } from '@health-coach/health-core/wearable-review';
import type { WearableReviewInput, WearableSnapshot } from '@health-coach/health-core/wearable-review';
import { HealthConnectPermissionError, readWearableSnapshot } from './read-wearable-snapshot';

export type WearableReview = { snapshot: WearableSnapshot; analysis: WearableReviewInput };
export type ReadFailure = { message: string; needsPermission: boolean };

const staleAfterMs = 30 * 60 * 1000;

function isStale(snapshot: WearableSnapshot, now = new Date()): boolean {
  return (
    now.getTime() - Date.parse(snapshot.syncedAt) > staleAfterMs ||
    dateInZone(now, snapshot.timeZone) !== snapshot.completedBefore
  );
}

/** Reads on mount and again when the app returns with a stale review; the last review stays visible meanwhile. */
export function useWearableReview() {
  const [review, setReview] = useState<WearableReview | null>(null);
  const [reading, setReading] = useState(true);
  const [failure, setFailure] = useState<ReadFailure | null>(null);
  const latest = useRef<WearableReview | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setReading(true);
    setFailure(null);
    try {
      const snapshot = await readWearableSnapshot();
      const next = { snapshot, analysis: buildWearableReview(snapshot) };
      latest.current = next;
      setReview(next);
    } catch (error) {
      setFailure({
        message: error instanceof Error ? error.message : 'Couldn’t read Health Connect.',
        needsPermission: error instanceof HealthConnectPermissionError
      });
    } finally {
      inFlight.current = false;
      setReading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      // Only a previously successful read refreshes itself, so a denied permission is never re-prompted unasked.
      if (state === 'active' && latest.current && isStale(latest.current.snapshot)) void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { failure, reading, refresh, review };
}
