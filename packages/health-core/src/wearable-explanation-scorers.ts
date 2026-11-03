import type { WearableEvidence, WearableExplanation, WearableReviewInput } from './wearable-review.js';

export const explanationFailureCodes = [
  'ungrounded-number',
  'sleep-in-raw-minutes',
  'exposed-display-threshold',
  'unneeded-caveat',
  'out-of-scope-claim'
] as const;
export type ExplanationFailure = (typeof explanationFailureCodes)[number];

const isoDatePattern = /\d{4}-\d{2}-\d{2}/g;
const figure = String.raw`\d[\d,]*(?:\.\d+)?`;
const numberPattern = new RegExp(figure, 'g');
const minutesPattern = new RegExp(`(${figure})\\s*(?:recorded\\s+)?(?:sleep\\s+)?(?:mins?|minutes)\\b`, 'gi');
const percentPattern = /\d\s*%|\bper ?cent\b/i;
const displayThresholdPattern = /\b(?:threshold|notable)|exploratory (?:display|rule|limit)/i;
const disclaimerPattern =
  /medical advice|consult (?:a|your|with)|not a (?:diagnosis|substitute)|seek (?:medical|professional)/i;
const outOfScopePattern =
  /diagnos|\bdisease|\bdisorder|\billness|treatment|therapy|medication|prescri|\brecover(?:y|ed|ing)?\b|\bhealthy|\bunhealthy|well-rested|you should|try to|aim for|recommend|caused by|\bnormal\b|reassur|worry/i;

function parseFigure(raw: string) {
  return Number(raw.replaceAll(',', ''));
}

type AllowedFigure = { value: number; tolerance: number };

function fieldsOf(explanation: WearableExplanation) {
  return [explanation.observation, explanation.uncertainty, explanation.contextQuestion].filter(
    (value): value is string => value !== null
  );
}

function sleepAllowances(minutes: number): AllowedFigure[] {
  const hours = Math.floor(minutes / 60);
  return [
    { value: minutes, tolerance: 1 },
    { value: hours, tolerance: 0 },
    { value: Math.round(minutes / 60), tolerance: 0 },
    { value: minutes - hours * 60, tolerance: 1 },
    { value: minutes / 60, tolerance: 0.05 }
  ];
}

function evidenceAllowances(item: WearableEvidence): AllowedFigure[] {
  const values = [item.recentMean, item.baselineMean, Math.abs(item.difference)];
  const measures =
    item.id === 'sleepMinutes'
      ? values.flatMap(sleepAllowances)
      : values.map((value) => ({ value, tolerance: Math.max(1, value * 0.01) }));
  const dates = [item.recentStart, item.baselineStart, item.endDate].flatMap((date) =>
    date.split('-').map((part) => ({ value: Number(part), tolerance: 0 }))
  );
  const counts = [item.recentDays, item.baselineDays, item.recentDays + item.baselineDays].map((value) => ({
    value,
    tolerance: 0
  }));
  return [...measures, ...dates, ...counts];
}

function coverageAllowances(input: WearableReviewInput): AllowedFigure[] {
  return input.coverage.flatMap((item) =>
    [item.days, item.recentDays, item.baselineDays].map((value) => ({ value, tolerance: 0 }))
  );
}

function hasUngroundedNumber(fields: string[], input: WearableReviewInput) {
  const allowedDates = new Set(input.evidence.flatMap((item) => [item.recentStart, item.baselineStart, item.endDate]));
  const allowed = [...input.evidence.flatMap(evidenceAllowances), ...coverageAllowances(input)];
  return fields.some((value) => {
    // Percentages are derived statistics the prompt forbids, however their digits coincide with evidence.
    if (percentPattern.test(value)) return true;
    const dates = value.match(isoDatePattern) ?? [];
    if (dates.some((date) => !allowedDates.has(date))) return true;
    const numbers = value.replace(isoDatePattern, ' ').match(numberPattern) ?? [];
    return numbers.some((raw) => {
      const number = parseFigure(raw);
      return !allowed.some((item) => Math.abs(item.value - number) <= item.tolerance);
    });
  });
}

function hasRawSleepMinutes(fields: string[]) {
  return fields.some((value) => [...value.matchAll(minutesPattern)].some((match) => parseFigure(match[1]!) >= 60));
}

function hasUnneededCaveat(explanation: WearableExplanation, input: WearableReviewInput) {
  if (explanation.uncertainty === null) return false;
  // Consequential limitations: source variation in a discussed signal, or a signal that could not be compared.
  return !input.coverage.some(
    (item) => (explanation.evidenceIds.includes(item.metric) && item.originsChanged) || !item.comparable
  );
}

/**
 * Deterministic checks for the quality failures the owner reported plus the prompt's scope rules.
 * A pass shows none of these patterns, not that the explanation is accurate or useful.
 */
export function scoreWearableExplanation(
  explanation: WearableExplanation,
  input: WearableReviewInput
): ExplanationFailure[] {
  const fields = fieldsOf(explanation);
  const failures: ExplanationFailure[] = [];
  if (hasUngroundedNumber(fields, input)) failures.push('ungrounded-number');
  if (hasRawSleepMinutes(fields)) failures.push('sleep-in-raw-minutes');
  if (fields.some((value) => displayThresholdPattern.test(value))) failures.push('exposed-display-threshold');
  if (hasUnneededCaveat(explanation, input) || fields.some((value) => disclaimerPattern.test(value)))
    failures.push('unneeded-caveat');
  if (fields.some((value) => outOfScopePattern.test(value))) failures.push('out-of-scope-claim');
  return failures;
}
