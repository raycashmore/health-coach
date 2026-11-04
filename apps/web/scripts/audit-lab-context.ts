import { z } from 'zod';
import type { LangfuseReader } from './langfuse-reader';

const traceId = z.string().regex(/^[a-f0-9]{32}$/);
const spanId = z.string().regex(/^[a-f0-9]{16}$/);
export const auditReceiptSchema = z.object({
  liveReceipt: z.object({
    projectId: z.string().min(1),
    baseUrl: z.url(),
    observation: z.object({ traceId, spanId }),
    previousRemoteTraceId: traceId.optional(),
    delivery: z.enum(['original', 'metadata-replay']).default('original')
  }),
  reports: z
    .array(
      z.object({
        trace: z.object({
          caseId: z.string().uuid(),
          corpusRevision: z.string().uuid(),
          modelId: z.string().regex(/^[a-z0-9./-]{1,100}$/),
          version: z.literal('lab-context-v1'),
          reasoning: z.literal('medium'),
          inputTokens: z.number().int().nonnegative(),
          outputTokens: z.number().int().nonnegative(),
          noteCount: z.number().int().min(0).max(5),
          omittedNotes: z.number().int().nonnegative(),
          estimatedGenerationUsd: z.number().finite().nonnegative().nullable()
        }),
        scores: z.object({
          requiredPassageRecall: z.number().min(0).max(1).nullable(),
          irrelevantSections: z.number().int().min(0).max(5),
          citationValidity: z.number().min(0).max(1)
        })
      })
    )
    .length(1)
});
type AuditReceipt = z.infer<typeof auditReceiptSchema>;
const observationSchema = z.object({
  id: spanId,
  traceId,
  projectId: z.string(),
  name: z.string(),
  type: z.string(),
  parentObservationId: z.string().nullish(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  userId: z.string().nullish(),
  sessionId: z.string().nullish(),
  statusMessage: z.string().nullish(),
  environment: z.string().optional(),
  version: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  release: z.string().nullish(),
  traceName: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()),
  model: z.string().optional(),
  modelParameters: z.record(z.string(), z.unknown()).optional(),
  usageDetails: z.record(z.string(), z.number()).optional(),
  costDetails: z.record(z.string(), z.number()).optional()
});
const scoreSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  value: z.number(),
  dataType: z.literal('NUMERIC'),
  comment: z.string().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
  subject: z.object({ kind: z.literal('observation'), id: spanId, traceId })
});
function structured(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function metadataSafe(metadata: Record<string, unknown>, receipt: AuditReceipt) {
  const expected = receipt.reports[0]!.trace;
  const equal = (a: unknown, b: unknown) => JSON.stringify(structured(a)) === JSON.stringify(b);
  const rules: Record<string, (value: unknown) => boolean> = {
    caseId: (value) => value === expected.caseId,
    corpusRevision: (value) => value === expected.corpusRevision,
    version: (value) => value === expected.version,
    modelId: (value) => value === expected.modelId,
    reasoning: (value) => value === 'medium',
    delivery: (value) => value === receipt.liveReceipt.delivery,
    status: (value) => value === 'complete',
    failure: (value) => value === 'none',
    noteCount: (value) => value === expected.noteCount,
    omittedNotes: (value) => value === expected.omittedNotes,
    costBasis: (value) => value === 'standard-rate-estimate',
    'scope.name': (value) => value === 'health-coach-lab-context',
    'scope.version': (value) => value === '1',
    'resourceAttributes.service.name': (value) => value === 'health-coach-lab-context',
    'resourceAttributes.telemetry.sdk.name': (value) => value === 'opentelemetry',
    'resourceAttributes.telemetry.sdk.language': (value) => value === 'nodejs',
    'resourceAttributes.telemetry.sdk.version': (value) => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value),
    'attributes.langfuse.environment': (value) => value === 'lab-context-experiment',
    'attributes.langfuse.release': (value) => value === expected.version,
    'attributes.langfuse.internal.is_app_root': (value) => typeof value === 'boolean',
    'attributes.langfuse.trace.name': (value) => value === 'lab-context-answer',
    'attributes.langfuse.observation.type': (value) =>
      ['chain', 'tool', 'retriever', 'generation'].includes(String(value)),
    'attributes.langfuse.observation.model.name': (value) => value === expected.modelId,
    'attributes.langfuse.observation.model.parameters': (value) => equal(value, { reasoning: 'medium' }),
    'attributes.langfuse.observation.usage_details': (value) =>
      equal(value, { input: expected.inputTokens, output: expected.outputTokens }),
    'attributes.langfuse.observation.cost_details': (value) => equal(value, { total: expected.estimatedGenerationUsd })
  };
  return (
    [
      'caseId',
      'corpusRevision',
      'version',
      'modelId',
      'reasoning',
      'delivery',
      'scope.name',
      'scope.version',
      'resourceAttributes.service.name'
    ].every((key) => key in metadata) && Object.entries(metadata).every(([key, value]) => rules[key]?.(value) === true)
  );
}
export async function auditContextReceipt(raw: unknown, reader: LangfuseReader) {
  const receipt = auditReceiptSchema.parse(raw),
    target = receipt.liveReceipt;
  await reader.verifyProject(target.projectId);
  const [rawObservations, rawScores] = await Promise.all([
    reader.observations(target.observation.traceId),
    reader.scores(target.observation.traceId)
  ]);
  const observations = z.array(observationSchema).safeParse(rawObservations);
  const scores = z.array(scoreSchema).safeParse(rawScores);
  const failures = new Set<string>();
  if (!observations.success) failures.add('invalid-observations');
  if (!scores.success) failures.add('invalid-scores');
  if (observations.success) {
    const expectedTypes = {
      'lab-context-answer': 'CHAIN',
      'structured-read': 'TOOL',
      'notes-search': 'RETRIEVER',
      'answer-generation': 'GENERATION'
    };
    if (
      observations.data.length !== 4 ||
      new Set(observations.data.map((row) => row.name)).size !== 4 ||
      new Set(observations.data.map((row) => row.id)).size !== 4
    )
      failures.add('observation-count');
    for (const row of observations.data) {
      const expectedType = expectedTypes[row.name as keyof typeof expectedTypes];
      if (!expectedType || row.type !== expectedType) failures.add('observation-type');
      if (row.projectId !== target.projectId || row.traceId !== target.observation.traceId)
        failures.add('observation-identity');
      if (
        row.name === 'lab-context-answer'
          ? row.id !== target.observation.spanId || row.parentObservationId != null
          : row.parentObservationId !== target.observation.spanId
      )
        failures.add('observation-parent');
      if (row.input != null || row.output != null || row.userId != null || row.sessionId != null || row.statusMessage)
        failures.add('observation-content');
      if (!metadataSafe(row.metadata, receipt)) failures.add('observation-metadata');
      if (
        row.environment !== 'lab-context-experiment' ||
        (row.version && row.version !== receipt.reports[0]!.trace.version) ||
        (row.release && row.release !== receipt.reports[0]!.trace.version) ||
        (row.traceName && row.traceName !== 'lab-context-answer') ||
        row.tags?.length
      )
        failures.add('trace-context');
      if (
        row.name === 'lab-context-answer' &&
        !['status', 'failure', 'noteCount', 'omittedNotes'].every((key) => key in row.metadata)
      )
        failures.add('observation-metadata');
      if (row.name === 'answer-generation') {
        const expected = receipt.reports[0]!.trace;
        if (
          row.model !== expected.modelId ||
          JSON.stringify(row.modelParameters) !== JSON.stringify({ reasoning: 'medium' }) ||
          row.usageDetails?.input !== expected.inputTokens ||
          row.usageDetails?.output !== expected.outputTokens ||
          (expected.estimatedGenerationUsd !== null && row.costDetails?.total !== expected.estimatedGenerationUsd)
        )
          failures.add('generation-accounting');
      } else if (
        row.model ||
        Object.keys(row.modelParameters ?? {}).length ||
        Object.keys(row.usageDetails ?? {}).length ||
        Object.keys(row.costDetails ?? {}).length
      ) {
        failures.add('non-generation-fields');
      }
    }
  }
  if (scores.success) {
    const expected = Object.entries(receipt.reports[0]!.scores).filter(([, value]) => value !== null);
    if (scores.data.length !== expected.length || new Set(scores.data.map((row) => row.name)).size !== expected.length)
      failures.add('score-count');
    for (const row of scores.data) {
      if (!expected.some(([name, value]) => name === row.name && value === row.value)) failures.add('score-value');
      if (
        row.projectId !== target.projectId ||
        row.subject.id !== target.observation.spanId ||
        row.subject.traceId !== target.observation.traceId
      )
        failures.add('score-identity');
      if (row.comment || Object.keys(row.metadata ?? {}).length > 0) failures.add('score-content');
    }
  }
  let deletion: 'not-requested' | 'pending' | 'complete' = 'not-requested';
  if (target.previousRemoteTraceId) {
    if (target.previousRemoteTraceId === target.observation.traceId) throw new Error('invalid-deletion-receipt');
    const [oldObservations, oldScores] = await Promise.all([
      reader.observations(target.previousRemoteTraceId, false),
      reader.scores(target.previousRemoteTraceId)
    ]);
    deletion = oldObservations.length || oldScores.length ? 'pending' : 'complete';
  }
  return {
    status: failures.size ? ('failed' as const) : deletion === 'pending' ? ('pending' as const) : ('passed' as const),
    observationCount: rawObservations.length,
    scoreCount: rawScores.length,
    deletion,
    failures: [...failures]
  };
}
