import { serve } from 'inngest/next';

import { inngest } from '../../../lib/inngest-client';
import {
  dispatchQueuedIronRegulationReviews,
  queueWeeklyIronRegulationReviewWorkflow,
  runRequestedIronRegulationReview
} from '../../../lib/iron-regulation-review-workflow';

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    dispatchQueuedIronRegulationReviews,
    queueWeeklyIronRegulationReviewWorkflow,
    runRequestedIronRegulationReview
  ]
});
