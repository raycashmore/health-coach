import { describe, expect, it } from 'vitest';

import { evaluateIronRegulationPanel, toHealthInvestigationSummary } from './iron-regulation-panel.js';

describe('evaluateIronRegulationPanel', () => {
  it('fails closed when the apparent C282Y call is direct-to-consumer only', () => {
    expect(
      evaluateIronRegulationPanel({
        geneticCall: { callState: 'dtc-only', genotype: 'AA' },
        ironStudyCorroboration: 'missing'
      })
    ).toMatchObject({ resultType: 'data-quality-follow-up' });
  });

  it('creates a Worth-checking Genetic Lead only for a confirmed premise with missing iron-study context', () => {
    expect(
      evaluateIronRegulationPanel({
        geneticCall: {
          callState: 'clinically-confirmed',
          genomeBuild: 'GRCh37',
          genotype: 'AA',
          sourceId: '00000000-0000-4000-8000-000000000001'
        },
        ironStudyCorroboration: 'missing'
      })
    ).toMatchObject({ resultType: 'worth-checking-genetic-lead' });
  });

  it('does not label missing or an out-of-scope call as negative', () => {
    expect(
      evaluateIronRegulationPanel({
        geneticCall: { callState: 'unavailable' },
        ironStudyCorroboration: 'missing'
      })
    ).toMatchObject({ resultType: 'no-genetic-lead' });
  });

  it('requires a source-backed known build for a clinically confirmed call', () => {
    expect(() =>
      evaluateIronRegulationPanel({
        geneticCall: { callState: 'clinically-confirmed', genotype: 'AA' },
        ironStudyCorroboration: 'missing'
      })
    ).toThrow('known genome build');
  });

  it('maps a persisted review to an owner-safe evidence summary', () => {
    expect(
      toHealthInvestigationSummary({
        citation_references: ['Example guideline'],
        created_at: '2026-08-31T10:00:00.000Z',
        id: '00000000-0000-4000-8000-000000000002',
        panel_id: 'iron-regulation',
        panel_version: '1.0',
        personal_evidence_references: ['00000000-0000-4000-8000-000000000001'],
        result_type: 'data-quality-follow-up',
        summary: 'A carefully bounded, non-diagnostic summary.'
      })
    ).toEqual({
      citationReferences: ['Example guideline'],
      createdAt: '2026-08-31T10:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000002',
      panelId: 'iron-regulation',
      panelVersion: '1.0',
      personalEvidenceCount: 1,
      personalEvidenceReferenceIds: ['00000000-0000-4000-8000-000000000001'],
      resultType: 'data-quality-follow-up',
      summary: 'A carefully bounded, non-diagnostic summary.'
    });
  });
});
