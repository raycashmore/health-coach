import { z } from 'zod';
import { shiftDate } from '../../packages/health-core/src/wearable-review.ts';
import { localLexicalSearch } from '../retrieval/quality.mjs';

const date = z.iso.date();
export const toolInputs = {
  get_wearable_comparison: z.strictObject({}),
  get_daily_values: z.strictObject({ metric: z.enum(['sleepMinutes', 'steps']), start: date, end: date }),
  search_notes: z.strictObject({
    query: z.string().trim().min(1).max(500),
    from: date.optional(),
    to: date.optional()
  }),
  read_note_section: z.strictObject({ handle: z.string().min(1).max(250) })
};
export function createEvidence(fixture) {
  // Own an immutable snapshot: callers cannot change records after a handle is issued.
  const { comparison, snapshot, notes } = structuredClone(fixture);
  const sleep = comparison.evidence.find((item) => item.id === 'sleepMinutes');
  const end = sleep?.endDate ?? snapshot.completedBefore;
  const from = shiftDate(sleep?.recentStart ?? end, -7);
  const ledger = new Map();
  const read = new Set();
  const cache = new Map();
  const trace = [];
  let bytes = 0;
  function call(name, raw) {
    if (trace.length >= 6) throw new Error('tool-call-limit');
    const parsed = toolInputs[name]?.safeParse(raw);
    if (!parsed?.success) throw new Error('invalid-tool-input');
    const input = parsed.data;
    const key = JSON.stringify([name, input]);
    let result;
    if (cache.has(key)) result = { ...cache.get(key), duplicate: true };
    else if (name === 'get_wearable_comparison') {
      result = {
        records: comparison.coverage.map((coverage) => ({
          handle: `wearable:${comparison.calculationVersion}:${coverage.metric}:${comparison.evidence.find((item) => item.id === coverage.metric)?.endDate ?? end}`,
          type: 'wearable',
          ...coverage,
          ...comparison.evidence.find((item) => item.id === coverage.metric)
        }))
      };
    } else if (name === 'get_daily_values') {
      const first = shiftDate(snapshot.days[0].date, input.metric === 'sleepMinutes' ? 1 : 0);
      const last = shiftDate(snapshot.days.at(-1).date, input.metric === 'sleepMinutes' ? 1 : 0);
      if (input.start > input.end || input.start < first || input.end > last) throw new Error('date-outside-snapshot');
      result = {
        records: snapshot.days.flatMap((day) => {
          const date = shiftDate(day.date, input.metric === 'sleepMinutes' ? 1 : 0);
          return date < input.start || date > input.end
            ? []
            : [
                {
                  handle: `day:${input.metric}:${date}`,
                  type: 'day',
                  metric: input.metric,
                  date,
                  value: day[input.metric]?.value ?? null,
                  origins: [...new Set(day[input.metric]?.origins ?? [])].sort()
                }
              ];
        })
      };
    } else if (name === 'search_notes') {
      if (input.from && input.to && input.from > input.to) throw new Error('invalid-date-range');
      const eligible = notes.filter(
        (note) => (!input.from || note.date >= input.from) && (!input.to || note.date <= input.to)
      );
      const hits = localLexicalSearch(input.query, eligible).map((hit) =>
        eligible.find((note) => note.id === hit.section_id)
      );
      result = {
        records: [
          {
            handle: `search:${trace.length + 1}`,
            type: 'search',
            ...input,
            inWindow: hits.some((note) => note.date >= from && note.date <= end)
          }
        ],
        hits: hits.map((note) => ({
          handle: note.id,
          type: 'note',
          date: note.date,
          heading: note.headingPath,
          excerpt: note.text.slice(0, 240)
        }))
      };
    } else {
      const note = notes.find((note) => note.id === input.handle && ledger.has(note.id));
      result = note
        ? {
            records: [
              {
                handle: note.id,
                type: 'note',
                date: note.date,
                heading: note.headingPath,
                text: note.text,
                startLine: note.startLine,
                endLine: note.endLine
              }
            ]
          }
        : { status: 'unavailable' };
    }
    const size = Buffer.byteLength(JSON.stringify(result));
    if (size > 6000 || bytes + size > 16000) throw new Error('evidence-byte-limit');
    bytes += size;
    for (const record of [...(result.records ?? []), ...(result.hits ?? [])]) ledger.set(record.handle, record);
    if (name === 'read_note_section' && result.records?.length) read.add(input.handle);
    if (result.status !== 'unavailable') cache.set(key, structuredClone(result));
    trace.push({ name, input, output: structuredClone(result) });
    return structuredClone(result);
  }
  return {
    call,
    ledger,
    read,
    trace,
    comparison,
    sleep,
    from,
    end,
    get bytes() {
      return bytes;
    }
  };
}
