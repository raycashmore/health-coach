import type { wearableMetrics } from '@health-coach/health-core/wearable-review';

export const metricLabels = {
  steps: 'Steps',
  sleepMinutes: 'Recorded sleep'
} satisfies Record<(typeof wearableMetrics)[number], string>;
