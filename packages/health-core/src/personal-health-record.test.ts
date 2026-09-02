import { describe, expect, it } from 'vitest';

import {
  bloodPressureReadingSchema,
  geneticVariantSchema,
  healthFollowUpSchema,
  labResultSchema,
  providerInterpretationSchema
} from './personal-health-record.js';

const ownerEnteredSource = {
  provider: 'owner',
  sourceIdentifier: 'manual-entry',
  kind: 'owner-entry' as const,
  importedAt: '2026-08-22T09:00:00.000Z',
  verificationState: 'verified' as const
};

describe('Personal Health Record contracts', () => {
  it('accepts a source-backed blood-pressure reading', () => {
    const result = bloodPressureReadingSchema.safeParse({
      systolicMmhg: 120,
      diastolicMmhg: 80,
      recordedAt: '2026-08-22T09:00:00.000Z',
      source: ownerEnteredSource
    });

    expect(result.success).toBe(true);
  });

  it('accepts a source-backed lab result', () => {
    const result = labResultSchema.safeParse({
      testName: 'Example marker',
      value: 12.5,
      unit: 'unit/L',
      referenceRange: '5 - 15',
      recordedAt: '2026-08-22T09:00:00.000Z',
      source: ownerEnteredSource
    });

    expect(result.success).toBe(true);
  });

  it('keeps a provider interpretation attributed instead of treating it as a fact', () => {
    const result = providerInterpretationSchema.safeParse({
      source: {
        provider: 'Example provider',
        sourceIdentifier: 'report-2026-08',
        kind: 'provider-report',
        importedAt: '2026-08-22T09:00:00.000Z',
        verificationState: 'parsed'
      },
      topic: 'Example topic',
      interpretation: 'A concise attributed interpretation.',
      extractedAt: '2026-08-22T09:00:00.000Z'
    });

    expect(result.success).toBe(true);
  });

  it('rejects a provider interpretation that omits source provenance', () => {
    const result = providerInterpretationSchema.safeParse({
      topic: 'Example topic',
      interpretation: 'A concise attributed interpretation.',
      extractedAt: '2026-08-22T09:00:00.000Z'
    });

    expect(result.success).toBe(false);
  });

  it('allows only explicit supported genome builds for genetic variants', () => {
    expect(
      geneticVariantSchema.safeParse({
        chromosome: '6',
        genomeBuild: 'GRCh37',
        genotype: 'AA',
        position: 26093141,
        rsid: 'rs1800562',
        source: ownerEnteredSource
      }).success
    ).toBe(true);
    expect(
      geneticVariantSchema.safeParse({
        chromosome: '6',
        genomeBuild: 'unverified-build',
        genotype: 'AA',
        position: 26093141,
        rsid: 'rs1800562',
        source: ownerEnteredSource
      }).success
    ).toBe(false);
  });

  it('requires completion evidence for a completed Health Follow-up', () => {
    const followUp = {
      dueEnd: '2026-10-01T00:00:00.000Z',
      dueStart: '2026-09-01T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000001',
      investigationId: '00000000-0000-4000-8000-000000000002',
      purpose: 'Arrange the next appropriate review.',
      rationale: 'A bounded, non-diagnostic rationale.',
      state: 'completed' as const
    };

    expect(healthFollowUpSchema.safeParse(followUp).success).toBe(false);
    expect(
      healthFollowUpSchema.safeParse({
        ...followUp,
        completedAt: '2026-09-10T00:00:00.000Z',
        completedSourceId: '00000000-0000-4000-8000-000000000003'
      }).success
    ).toBe(true);
  });
});
