import { cases, syntheticCase } from './fixtures.mjs';
import { runInvestigation } from './run.mjs';

// Hand-authored software test responses, not model judgement or comparison evidence.
export function replayRequest({ semanticSearch = false } = {}) {
  return async ({ trace, toolsAllowed }) => {
    const tool = (name, input = {}) => ({ action: 'tool', name, input });
    if (!trace.length) return tool('get_wearable_comparison');
    const summary = trace
      .find((t) => t.name === 'get_wearable_comparison')
      .output.records.find((r) => r.metric === 'sleepMinutes');
    const searches = trace.filter((t) => t.name === 'search_notes');
    const daily = trace.find((t) => t.name === 'get_daily_values');
    const note = trace.find((t) => t.name === 'read_note_section')?.output.records?.[0];
    if (toolsAllowed && summary.notable) {
      if (summary.originsChanged && !daily)
        return tool('get_daily_values', { metric: 'sleepMinutes', start: '2026-10-16', end: '2026-10-22' });
      if (!searches.length)
        return tool('search_notes', { query: 'sleep late night tired', from: '2026-10-13', to: '2026-10-22' });
      if (searches.length < 2 && !searches.some((s) => s.output.hits.length))
        return tool('search_notes', {
          query: semanticSearch ? 'phone app band red-eye flight hotel' : 'sleep lower week notes',
          from: '2026-10-13',
          to: '2026-10-22'
        });
      const hit = searches.flatMap((s) => s.output.hits)[0];
      if (hit && !note) return tool('read_note_section', { handle: hit.handle });
    }
    const claims = [
      {
        kind: 'measured',
        text: summary.notable
          ? 'Recorded sleep is lower in the recent window.'
          : 'Recorded sleep has no meaningful change.',
        evidence: [summary.handle]
      }
    ];
    let conclusion = 'no-meaningful-change';
    if (summary.notable && daily) {
      conclusion = 'recording-source-change';
      claims.push({
        kind: 'measured',
        text: 'A second recording source contributes in the recent window.',
        evidence: daily.output.records.map((r) => r.handle)
      });
    } else if (summary.notable && note) {
      conclusion = 'explained-by-owner-note';
      claims.push({
        kind: 'owner-note',
        text: 'The owner recorded travel plans that may help explain the change.',
        evidence: [note.handle]
      });
    } else if (summary.notable) {
      conclusion = 'unexplained-change';
      claims.push({
        kind: 'not-found',
        text: 'No note matched these searches in the note window.',
        evidence: searches.map((s) => s.output.records[0].handle)
      });
    }
    return { action: 'answer', answer: { conclusion, claims, contextQuestion: null } };
  };
}
export async function replayAll() {
  const rows = [];
  for (const item of cases) {
    for (const mode of ['agent', 'fixed']) {
      const result = await runInvestigation({
        fixture: syntheticCase(item.id),
        mode,
        request: replayRequest({ semanticSearch: true })
      });
      rows.push({
        case: item.id,
        arm: mode,
        status: result.status,
        conclusion: result.answer?.conclusion ?? null,
        authoredLabelMatch: result.answer?.conclusion === item.expected,
        reason: result.reason ?? null,
        ...result.metrics
      });
    }
  }
  return {
    evidence: 'OFFLINE hand-authored replay; not a model comparison. Rubric and owner ratings unverified.',
    rows
  };
}
