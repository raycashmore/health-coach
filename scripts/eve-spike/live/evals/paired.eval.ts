import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defineEval } from 'eve/evals';
import { generateText } from 'ai';
import { demoCases } from '../../fixtures.mjs';
import { liveModel } from '../../live-model.mjs';
import { runMarker, liveEnvelope } from '../../live-budget.mjs';
import { fixedEvidence } from '../../control.mjs';
import { answerInstructions } from '../../prompt.mjs';

export default demoCases.map((item) =>
  defineEval({
    description: `Synthetic ${liveEnvelope.agentOnly ? 'agent case' : 'pair'}: ${item.id}`,
    async test(t) {
      const directory = process.env.HC_SPIKE_RESULTS;
      if (!directory) throw new Error('Explicit synthetic result directory required');
      const started = Date.now();
      const turn = await t.send(runMarker('agent', item.id));
      const agent = {
        answer: turn.reply ?? '',
        status: turn.status,
        error: turn.error?.code,
        elapsedMs: Date.now() - started,
        tools: turn.toolCalls,
        events: turn.events
      };
      t.maxToolCalls(6);
      if (liveEnvelope.agentOnly) {
        await writeFile(
          path.join(directory, `${item.id}.json`),
          JSON.stringify({ caseId: item.id, query: item.query, agent }, null, 2),
          { flag: 'wx', mode: 0o600 }
        );
        t.log(`${item.id}: agent ${agent.status}`);
        return;
      }
      const fixedStarted = Date.now();
      const evidence = fixedEvidence(item.query);
      let fixed;
      if (evidence.status !== 'ready') fixed = { status: 'incomplete', reason: 'evidence-limit', evidence };
      else {
        try {
          const result = await generateText({
            model: await liveModel({ toolsAvailable: false }),
            maxRetries: 0,
            maxOutputTokens: 1000,
            system: answerInstructions,
            prompt: `${runMarker('fixed', item.id)}\n\nSupplied evidence:\n${JSON.stringify(evidence.trace)}`
          });
          fixed = {
            status: 'completed',
            answer: result.text,
            usage: result.usage,
            elapsedMs: Date.now() - fixedStarted,
            evidence
          };
        } catch {
          fixed = { status: 'incomplete', reason: 'provider-stopped', elapsedMs: Date.now() - fixedStarted, evidence };
        }
      }
      await writeFile(
        path.join(directory, `${item.id}.json`),
        JSON.stringify({ caseId: item.id, query: item.query, agent, fixed }, null, 2),
        { flag: 'wx', mode: 0o600 }
      );
      t.log(`${item.id}: agent ${agent.status}; fixed ${fixed.status}`);
    }
  })
);
