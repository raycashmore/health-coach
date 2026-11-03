import { z } from 'zod';
import { lexicalTerms } from '../retrieval/quality.mjs';

export const answerSchema = z.strictObject({
  conclusion: z.enum([
    'recording-source-change',
    'explained-by-owner-note',
    'unexplained-change',
    'no-meaningful-change'
  ]),
  claims: z
    .array(
      z.strictObject({
        kind: z.enum(['measured', 'owner-note', 'inference', 'not-found', 'data-check']),
        text: z.string().trim().min(1).max(700),
        evidence: z.array(z.string()).min(1).max(21)
      })
    )
    .min(1)
    .max(8),
  contextQuestion: z.string().trim().min(1).max(300).nullable()
});
const types = {
  measured: ['wearable', 'day'],
  'owner-note': ['note'],
  inference: ['wearable', 'day', 'note'],
  'not-found': ['search'],
  'data-check': ['wearable', 'day', 'note']
};
export function validateAnswer(raw, evidence) {
  const parsed = answerSchema.safeParse(raw);
  if (!parsed.success) return ['answer-schema'];
  const answer = parsed.data;
  const errors = [];
  const recordsFor = (claim) => claim.evidence.map((handle) => evidence.ledger.get(handle));
  for (const claim of answer.claims) {
    const records = recordsFor(claim);
    if (records.some((r) => !r)) {
      errors.push('unknown-evidence');
      continue;
    }
    if (records.some((r) => !types[claim.kind].includes(r.type))) errors.push('claim-evidence-type');
    if (claim.kind === 'owner-note' && records.some((r) => !evidence.read.has(r.handle))) errors.push('note-not-read');
    if (
      claim.kind === 'not-found' &&
      records.some((r) => r.inWindow || r.from !== evidence.from || r.to !== evidence.end)
    )
      errors.push('not-found-search');
    if (['measured', 'inference'].includes(claim.kind)) {
      if (
        /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(
          claim.text
        ) ||
        /\b(?:may\s+(?:the\s+)?\d{1,4}(?:st|nd|rd|th)?|\d{1,4}(?:st|nd|rd|th)?\s+may)\b/i.test(claim.text) ||
        /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(claim.text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ''))
      )
        errors.push('date-format-use-iso');
      const dates = claim.text.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
      const fields = records.flatMap((r) => Object.values(r));
      if (dates.some((d) => !fields.includes(d))) errors.push('date-mismatch');
      const withoutDates = claim.text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '');
      for (const match of withoutDates.matchAll(/-?\d+(?:\.\d+)?/g)) {
        const precision = match[0].split('.')[1]?.length ?? 0;
        if (
          !fields.some(
            (n) => typeof n === 'number' && Math.abs(Number(n.toFixed(precision))) === Math.abs(Number(match[0]))
          )
        )
          errors.push('number-mismatch');
      }
    }
  }
  if (!evidence.sleep || (answer.conclusion === 'no-meaningful-change') === evidence.sleep.notable)
    errors.push('sleep-notable-conclusion');
  if (answer.conclusion === 'recording-source-change') {
    const days = answer.claims
      .filter((c) => c.kind === 'measured')
      .flatMap(recordsFor)
      .filter((r) => r?.type === 'day' && r.metric === 'sleepMinutes' && r.value !== null);
    if (
      !days.some(
        (a) =>
          a.date >= evidence.sleep.recentStart &&
          days.some(
            (b) => b.date < evidence.sleep.recentStart && JSON.stringify(a.origins) !== JSON.stringify(b.origins)
          )
      )
    )
      errors.push('source-change-evidence');
  }
  if (
    answer.conclusion === 'explained-by-owner-note' &&
    !answer.claims.some(
      (c) =>
        c.kind === 'owner-note' &&
        recordsFor(c).some((r) => r?.date >= evidence.from && r.date <= evidence.end && evidence.read.has(r.handle))
    )
  )
    errors.push('in-window-note-required');
  if (answer.conclusion === 'unexplained-change') {
    const searches = answer.claims
      .filter((c) => c.kind === 'not-found')
      .flatMap(recordsFor)
      .filter((r) => r?.type === 'search' && !r.inWindow && r.from === evidence.from && r.to === evidence.end);
    if (new Set(searches.map((r) => lexicalTerms(r.query).sort().join(' '))).size < 2)
      errors.push('two-searches-required');
  }
  return [...new Set(errors)];
}
export function renderAnswer(answer) {
  return [...answer.claims.map((claim) => claim.text), answer.contextQuestion].filter(Boolean).join('\n');
}
