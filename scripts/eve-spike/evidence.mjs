import { localLexicalSearch } from '../retrieval/quality.mjs';
import { spikeSections } from './fixtures.mjs';

export const evidenceLimits = Object.freeze({ calls: 6, readBytes: 6000, totalBytes: 24000 });
/** @returns {{ calls: number, bytes: number, stopped: string | null }} */
export function initialEvidenceState() {
  return { calls: 0, bytes: 0, stopped: null };
}

// Exact handle lookup is the only read path. No filesystem or URL is opened.
export function evidenceCall(state, name, input, sections = spikeSections, limits = evidenceLimits) {
  if (state.stopped) return { status: 'incomplete', reason: state.stopped };
  if (state.calls >= limits.calls) return stop('tool-call-limit');
  state.calls++;
  let result;
  if (name === 'search') {
    if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 500)
      return stop('invalid-query');
    result = {
      status: 'ok',
      sources: localLexicalSearch(input.query, sections).map((hit) => {
        const section = sections.find((item) => item.id === hit.section_id);
        return { ...citation(section), excerpt: section.text.slice(0, 240) };
      })
    };
  } else if (name === 'read_section') {
    result = read(input.handle);
  } else if (name === 'follow_reference') {
    const source = sections.find((section) => section.id === input.source_handle);
    if (!source) return { status: 'unavailable', reason: 'source-revision-unavailable' };
    // Only explicit simple Markdown links, to an exact local allowlisted note/heading.
    // Reject schemes, traversal, absolute paths, encoding and queries even if authored.
    const references = [...source.text.matchAll(/\[[^\]\n]+\]\(([^\s)]+)\)/g)].map((match) => match[1]);
    if (typeof input.reference !== 'string' || !references.includes(input.reference))
      return { status: 'unavailable', reason: 'reference-not-in-source' };
    const match = /^([a-z0-9-]+)\.md#([a-z0-9-]+)$/.exec(input.reference);
    if (!match) return { status: 'unavailable', reason: 'reference-outside-allowlist' };
    const target = sections.find(
      (section) => section.documentId === match[1] && headingSlug(section.headingPath.at(-1)) === match[2]
    );
    result = read(target?.id);
  } else return stop('tool-not-allowed');
  if (result.status !== 'ok') return result;
  // Count the whole serialized result, including metadata and search excerpts.
  const bytes = Buffer.byteLength(JSON.stringify(result));
  if (bytes > limits.readBytes) return stop('read-byte-limit');
  if (state.bytes + bytes > limits.totalBytes) return stop('evidence-byte-limit');
  state.bytes += bytes;
  return result;

  function read(handle) {
    const section = sections.find((item) => item.id === handle);
    if (!section) return { status: 'unavailable', reason: 'source-revision-unavailable' };
    return { status: 'ok', source: { ...citation(section), text: section.text } };
  }
  function stop(reason) {
    state.stopped = reason;
    return { status: 'incomplete', reason };
  }
}
function headingSlug(heading = '') {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
function citation(section) {
  return {
    handle: section.id,
    document: section.documentId,
    revision: section.revision,
    heading: section.headingPath,
    startLine: section.startLine,
    endLine: section.endLine
  };
}
