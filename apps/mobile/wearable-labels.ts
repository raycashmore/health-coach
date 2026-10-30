import type { wearableMetrics } from '@health-coach/health-core/wearable-review';

export const metricLabels = {
  steps: 'Steps',
  sleepMinutes: 'Sleep'
} satisfies Record<(typeof wearableMetrics)[number], string>;

const appNames = {
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.ouraring.oura': 'Oura',
  'com.samsung.android.wear.shealth': 'Samsung Health',
  'com.sec.android.app.shealth': 'Samsung Health'
} satisfies Record<string, string>;

export function sourceName(origin: string): string {
  if (origin.startsWith('com.android.healthconnect.phone')) return 'This phone';
  return origin in appNames ? appNames[origin as keyof typeof appNames] : origin;
}
