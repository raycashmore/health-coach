import type { HealthInvestigationSummary } from '@health-coach/health-core/iron-regulation-panel';

export type HealthFollowUpDraft = {
  dueEnd: string;
  dueStart: string;
  purpose: string;
  rationale: string;
};

function daysFrom(now: Date, days: number): string {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function createFollowUpDraft(
  investigation: HealthInvestigationSummary,
  now = new Date()
): HealthFollowUpDraft | null {
  if (investigation.resultType === 'no-genetic-lead' || investigation.resultType === 'no-current-panel-escalation') {
    return null;
  }

  const isClinicalReview = investigation.resultType === 'clinician-review-prompt';
  const purpose = isClinicalReview
    ? 'Discuss this bounded genetics-and-labs finding with a clinician.'
    : 'Revisit the evidence needed to clarify this bounded genetic lead.';

  return {
    dueEnd: daysFrom(now, isClinicalReview ? 28 : 84),
    dueStart: daysFrom(now, isClinicalReview ? 14 : 56),
    purpose,
    rationale: `${investigation.summary} This due window keeps the next step visible without treating the finding as a diagnosis.`
  };
}
