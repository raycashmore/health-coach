import { performance } from 'node:perf_hooks';
import type { LanguageModel } from 'ai';
import { requestSchema, publicationSchema } from './contracts';
import type { ContextRequest, ContextStore } from './contracts';
import { contextVersion, packEvidence, structuredEvidence } from './evidence';
import { contextReasoning, generateContextAnswer } from './generate';

export type ContextOperation = { name: 'structured-read' | 'notes-search' | 'answer-generation'; durationMs: number };
export type ContextTrace = {
  caseId: string;
  modelId: string;
  version: typeof contextVersion;
  reasoning: typeof contextReasoning;
  corpusRevision: string | null;
  status: 'complete' | 'failed';
  failure: 'evidence-unavailable' | 'stale-publication' | 'generation-failed' | null;
  operations: ContextOperation[];
  durationMs: number;
  noteCount: number;
  omittedNotes: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedGenerationUsd: number | null;
};
export async function runContextBaseline(
  raw: ContextRequest,
  dependencies: {
    store: ContextStore;
    model: LanguageModel;
    modelId: string;
    record: (trace: ContextTrace) => Promise<void>;
  }
) {
  const request = requestSchema.parse(raw),
    started = performance.now();
  const trace: ContextTrace = {
    caseId: request.caseId,
    modelId: dependencies.modelId,
    version: contextVersion,
    reasoning: contextReasoning,
    corpusRevision: null,
    status: 'failed',
    failure: 'evidence-unavailable',
    operations: [],
    durationMs: 0,
    noteCount: 0,
    omittedNotes: 0,
    inputTokens: null,
    outputTokens: null,
    estimatedGenerationUsd: null
  };
  async function measure<T>(name: ContextOperation['name'], action: () => Promise<T> | T) {
    const start = performance.now();
    try {
      return await action();
    } finally {
      trace.operations.push({ name, durationMs: performance.now() - start });
    }
  }
  let telemetry: 'recorded' | 'failed' = 'recorded';
  try {
    const structured = await measure('structured-read', () => structuredEvidence(request));
    const start = structured.windows.map((window) => window.start).sort()[0]!;
    const end = structured.requestDate;
    const publication = publicationSchema.parse(
      await measure('notes-search', () => dependencies.store.search(structured.query, start, end))
    );
    trace.corpusRevision = publication.revision;
    if (publication.sections.length > 5) throw new Error('retrieval-limit');
    const evidence = packEvidence(structured, publication);
    trace.noteCount = evidence.packet.notes.sections.length;
    trace.omittedNotes = evidence.packet.notes.omittedSections;
    trace.failure = 'stale-publication';
    if (!(await dependencies.store.isCurrent(publication.revision))) throw new Error('stale-publication');
    trace.failure = 'generation-failed';
    const result = await measure('answer-generation', () => generateContextAnswer(evidence, dependencies.model));
    trace.inputTokens = result.inputTokens;
    trace.outputTokens = result.outputTokens;
    if (dependencies.modelId === 'openai/gpt-6.1-terra' && result.inputTokens !== null && result.outputTokens !== null)
      trace.estimatedGenerationUsd = (result.inputTokens + 5 * result.outputTokens) / 1_000_000;
    trace.failure = 'stale-publication';
    if (!(await dependencies.store.isCurrent(publication.revision))) throw new Error('stale-publication');
    trace.status = 'complete';
    trace.failure = null;
    return {
      ...result,
      evidence,
      trace,
      get telemetry() {
        return telemetry;
      },
      reviewStatus: 'needs-human-review' as const
    };
  } finally {
    trace.durationMs = performance.now() - started;
    try {
      await dependencies.record(trace);
    } catch {
      telemetry = 'failed';
    }
  }
}
