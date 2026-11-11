import { contextPacketSchema, snapshotSchema } from '@health-coach/health-core/lab-context';
import type { WearableSnapshot } from '@health-coach/health-core/wearable-review';
import { shiftDate } from '@health-coach/health-core/wearable-review';
import { supabase } from './supabase-client';
import { readWearableSnapshot } from './read-wearable-snapshot';

export function privateCaseActivity(snapshot: WearableSnapshot) {
  const start = shiftDate(snapshot.completedBefore, -14);
  const wakeDaySleep = snapshot.sleepGrouping === 'next-wake-day';
  return snapshotSchema.parse({
    // The server replaces this unassigned ID with a fresh snapshot identifier.
    id: '00000000-0000-4000-8000-000000000000',
    timeZone: snapshot.timeZone,
    days: snapshot.days
      .filter((day) => day.date >= start && day.date < snapshot.completedBefore)
      .map((day) => ({
        date: day.date,
        steps: day.steps?.value ?? null,
        sleepMinutes:
          (wakeDaySleep ? snapshot.days.find((source) => source.date === shiftDate(day.date, -1)) : day)?.sleepMinutes
            ?.value ?? null
      }))
  });
}

export async function readPrivateContext() {
  if (!__DEV__) throw new Error('The private case is available only in development.');
  const serverUrl = process.env.EXPO_PUBLIC_HEALTH_COACH_API_URL;
  if (!serverUrl || !/^https?:\/\//.test(serverUrl))
    throw new Error('Configure the Health Coach server URL to inspect the private case.');
  const session = await supabase?.auth.getSession();
  if (!session?.data.session) throw new Error('Sign in again before loading the private case.');
  let activity = null;
  try {
    const { snapshot } = await readWearableSnapshot();
    // Health Connect reads 21 days for its existing comparison. Only completed recent days leave the phone here.
    activity = privateCaseActivity(snapshot);
  } catch {
    // An unavailable native read must not prevent inspecting the prepared labs and notes.
  }
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/lab-context/private`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.data.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ activity }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000)
  });
  const body: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'The private evidence could not be loaded.'
    );
  const result = contextPacketSchema.safeParse(body);
  if (!result.success || result.data.kind !== 'private-context')
    throw new Error('The private evidence response could not be verified.');
  return result.data;
}
