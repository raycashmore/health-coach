import { Platform } from 'react-native';
import type { WearableSnapshot } from '@health-coach/health-core/wearable-review';
import { dateInZone } from '@health-coach/health-core/wearable-review';

export async function readWearableSnapshot(): Promise<WearableSnapshot> {
  if (Platform.OS !== 'android') throw new Error('Health Connect needs an Android device.');
  let health: typeof import('react-native-health-connect');
  try {
    health = await import('react-native-health-connect');
  } catch {
    throw new Error('Install the Android development build. Health Connect is unavailable in Expo Go.');
  }
  if (!(await health.initialize())) {
    throw new Error('Health Connect is unavailable. Install or update it, then try again.');
  }
  const permissions = await health.requestPermission([
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'SleepSession' }
  ]);
  const canRead = (recordType: 'Steps' | 'SleepSession') =>
    permissions.some((permission) => permission.accessType === 'read' && permission.recordType === recordType);
  if (!canRead('Steps') && !canRead('SleepSession')) {
    throw new Error('No read permissions granted. Allow steps or sleep in Health Connect, then try again.');
  }
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: WearableSnapshot['days'] = [];
  for (let offset = -21; offset < 0; offset += 1) {
    // Calendar arithmetic preserves local midnight across daylight-saving changes.
    const start = new Date(midnight);
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const timeRangeFilter = {
      operator: 'between',
      startTime: start.toISOString(),
      endTime: end.toISOString()
    } as const;
    const [steps, sleep] = await Promise.all([
      canRead('Steps') ? health.aggregateRecord({ recordType: 'Steps', timeRangeFilter }) : null,
      canRead('SleepSession') ? health.aggregateRecord({ recordType: 'SleepSession', timeRangeFilter }) : null
    ]);
    days.push({
      date: dateInZone(start, timeZone),
      // Native aggregation honours Health Connect source priority; never sum raw sources.
      steps: steps?.dataOrigins.length ? { value: steps.COUNT_TOTAL, origins: steps.dataOrigins } : null,
      sleepMinutes: sleep?.dataOrigins.length
        ? { value: sleep.SLEEP_DURATION_TOTAL / 60, origins: sleep.dataOrigins }
        : null
    });
  }
  return { days, timeZone, completedBefore: dateInZone(midnight, timeZone), syncedAt: new Date().toISOString() };
}
