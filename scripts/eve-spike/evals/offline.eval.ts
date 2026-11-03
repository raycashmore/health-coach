import { defineEval } from 'eve/evals';
import { equals, includes } from 'eve/evals/expect';

export default [
  defineEval({
    description: 'Offline runtime round trip, exact tool allowlist and reference chain',
    async test(t) {
      const turn = await t.send('Check synthetic search.');
      t.succeeded();
      t.toolOrder(['search', 'read_section', 'follow_reference']);
      t.maxToolCalls(3);
      t.noFailedCalls();
      t.check(turn.reply, includes('OFFLINE scripted fixture'));
      t.check(turn.reply, includes('ribbon type R7'));
      t.check(turn.reply, includes(':L1-'));
    }
  }),
  defineEval({
    description: 'Tool budget stops the Eve turn without a fabricated final answer',
    async test(t) {
      const turn = await t.send('exhaust-budget');
      t.calledTool('search', { count: 6 });
      t.event('turn.settled', { data: { outcome: 'cancelled' } });
      t.check(turn.reply ?? '', equals(''));
    }
  }),
  ...['invalid-budget', 'mixed-budget'].map((scenario) =>
    defineEval({
      description: `Schema rejected attempts consume the runtime budget: ${scenario}`,
      async test(t) {
        const turn = await t.send(scenario);
        if (scenario === 'invalid-budget') t.usedNoTools();
        else t.calledTool('search', { count: 3 });
        t.event('model.started', { count: 6 });
        t.event('turn.settled', { data: { outcome: 'failed' } });
        t.check(turn.reply ?? '', equals(''));
      }
    })
  ),
  defineEval({
    description: 'Synthetic provider failure ends visibly without an answer',
    async test(t) {
      const turn = await t.send('provider-failure');
      t.event('turn.settled', { data: { outcome: 'failed' } });
      t.check(turn.reply ?? '', equals(''));
      t.usedNoTools();
    }
  })
];
