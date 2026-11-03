import { mockModel } from 'eve/evals';

// Transport-only fixture for proving the complete pipeline without credentials.
// It is never evidence of a useful answer or a live provider's behavior.
export async function fixtureTransport(_url, init) {
  const model = mockModel(({ tools, toolResults }) => {
    if (!tools.length) return 'OFFLINE comparison transport fixture.';
    if (!toolResults.length) return { toolCalls: [{ name: 'search', input: { query: 'LP-42 ribbon' } }] };
    if (toolResults.length === 1) {
      return { toolCalls: [{ name: 'read_section', input: { handle: toolResults[0].output.sources[0].handle } }] };
    }
    return 'OFFLINE comparison transport fixture.';
  });
  return Response.json(await model.doGenerate(JSON.parse(init.body)));
}
