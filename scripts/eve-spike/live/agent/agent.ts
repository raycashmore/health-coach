import { defineAgent, defineDynamic } from 'eve';
import { defineState } from 'eve/context';
import { liveModel } from '../../live-model.mjs';
import { liveEnvelope } from '../../live-budget.mjs';
import { budget } from '../../agent/lib/evidence';

export const providerCalls = defineState('synthetic-live.model-calls', () => 0);

export default defineAgent({
  defaultTools: false,
  tool: false,
  model: defineDynamic(async () => {
    if (providerCalls.get() >= 7) throw Object.assign(new Error('incomplete: model-call-limit'), { statusCode: 400 });
    return {
      model: await liveModel({ toolsAvailable: budget.get().calls < 6 && !budget.get().stopped }),
      modelContextWindowTokens: liveEnvelope.contextWindow
    };
  })
});
