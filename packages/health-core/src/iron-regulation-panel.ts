import { z } from 'zod';

export const ironRegulationPanelId = 'iron-regulation';
export const ironRegulationPanelVersion = '1.1';

export const ironRegulationCallStates = ['clinically-confirmed', 'dtc-only', 'ambiguous', 'unavailable'] as const;

export const ironRegulationCorroborationStates = [
  'missing',
  'not-corrobating',
  'ferritin-elevated',
  'transferrin-saturation-elevated',
  'both-elevated',
  'guideline-pattern'
] as const;

export const ironRegulationResultTypes = [
  'no-genetic-lead',
  'data-quality-follow-up',
  'worth-checking-genetic-lead',
  'clinician-review-prompt',
  'no-current-panel-escalation'
] as const;

const c282yGenotype = 'AA';

export const ironRegulationGeneticCallSchema = z.object({
  callState: z.enum(ironRegulationCallStates),
  genotype: z
    .string()
    .regex(/^[ACGT]{2}$/)
    .optional(),
  genomeBuild: z.enum(['GRCh37', 'GRCh38']).optional(),
  sourceId: z.string().uuid().optional()
});

export const ironRegulationInvestigationInputSchema = z
  .object({
    geneticCall: ironRegulationGeneticCallSchema.optional(),
    ironStudyCorroboration: z.enum(ironRegulationCorroborationStates)
  })
  .superRefine((value, context) => {
    if (value.geneticCall?.callState !== 'clinically-confirmed') {
      return;
    }

    if (!value.geneticCall.genomeBuild || !value.geneticCall.sourceId) {
      context.addIssue({
        code: 'custom',
        message: 'A clinically confirmed call requires a known genome build and source reference.'
      });
    }
  });

export type IronRegulationInvestigationInput = z.infer<typeof ironRegulationInvestigationInputSchema>;

export type IronRegulationPanelResult = {
  panelId: typeof ironRegulationPanelId;
  panelVersion: typeof ironRegulationPanelVersion;
  resultType: (typeof ironRegulationResultTypes)[number];
  summary: string;
};

export const healthInvestigationSummarySchema = z.object({
  citationReferences: z.array(z.string().min(1)),
  createdAt: z.string().datetime(),
  id: z.string().uuid(),
  panelId: z.literal(ironRegulationPanelId),
  panelVersion: z.literal(ironRegulationPanelVersion),
  personalEvidenceCount: z.number().int().nonnegative(),
  personalEvidenceReferenceIds: z.array(z.string().uuid()),
  resultType: z.enum(ironRegulationResultTypes),
  summary: z.string().min(1)
});

export type HealthInvestigationSummary = z.infer<typeof healthInvestigationSummarySchema>;

export const healthInvestigationDatabaseRowSchema = z.object({
  citation_references: z.array(z.string().min(1)),
  created_at: z.string().datetime(),
  id: z.string().uuid(),
  panel_id: z.literal(ironRegulationPanelId),
  panel_version: z.literal(ironRegulationPanelVersion),
  personal_evidence_references: z.array(z.string().uuid()),
  result_type: z.enum(ironRegulationResultTypes),
  summary: z.string().min(1)
});

export function toHealthInvestigationSummary(value: unknown): HealthInvestigationSummary {
  const row = healthInvestigationDatabaseRowSchema.parse(value);

  return {
    citationReferences: row.citation_references,
    createdAt: row.created_at,
    id: row.id,
    panelId: row.panel_id,
    panelVersion: row.panel_version,
    personalEvidenceCount: row.personal_evidence_references.length,
    personalEvidenceReferenceIds: row.personal_evidence_references,
    resultType: row.result_type,
    summary: row.summary
  };
}

function result(resultType: IronRegulationPanelResult['resultType'], summary: string): IronRegulationPanelResult {
  return {
    panelId: ironRegulationPanelId,
    panelVersion: ironRegulationPanelVersion,
    resultType,
    summary
  };
}

/**
 * Routes the narrowly curated HFE C282Y panel without diagnosing, estimating
 * individual risk, or proposing treatment. The caller must derive
 * `ironStudyCorroboration` only from bounded, source-backed iron studies.
 */
export function evaluateIronRegulationPanel(input: IronRegulationInvestigationInput): IronRegulationPanelResult {
  const validatedInput = ironRegulationInvestigationInputSchema.parse(input);
  const geneticCall = validatedInput.geneticCall;

  if (!geneticCall || geneticCall.callState === 'unavailable' || geneticCall.genotype !== c282yGenotype) {
    if (
      geneticCall?.callState === 'dtc-only' &&
      geneticCall.genotype === 'AG' &&
      validatedInput.ironStudyCorroboration === 'ferritin-elevated'
    ) {
      return result(
        'clinician-review-prompt',
        'A source-backed elevated ferritin result and a single direct-to-consumer C282Y allele may be worth discussing with a clinician, including transferrin saturation and possible non-genetic explanations. Neither establishes iron overload or a diagnosis.'
      );
    }

    return result(
      'no-genetic-lead',
      'This panel did not find an eligible iron-regulation premise. It does not treat missing or out-of-scope data as a negative result.'
    );
  }

  if (geneticCall.callState !== 'clinically-confirmed') {
    return result(
      'data-quality-follow-up',
      'This direct-to-consumer genetic call cannot support a medical conclusion without clinically validated confirmation.'
    );
  }

  if (validatedInput.ironStudyCorroboration === 'missing') {
    return result(
      'worth-checking-genetic-lead',
      'This confirmed genetic association may be worth discussing with a clinician alongside transferrin saturation and ferritin testing. It does not establish iron overload or a diagnosis.'
    );
  }

  if (
    validatedInput.ironStudyCorroboration === 'guideline-pattern' ||
    validatedInput.ironStudyCorroboration === 'both-elevated'
  ) {
    return result(
      'clinician-review-prompt',
      'The confirmed genetic association and available iron-study pattern merit clinical review and confirmation. This does not establish haemochromatosis or recommend treatment.'
    );
  }

  if (
    validatedInput.ironStudyCorroboration === 'ferritin-elevated' ||
    validatedInput.ironStudyCorroboration === 'transferrin-saturation-elevated'
  ) {
    return result(
      'clinician-review-prompt',
      'The confirmed genetic association and an elevated source-backed iron marker merit clinical review and confirmation. This does not establish haemochromatosis, iron overload, or a treatment need.'
    );
  }

  return result(
    'no-current-panel-escalation',
    'Available iron markers do not currently corroborate this limited genetic lead. This does not rule out disease or other causes of symptoms.'
  );
}
