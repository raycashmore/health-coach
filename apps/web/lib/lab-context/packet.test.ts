import { describe, expect, it, vi } from 'vitest';
import { contextPacketSchema } from '@health-coach/health-core/lab-context';
import { assembleContextPacket } from './packet';
import { loadSyntheticContextPacket, syntheticContextCase } from './synthetic-packet';

const ownerId = '00000000-0000-4000-8000-000000000001';

describe('prepared evidence packet', () => {
  it('preserves panel provenance, omissions, source statements and timezone calendar windows without generation', async () => {
    const packet = await loadSyntheticContextPacket(ownerId, 'prepared');
    expect(packet.panel).toMatchObject({
      collectionDate: '2026-01-20',
      sourceId: 'synthetic-laboratory',
      omittedResults: 1
    });
    expect(packet.panel?.results[0]).toMatchObject({
      value: 12,
      unit: 'example units',
      referenceRange: '8–10',
      evidenceId: 'lab-1'
    });
    expect(packet.windows).toMatchObject([
      {
        id: 'activity-collection',
        start: '2026-01-06',
        end: '2026-01-19',
        timeZone: 'Australia/Sydney',
        expectedDays: 14,
        coveredStepsDays: 1,
        coveredSleepDays: 0
      },
      { id: 'activity-request', start: '2026-01-09', end: '2026-01-22', coveredStepsDays: 2, coveredSleepDays: 2 }
    ]);
    expect(packet.windows.flatMap((window) => window.days).some((day) => day.steps === 99999)).toBe(false);
    expect(packet.notes).toMatchObject({ status: 'current', omittedSections: 1, datedCount: 0, undatedCount: 2 });
    expect(packet.notes.sections[0]).toMatchObject({
      documentId: 'synthetic-notes',
      startLine: 3,
      endLine: 4,
      authoredDate: null
    });
    expect(packet.notes.sections[0]?.text).toContain('does not establish a cause');
  });
  it('returns lab and activity evidence when note search or revision verification fails, without copying error details', async () => {
    const { request, store } = syntheticContextCase(ownerId, 'prepared');
    for (const failed of [
      { ...store, search: vi.fn().mockRejectedValue(new Error('PRIVATE_SENTINEL')) },
      { ...store, isCurrent: vi.fn().mockRejectedValue(new Error('PRIVATE_SENTINEL')) }
    ]) {
      const packet = await assembleContextPacket(request, { store: failed });
      expect(packet.panel).not.toBeNull();
      expect(packet.windows).toHaveLength(2);
      expect(packet.notes).toMatchObject({ status: 'unavailable', sections: [] });
      expect(JSON.stringify(packet)).not.toContain('PRIVATE_SENTINEL');
    }
  });
  it('withholds passages when the publication is corrected or deleted between search and the current-revision check', async () => {
    const { request, store } = syntheticContextCase(ownerId, 'prepared');
    let currentRevision = 'old-revision';
    const packet = await assembleContextPacket(request, {
      store: {
        search: async (...args) => {
          const previous = await store.search(...args);
          currentRevision = 'replacement-revision';
          return previous;
        },
        isCurrent: async (revision) => revision === currentRevision
      }
    });
    expect(packet.notes).toMatchObject({ status: 'stale', sections: [], omittedSections: null });
    expect(JSON.stringify(packet)).not.toContain('routine may have changed');
    expect(packet.panel).not.toBeNull();
  });
  it('reassembles the corrected revision and deletion without retaining original passages', async () => {
    const original = await loadSyntheticContextPacket(ownerId, 'prepared');
    const corrected = await loadSyntheticContextPacket(ownerId, 'corrected-notes');
    const deleted = await loadSyntheticContextPacket(ownerId, 'deleted-notes');
    expect(new Set([original.notes.revision, corrected.notes.revision, deleted.notes.revision]).size).toBe(3);
    expect(deleted.notes.publishedAt).not.toBe(corrected.notes.publishedAt);
    expect(corrected.notes.sections[0]?.text).toContain('Correction:');
    expect(JSON.stringify(corrected)).not.toContain(original.notes.sections[0]!.text);
    expect(deleted.notes).toMatchObject({ status: 'current', sections: [], omittedSections: 0 });
  });
  it('keeps unavailable activity distinct from zero coverage and retains labs and notes', async () => {
    const packet = await loadSyntheticContextPacket(ownerId, 'activity-unavailable');
    expect(packet).toMatchObject({ activityStatus: 'unavailable', windows: [], notes: { status: 'current' } });
    expect(packet.panel).not.toBeNull();
    expect(JSON.stringify(packet)).not.toContain('4200');
  });
  it('keeps request-relative activity but does not infer a latest panel or collection-relative notes from unknown/tied dates', async () => {
    for (const tied of [false, true]) {
      const { request, store } = syntheticContextCase(ownerId, 'prepared');
      if (tied) request.panels.push({ ...request.panels[0]!, id: 'second-panel' });
      else request.panels[0]!.collectionDate = null;
      const search = vi.spyOn(store, 'search');
      const packet = await assembleContextPacket(request, { store });
      expect(packet).toMatchObject({
        laboratoryStatus: 'ambiguous',
        panel: null,
        notes: { status: 'unavailable', sections: [] }
      });
      expect(packet.panelCandidates).toHaveLength(tied ? 2 : 1);
      expect(packet.windows.map((window) => window.id)).toEqual(['activity-request']);
      expect(search).not.toHaveBeenCalled();
    }
  });
  it('rejects packets that attach passages to unverified note revisions', async () => {
    const packet = await loadSyntheticContextPacket(ownerId, 'prepared');
    expect(contextPacketSchema.safeParse({ ...packet, notes: { ...packet.notes, status: 'stale' } }).success).toBe(
      false
    );
  });
});
