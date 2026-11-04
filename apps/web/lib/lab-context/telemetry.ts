import { ROOT_CONTEXT, trace as otelTrace } from '@opentelemetry/api';
import { TracerProvider } from '@opentelemetry/sdk-trace';
import type { SpanProcessor } from '@opentelemetry/sdk-trace';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { LangfuseClient } from '@langfuse/client';
import { z } from 'zod';
import type { ContextTrace } from './run';

// Reconstruct only an explicit allowlist, even when callers pass extra fields.
const safeTraceSchema = z.object({
  caseId: z.string().uuid(),
  modelId: z.string().regex(/^[a-z0-9./-]{1,100}$/),
  version: z.literal('lab-context-v1'),
  reasoning: z.literal('medium'),
  corpusRevision: z.string().uuid().nullable(),
  status: z.enum(['complete', 'failed']),
  failure: z.enum(['evidence-unavailable', 'stale-publication', 'generation-failed']).nullable(),
  operations: z
    .array(
      z.object({
        name: z.enum(['structured-read', 'notes-search', 'answer-generation']),
        durationMs: z.number().finite().nonnegative()
      })
    )
    .max(3),
  durationMs: z.number().finite().nonnegative(),
  noteCount: z.number().int().min(0).max(5),
  omittedNotes: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  estimatedGenerationUsd: z.number().finite().nonnegative().nullable()
});
export function operationalRecorder(processor: SpanProcessor) {
  // Deliberately not registered globally: no HTTP, DB, AI SDK or third-party
  // instrumentation can accidentally export health content through this provider.
  const provider = new TracerProvider({ spanProcessors: [processor] });
  const tracer = provider.getTracer('health-coach-lab-context', '1');
  return {
    async record(raw: ContextTrace) {
      const safe = safeTraceSchema.parse(raw);
      const end = Date.now(),
        start = end - safe.durationMs;
      const shared = {
        'langfuse.trace.name': 'lab-context-answer',
        'langfuse.observation.metadata.caseId': safe.caseId,
        'langfuse.observation.metadata.version': safe.version,
        'langfuse.observation.metadata.corpusRevision': safe.corpusRevision ?? 'unavailable',
        'langfuse.observation.metadata.modelId': safe.modelId,
        'langfuse.observation.metadata.reasoning': safe.reasoning
      };
      const root = tracer.startSpan(
        'lab-context-answer',
        {
          startTime: start,
          attributes: {
            ...shared,
            'langfuse.observation.type': 'chain',
            'langfuse.observation.metadata.status': safe.status,
            'langfuse.observation.metadata.failure': safe.failure ?? 'none',
            'langfuse.observation.metadata.noteCount': safe.noteCount,
            'langfuse.observation.metadata.omittedNotes': safe.omittedNotes
          }
        },
        ROOT_CONTEXT
      );
      let offset = start;
      for (const operation of safe.operations) {
        const span = tracer.startSpan(
          operation.name,
          {
            startTime: offset,
            attributes: {
              ...shared,
              'langfuse.observation.type':
                operation.name === 'answer-generation'
                  ? 'generation'
                  : operation.name === 'notes-search'
                    ? 'retriever'
                    : 'tool',
              ...(operation.name === 'answer-generation'
                ? {
                    'langfuse.observation.model.name': safe.modelId,
                    'langfuse.observation.model.parameters': JSON.stringify({ reasoning: safe.reasoning }),
                    'langfuse.observation.usage_details': JSON.stringify({
                      ...(safe.inputTokens === null ? {} : { input: safe.inputTokens }),
                      ...(safe.outputTokens === null ? {} : { output: safe.outputTokens })
                    }),
                    ...(safe.estimatedGenerationUsd === null
                      ? {}
                      : {
                          'langfuse.observation.cost_details': JSON.stringify({ total: safe.estimatedGenerationUsd }),
                          'langfuse.observation.metadata.costBasis': 'standard-rate-estimate'
                        })
                  }
                : {})
            }
          },
          otelTrace.setSpan(ROOT_CONTEXT, root)
        );
        offset += operation.durationMs;
        span.end(offset);
      }
      root.end(end);
      await provider.forceFlush();
      return root.spanContext();
    },
    shutdown: () => provider.shutdown()
  };
}

export function langfuseRecorder(config: { baseUrl: string; publicKey: string; secretKey: string }) {
  const url = new URL(config.baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('invalid-langfuse-destination');
  if (!config.publicKey || !config.secretKey) throw new Error('langfuse-credentials-required');
  const recorder = operationalRecorder(
    new LangfuseSpanProcessor({
      ...config,
      environment: 'lab-context-experiment',
      mediaUploadEnabled: false,
      shouldExportSpan: ({ otelSpan }) => otelSpan.instrumentationScope.name === 'health-coach-lab-context'
    })
  );
  const client = new LangfuseClient({ ...config });
  return {
    ...recorder,
    async scores(
      traceId: string,
      observationId: string,
      scores: {
        requiredPassageRecall: number | null;
        irrelevantSections: number;
        citationValidity: number;
      }
    ) {
      z.string()
        .regex(/^[a-f0-9]{32}$/)
        .parse(traceId);
      z.string()
        .regex(/^[a-f0-9]{16}$/)
        .parse(observationId);
      const safe = z
        .object({
          requiredPassageRecall: z.number().min(0).max(1).nullable(),
          irrelevantSections: z.number().int().min(0).max(5),
          citationValidity: z.number().min(0).max(1)
        })
        .parse(scores);
      for (const name of ['requiredPassageRecall', 'irrelevantSections', 'citationValidity'] as const) {
        const value = safe[name];
        if (value !== null) client.score.create({ traceId, observationId, name, value, dataType: 'NUMERIC' });
      }
      await client.flush();
    }
  };
}
