import { Platform } from 'react-native';
import type { WearableSnapshot } from '@health-coach/health-core/wearable-review';
import type { WearableMetric } from './wearable-labels';
import { dateInZone, shiftDate } from '@health-coach/health-core/wearable-review';
import { readSleepByWakeDay } from './read-sleep-sessions';

const readPermissions = [
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'SleepSession' }
] as const;
const googleFitOrigin = 'com.google.android.apps.fitness';

export class HealthConnectPermissionError extends Error {}

/** Metrics without read access are listed as blocked so the screen can say so instead of reporting missing days. */
export type WearableRead = { snapshot: WearableSnapshot; blocked: WearableMetric[] };

export async function openHealthConnectSettings(): Promise<void> {
  const health = await import('react-native-health-connect');
  health.openHealthConnectSettings();
}

export async function readWearableSnapshot(): Promise<WearableRead> {
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
  const granted = await health.getGrantedPermissions();
  const hasAny = readPermissions.some((wanted) =>
    granted.some((permission) => permission.accessType === 'read' && permission.recordType === wanted.recordType)
  );
  // Prompt only before any access exists; a partial grant is the owner's choice, changed in Health Connect settings.
  const permissions = hasAny ? granted : await health.requestPermission([...readPermissions]);
  const canRead = (recordType: 'Steps' | 'SleepSession') =>
    permissions.some((permission) => permission.accessType === 'read' && permission.recordType === recordType);
  if (!canRead('Steps') && !canRead('SleepSession')) {
    throw new HealthConnectPermissionError('Steps and sleep access is off.');
  }
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sleepByDay = canRead('SleepSession') ? await readSleepByWakeDay(health, midnight, now, timeZone) : new Map();
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
    const [fitSteps, allSteps] = await Promise.all([
      canRead('Steps')
        ? health.aggregateRecord({ recordType: 'Steps', timeRangeFilter, dataOriginFilter: [googleFitOrigin] })
        : null,
      canRead('Steps') ? health.aggregateRecord({ recordType: 'Steps', timeRangeFilter }) : null
    ]);
    const steps = fitSteps?.dataOrigins.length ? fitSteps : allSteps;
    days.push({
      date: dateInZone(start, timeZone),
      // Prefer Fit's exported steps; use the deduplicated Health Connect total when Fit has no records.
      steps: steps?.dataOrigins.length ? { value: steps.COUNT_TOTAL, origins: steps.dataOrigins } : null,
      sleepMinutes: sleepByDay.get(shiftDate(dateInZone(start, timeZone), 1)) ?? null
    });
  }
  return {
    snapshot: {
      days,
      timeZone,
      sleepGrouping: 'next-wake-day',
      completedBefore: dateInZone(midnight, timeZone),
      syncedAt: new Date().toISOString()
    },
    blocked: [
      ...(canRead('Steps') ? [] : ['steps' as const]),
      ...(canRead('SleepSession') ? [] : ['sleepMinutes' as const])
    ]
  };
}
