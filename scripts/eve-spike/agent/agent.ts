import { defineAgent, defineDynamic } from 'eve';
import { modelCalls, modelCallLimit } from './lib/model-budget';
import { mockModel } from 'eve/evals';
import { z } from 'zod';

const searchResult = z.object({ sources: z.array(z.object({ handle: z.string() })) });
const sourceResult = z.object({
  source: z.object({ text: z.string(), handle: z.string(), startLine: z.number(), endLine: z.number() })
});

const fixtureModel = mockModel(({ tools, toolResults, lastUserMessage }) => {
  const names = tools.map((tool) => tool.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(['follow_reference', 'read_section', 'search'])) {
    throw new Error('Unexpected tool capability');
  }
  if (lastUserMessage === 'provider-failure') throw new Error('Synthetic provider failure');
  if (lastUserMessage === 'invalid-budget' || lastUserMessage === 'mixed-budget') {
    const invalid = lastUserMessage === 'invalid-budget' || toolResults.length % 2 === 0;
    return { toolCalls: [{ name: 'search', input: { query: invalid ? '' : 'parcel packing' } }] };
  }
  if (lastUserMessage === 'exhaust-budget') {
    if (toolResults.length > 6) throw new Error('Runtime continued after incomplete result');
    return { toolCalls: [{ name: 'search', input: { query: 'parcel packing' } }] };
  }
  if (!toolResults.length) return { toolCalls: [{ name: 'search', input: { query: 'parcel packing' } }] };
  if (toolResults.length === 1) {
    const result = searchResult.parse(toolResults[0].output);
    return { toolCalls: [{ name: 'read_section', input: { handle: result.sources[0].handle } }] };
  }
  if (toolResults.length === 2) {
    const { source } = sourceResult.parse(toolResults[1].output);
    const reference = /\]\(([^)]+)\)/.exec(source.text)?.[1];
    if (!reference) throw new Error('Fixture reference missing');
    return { toolCalls: [{ name: 'follow_reference', input: { source_handle: source.handle, reference } }] };
  }
  const { source } = sourceResult.parse(toolResults[2].output);
  return `OFFLINE scripted fixture; not model judgement.\n${source.text}\n[${source.handle}:L${source.startLine}-${source.endLine}]`;
});

// Permanently offline. Invalid schemas may produce no tool settlement event,
// so model selection also enforces a pre-call ceiling independently of tools.
export default defineAgent({
  defaultTools: false,
  tool: false,
  model: defineDynamic(() => {
    if (modelCalls.get() >= modelCallLimit) throw new Error('incomplete: model-call-limit');
    return { model: fixtureModel, modelContextWindowTokens: 1_000_000 };
  })
});
