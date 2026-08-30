import { describe, expect, it } from 'vitest';

import { bloodPressureReadingSchema, labResultSchema, providerInterpretationSchema } from './personal-health-record.js';

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
});
