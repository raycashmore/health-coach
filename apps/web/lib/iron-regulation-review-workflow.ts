import 'server-only';

import { cron, eventType } from 'inngest';
import { z } from 'zod';

import {
  executeQueuedIronRegulationReview,
  queuedHealthReviewRequestIds,
  queueWeeklyIronRegulationReview
} from './health-review-workflow-store';
import { inngest } from './inngest-client';
import { runIronRegulationReview } from './run-iron-regulation-review';

const ironRegulationReviewRequested = eventType('health-coach/iron-regulation.review-requested', {
  schema: z.object({ requestId: z.string().uuid() })
});

export const runRequestedIronRegulationReview = inngest.createFunction(
  {
    concurrency: { key: '"iron-regulation"', limit: 1 },
    id: 'run-requested-iron-regulation-review',
    retries: 3,
    triggers: [ironRegulationReviewRequested]
  },
  async ({ event, step }) =>
    step.run('run queued bounded iron-regulation review', () =>
      executeQueuedIronRegulationReview(event.data.requestId, runIronRegulationReview)
    )
);

export const dispatchQueuedIronRegulationReviews = inngest.createFunction(
  {
    concurrency: 1,
    id: 'dispatch-queued-iron-regulation-reviews',
    retries: 3,
    triggers: [cron('*/5 * * * *')]
  },
  async ({ step }) => {
    const requestIds = await step.run('load queued Health Reviews', queuedHealthReviewRequestIds);

    if (requestIds.length > 0) {
      await step.sendEvent(
        'dispatch queued Health Reviews',
        requestIds.map((requestId) => ({
          data: { requestId },
          name: ironRegulationReviewRequested.name
        }))
      );
    }
  }
);

export const queueWeeklyIronRegulationReviewWorkflow = inngest.createFunction(
  {
    concurrency: 1,
    id: 'queue-weekly-iron-regulation-review',
    retries: 3,
    triggers: [cron('TZ=Australia/Sydney 0 9 * * 1')]
  },
  async ({ step }) => step.run('queue weekly Health Review', queueWeeklyIronRegulationReview)
);
