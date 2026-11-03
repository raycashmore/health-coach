import { evidenceCall, initialEvidenceState } from './evidence.mjs';

export function fixedEvidence(question) {
  const state = initialEvidenceState();
  const trace = [];
  const search = evidenceCall(state, 'search', { query: question });
  trace.push({ name: 'search', input: { query: question }, output: search });
  if (search.status !== 'ok') return { state, trace, status: 'incomplete' };
  for (const hit of search.sources) {
    const input = { handle: hit.handle };
    const output = evidenceCall(state, 'read_section', input);
    trace.push({ name: 'read_section', input, output });
    if (output.status !== 'ok') return { state, trace, status: 'incomplete' };
  }
  return { state, trace, status: 'ready' };
}
