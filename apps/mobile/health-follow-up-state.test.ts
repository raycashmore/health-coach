import { describe, expect, it } from 'vitest';
import type { HealthInvestigationSummary } from '@health-coach/health-core/iron-regulation-panel';
import { createFollowUpDraft } from './health-follow-up-state';

const investigation = {
  citationReferences: ['Example guideline'],
  createdAt: '2026-09-02T00:00:00.000Z',
  id: '00000000-0000-4000-8000-000000000001',
  panelId: 'iron-regulation',
  panelVersion: '1.0',
  personalEvidenceCount: 1,
  personalEvidenceReferenceIds: ['00000000-0000-4000-8000-000000000002'],
  resultType: 'worth-checking-genetic-lead',
  summary: 'A bounded, non-diagnostic finding.'
} satisfies HealthInvestigationSummary;

describe('createFollowUpDraft', () => {
  it('creates an explained due window for a surfaced lead', () => {
    expect(createFollowUpDraft(investigation, new Date('2026-09-02T00:00:00.000Z'))).toMatchObject({
      dueEnd: '2026-11-25T00:00:00.000Z',
      dueStart: '2026-10-28T00:00:00.000Z',
      purpose: 'Revisit the evidence needed to clarify this bounded genetic lead.'
    });
  });

  it('does not create a follow-up for a non-actionable conclusion', () => {
    expect(createFollowUpDraft({ ...investigation, resultType: 'no-genetic-lead' })).toBeNull();
  });
});
