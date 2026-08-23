import { z } from 'zod';

export const sourceKinds = ['genetic-export', 'provider-report', 'owner-entry'] as const;

export const verificationStates = ['unverified', 'parsed', 'verified'] as const;

export const sourceMetadataSchema = z.object({
  provider: z.string().min(1),
  sourceIdentifier: z.string().min(1),
  kind: z.enum(sourceKinds),
  observedAt: z.string().datetime().optional(),
  importedAt: z.string().datetime(),
  verificationState: z.enum(verificationStates)
});

export const sourceCoverageSchema = z.object({
  sourceIdentifier: z.string().min(1),
  dataTypes: z.array(z.string().min(1)).min(1),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  synchronizedAt: z.string().datetime()
});

export const geneticVariantSchema = z.object({
  rsid: z.string().regex(/^rs\d+$/i),
  genotype: z.string().regex(/^[ACGT-]{1,2}$/i),
  genomeBuild: z.string().min(1).optional(),
  source: sourceMetadataSchema
});

export const bloodPressureObservationSchema = z.object({
  kind: z.literal('blood-pressure'),
  systolicMmhg: z.number().int().positive(),
  diastolicMmhg: z.number().int().positive(),
  pulseBpm: z.number().int().positive().optional(),
  recordedAt: z.string().datetime(),
  source: sourceMetadataSchema
});

export const labResultObservationSchema = z.object({
  kind: z.literal('lab-result'),
  testName: z.string().min(1),
  value: z.number(),
  unit: z.string().min(1),
  referenceRange: z.string().min(1).optional(),
  recordedAt: z.string().datetime(),
  source: sourceMetadataSchema
});

export const healthObservationSchema = z.discriminatedUnion('kind', [
  bloodPressureObservationSchema,
  labResultObservationSchema
]);

export const providerInterpretationSchema = z.object({
  source: sourceMetadataSchema,
  topic: z.string().min(1),
  interpretation: z.string().min(1),
  extractedAt: z.string().datetime()
});

export const supplementRegimenSchema = z.object({
  ingredient: z.string().min(1),
  form: z.string().min(1),
  dose: z.string().min(1),
  frequency: z.string().min(1),
  activeFrom: z.string().datetime(),
  activeUntil: z.string().datetime().optional(),
  source: sourceMetadataSchema
});

export type SourceMetadata = z.infer<typeof sourceMetadataSchema>;
export type SourceCoverage = z.infer<typeof sourceCoverageSchema>;
export type GeneticVariant = z.infer<typeof geneticVariantSchema>;
export type HealthObservation = z.infer<typeof healthObservationSchema>;
export type ProviderInterpretation = z.infer<typeof providerInterpretationSchema>;
export type SupplementRegimen = z.infer<typeof supplementRegimenSchema>;
