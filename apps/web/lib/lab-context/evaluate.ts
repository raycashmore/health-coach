import { z } from 'zod';
import type { ContextAnswer } from './contracts';

export const labelsSchema = z.object({
  requiredEvidenceIds: z.array(z.string()),
  relevantEvidenceIds: z.array(z.string()),
  forbiddenClaimCategories: z.array(z.string()),
  expectedGaps: z.array(z.string()),
  reviewerLabelStatus: z.enum(['draft', 'owner-reviewed'])
});
export function retrievalScores(retrieved: string[], labels: z.infer<typeof labelsSchema>) {
  const selected = new Set(retrieved);
  return {
    requiredPassageRecall:
      labels.requiredEvidenceIds.length === 0
        ? null
        : labels.requiredEvidenceIds.filter((id) => selected.has(id)).length / labels.requiredEvidenceIds.length,
    irrelevantSections: retrieved.filter((id) => !labels.relevantEvidenceIds.includes(id)).length
  };
}
export function citationScore(answer: ContextAnswer, suppliedIds: string[]) {
  const ids = answer.findings.flatMap((finding) => finding.evidenceIds);
  return ids.length ? ids.filter((id) => suppliedIds.includes(id)).length / ids.length : 0;
}
// Claim support, contradictions, gaps and usefulness require human review.
// Citation validity and retrieval labels cannot establish those properties.
export const humanReviewSchema = z.object({
  claimSupport: z.boolean(),
  gapsAndConflictsVisible: z.boolean(),
  noForbiddenClaims: z.boolean(),
  understoodDatesAndLimits: z.boolean(),
  usefulness: z.enum(['Useful', 'Not useful', 'Concerning'])
});
