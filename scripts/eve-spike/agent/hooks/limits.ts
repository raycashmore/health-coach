import { defineHook } from 'eve/hooks';
import { modelCalls } from '../lib/model-budget';
import { budget } from '../lib/evidence';
import { evidenceLimits } from '../../evidence.mjs';

export default defineHook({
  events: {
    'model.started'() {
      modelCalls.update((count) => count + 1);
    },
    'call.settled'(_event, ctx) {
      const state = budget.get();
      if (state.calls >= evidenceLimits.calls || state.stopped) {
        budget.update((current) => ({ ...current, stopped: current.stopped ?? 'tool-call-limit' }));
        ctx.cancel(`incomplete: ${state.stopped ?? 'tool-call-limit'}`);
      }
    }
  }
});
