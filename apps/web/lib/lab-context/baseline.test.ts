import { describe, expect, it } from 'vitest';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { structuredEvidence, packEvidence, noteQuery } from './evidence';
import { runContextBaseline } from './run';
import { operationalRecorder } from './telemetry';
import { retrievalScores } from './evaluate';
import type { ContextStore } from './contracts';
import { syntheticRequest, syntheticPublication, fakeContextModel } from '../../scripts/lab-context-fixtures';

function store(publication = syntheticPublication()): ContextStore {
  return { search: async () => publication, isCurrent: async () => true };
}
describe('integrated lab context baseline', () => {
  it('reports matching sections omitted by the retrieval limit as well as packing', () => {
    const publication = syntheticPublication();
    publication.sections = Array.from({ length: 5 }, (_, i) => ({ ...publication.sections[0]!, id: `section-${i}` }));
    publication.totalMatches = 6;
    const result = packEvidence(structuredEvidence(syntheticRequest()), publication);
    expect(result.packet.notes.sections).toHaveLength(5);
    expect(result.packet.notes.omittedSections).toBe(1);
  });
  it('uses collection/request calendar windows, preserves incomplete coverage and excludes today', () => {
    const result = structuredEvidence(syntheticRequest());
    expect(result.windows[0]).toMatchObject({
      start: '2026-01-06',
      end: '2026-01-19',
      coveredStepsDays: 1,
      coveredSleepDays: 0
    });
    expect(result.windows[1]?.days).toHaveLength(1);
    expect(noteQuery('What do my latest labs mean?', ['Marker-A'])).toBe('marker-a');
  });
  it('does not guess a latest panel from unknown or ambiguous dates', () => {
    const request = syntheticRequest();
    request.panels[0]!.collectionDate = null;
    expect(() => structuredEvidence(request)).toThrow('ambiguous-panel-date');
    const ambiguous = syntheticRequest();
    ambiguous.panels.push({ ...ambiguous.panels[0]!, id: 'second-panel' });
    expect(() => structuredEvidence(ambiguous)).toThrow('ambiguous-panel-date');
  });
  it('rejects duplicate activity days and invalid timezones', () => {
    const request = syntheticRequest();
    request.activity.days.push(request.activity.days[0]!);
    expect(() => structuredEvidence(request)).toThrow('Duplicate activity dates');
    request.activity.timeZone = 'not-a-zone';
    expect(() => structuredEvidence(request)).toThrow();
  });
  it('packs whole sections, exposes omissions, and fails before generation on mandatory overflow', async () => {
    const publication = syntheticPublication();
    publication.sections[0]!.text = 'x'.repeat(7000);
    const packed = packEvidence(structuredEvidence(syntheticRequest()), publication);
    expect(packed.packet.notes).toMatchObject({ sections: [], omittedSections: 1 });
    const request = syntheticRequest();
    request.panels[0]!.results[0]!.referenceRange = 'x'.repeat(13000);
    const model = fakeContextModel();
    await expect(
      runContextBaseline(request, { store: store(), model, modelId: 'test/fake', record: async () => {} })
    ).rejects.toThrow('input-too-large');
    expect(model.doGenerateCalls).toHaveLength(0);
  });
  it('calls one model with bounded evidence, structured output and no automatic telemetry', async () => {
    const model = fakeContextModel();
    const result = await runContextBaseline(syntheticRequest(), {
      store: store(),
      model,
      modelId: 'test/fake',
      record: async () => {}
    });
    expect(result.reviewStatus).toBe('needs-human-review');
    expect(result.inputTokens).toBe(100);
    expect(model.doGenerateCalls).toHaveLength(1);
    expect(model.doGenerateCalls[0]).toMatchObject({ maxOutputTokens: 6000, reasoning: 'medium' });
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('collectionDate');
  });
  it('rejects unavailable citations and a revision changed during generation', async () => {
    await expect(
      runContextBaseline(syntheticRequest(), {
        store: store(),
        modelId: 'test/fake',
        record: async () => {},
        model: fakeContextModel({ findings: [{ text: 'Unsupported.', evidenceIds: ['note-999'] }], limitations: [] })
      })
    ).rejects.toThrow('invalid-citation');
    let current = 0;
    const changing = { ...store(), isCurrent: async () => ++current === 1 };
    await expect(
      runContextBaseline(syntheticRequest(), {
        store: changing,
        model: fakeContextModel(),
        modelId: 'test/fake',
        record: async () => {}
      })
    ).rejects.toThrow('stale-publication');
  });
  it('does not retry generation when recording fails', async () => {
    const model = fakeContextModel();
    const result = await runContextBaseline(syntheticRequest(), {
      store: store(),
      model,
      modelId: 'test/fake',
      record: async () => {
        throw new Error('sink-unavailable');
      }
    });
    expect(result.telemetry).toBe('failed');
    expect(model.doGenerateCalls).toHaveLength(1);
  });
  it('exports only allowlisted fields, nested operations and total billable tokens', async () => {
    const exporter = new InMemorySpanExporter();
    const recorder = operationalRecorder(new SimpleSpanProcessor({ exporter }));
    try {
      const request = syntheticRequest();
      request.question = 'PRIVATE-SENTINEL';
      const result = await runContextBaseline(request, {
        store: store(),
        model: fakeContextModel(),
        modelId: 'test/fake',
        record: async (trace) => {
          const extra = { ...trace, prompt: 'PRIVATE-SENTINEL', error: 'PRIVATE-SENTINEL' };
          await recorder.record(extra);
        }
      });
      const spans = exporter.getFinishedSpans();
      const root = spans.find((span) => span.name === 'lab-context-answer')!;
      expect(spans).toHaveLength(4);
      expect(spans.every((span) => span.resource.attributes['service.name'] === 'health-coach-lab-context')).toBe(true);
      expect(
        spans
          .filter((span) => span.name !== root.name)
          .every((span) => span.parentSpanContext?.spanId === root.spanContext().spanId)
      ).toBe(true);
      const serialized = JSON.stringify(spans.map((span) => span.attributes));
      expect(serialized).not.toContain('PRIVATE-SENTINEL');
      expect(serialized).not.toContain('Marker A');
      expect(serialized).not.toContain(request.ownerId);
      expect(serialized).toContain('generation');
      expect(result.trace.outputTokens).toBe(50);
    } finally {
      await recorder.shutdown();
    }
  });
  it('keeps absent required evidence distinct from a perfect recall score', () => {
    expect(
      retrievalScores([], {
        requiredEvidenceIds: [],
        relevantEvidenceIds: [],
        forbiddenClaimCategories: [],
        expectedGaps: ['no-notes'],
        reviewerLabelStatus: 'draft'
      }).requiredPassageRecall
    ).toBeNull();
  });
});
