import type { wearableMetrics } from '@health-coach/health-core/wearable-review';

export type WearableMetric = (typeof wearableMetrics)[number];

export const metricLabels = {
  steps: 'Steps',
  sleepMinutes: 'Sleep'
} satisfies Record<WearableMetric, string>;

const appNames: Record<string, string> = {
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.huami.watch.hmwatchmanager': 'Zepp',
  'com.ouraring.oura': 'Oura',
  'com.samsung.android.wear.shealth': 'Samsung Health',
  'com.sec.android.app.shealth': 'Samsung Health'
};

export function sourceName(origin: string): string {
  if (origin.startsWith('com.android.healthconnect.phone')) return 'This phone';
  return appNames[origin] ?? origin;
}
