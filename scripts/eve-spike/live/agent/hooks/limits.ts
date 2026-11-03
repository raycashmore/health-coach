import { defineHook } from 'eve/hooks';
import { providerCalls } from '../agent';
import { budget } from '../../../agent/lib/evidence';

export default defineHook({
  events: {
    'model.started'() {
      providerCalls.update((count) => count + 1);
    },
    'call.settled'(_event, ctx) {
      if (budget.get().stopped) ctx.cancel(`incomplete: ${budget.get().stopped}`);
    }
  }
});
