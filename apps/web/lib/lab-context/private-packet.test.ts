import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { syntheticContextCase } from './synthetic-packet';

const hooks = vi.hoisted(() => ({ afterAssembly: async () => {} }));
vi.mock('./packet', async (original) => {
  const actual = await original<typeof import('./packet')>();
  return {
    assembleContextPacket: async (...args: Parameters<typeof actual.assembleContextPacket>) => {
      const packet = await actual.assembleContextPacket(...args);
      await hooks.afterAssembly();
      return packet;
    }
  };
});
import { loadPrivateContextPacket } from './private-packet';

let directory: string;
let path: string;
let notePath: string;
let labPath: string;
const ownerId = '00000000-0000-4000-8000-000000000001';
const now = new Date('2026-01-22T14:00:00Z');
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'prepared-context-test-'));
  path = join(directory, 'case.json');
  notePath = join(directory, 'note.md');
  labPath = join(directory, 'report.txt');
  hooks.afterAssembly = async () => {};
  const { request, store } = syntheticContextCase(ownerId, 'prepared');
  request.panels[0]!.omittedSourceResults = 3;
  await writeFile(notePath, 'generic note source');
  await writeFile(labPath, 'generic report source');
  await writeFile(
    path,
    JSON.stringify({
      panels: request.panels,
      notes: await store.search('', '', ''),
      limitations: ['Manually selected excerpts; publication time is preparation time, not authorship.'],
      sources: [
        { role: 'notes', path: notePath, sha256: createHash('sha256').update('generic note source').digest('hex') },
        {
          role: 'laboratory',
          path: labPath,
          sha256: createHash('sha256').update('generic report source').digest('hex')
        }
      ]
    })
  );
});
afterEach(async () => rm(directory, { recursive: true, force: true }));

it('assembles a bounded private packet with server identity/time, explicit omissions and unavailable activity', async () => {
  const packet = await loadPrivateContextPacket(ownerId, path, null, now);
  expect(packet).toMatchObject({
    kind: 'private-context',
    asOf: now.toISOString(),
    activityStatus: 'unavailable',
    windows: [],
    panel: { omittedResults: 4 },
    notes: { status: 'current' }
  });
  expect(packet.caseId).not.toBe('00000000-0000-4000-8000-000000000283');
  expect(packet.limitations.join(' ')).toContain('Manually selected excerpts');
  expect(packet.limitations.join(' ')).not.toContain('Synthetic');
});
it('withholds changed and deleted notes while retaining verified labs', async () => {
  await writeFile(notePath, 'corrected generic note source');
  let packet = await loadPrivateContextPacket(ownerId, path, null, now);
  expect(packet.notes).toMatchObject({ status: 'stale', sections: [] });
  expect(packet.panel).not.toBeNull();
  await rm(notePath);
  packet = await loadPrivateContextPacket(ownerId, path, null, now);
  expect(packet.notes).toMatchObject({ status: 'stale', sections: [] });
});
it('checks notes again after assembly so changes during loading cannot display old passages', async () => {
  hooks.afterAssembly = async () => {
    await writeFile(notePath, 'changed during assembly');
  };
  const packet = await loadPrivateContextPacket(ownerId, path, null, now);
  expect(packet.notes).toMatchObject({ status: 'stale', sections: [] });
  expect(packet.panel).not.toBeNull();
});
it('withholds changed or deleted report evidence while retaining independently dated request activity', async () => {
  const { request } = syntheticContextCase(ownerId, 'prepared');
  const activity = { ...request.activity, days: request.activity.days.filter((day) => day.date < '2026-01-23') };
  async function expectPartial() {
    const packet = await loadPrivateContextPacket(ownerId, path, activity, now);
    expect(packet).toMatchObject({
      laboratoryStatus: 'unavailable',
      panel: null,
      panelCandidates: [],
      notes: { status: 'unavailable', sections: [] }
    });
    expect(packet.windows.map((window) => window.id)).toEqual(['activity-request']);
    expect(packet.windows[0]?.coveredStepsDays).toBe(2);
    expect(packet.limitations.join(' ')).toContain('Laboratory source changed or is unavailable');
  }
  hooks.afterAssembly = async () => {
    await writeFile(labPath, 'changed during assembly');
  };
  await expectPartial();
  hooks.afterAssembly = async () => {};
  await expectPartial();
  await rm(labPath);
  await expectPartial();
});
it('does not label an empty publication current without a verified notes source', async () => {
  const prepared = JSON.parse(await readFile(path, 'utf8')) as {
    notes: { sections: unknown[]; totalMatches: number };
    sources: { role: string }[];
  };
  prepared.notes.sections = [];
  prepared.notes.totalMatches = 0;
  prepared.sources = prepared.sources.filter((source) => source.role !== 'notes');
  await writeFile(path, JSON.stringify(prepared));
  const packet = await loadPrivateContextPacket(ownerId, path, null, now);
  expect(packet.panel).not.toBeNull();
  expect(packet.notes).toMatchObject({ status: 'unavailable', sections: [] });
});
it('rejects malformed, oversized or edited preparation files and unrelated activity dates', async () => {
  const { request } = syntheticContextCase(ownerId, 'prepared');
  await expect(loadPrivateContextPacket(ownerId, path, request.activity, now)).rejects.toThrow(
    'private-activity-outside-window'
  );
  hooks.afterAssembly = async () => {
    await writeFile(path, '{}');
  };
  await expect(loadPrivateContextPacket(ownerId, path, null, now)).rejects.toThrow('private-case-changed');
  await expect(loadPrivateContextPacket(ownerId, path, null, now)).rejects.toThrow();
  await writeFile(path, ' '.repeat(256 * 1024 + 1));
  await expect(loadPrivateContextPacket(ownerId, path, null, now)).rejects.toThrow('private-source-unavailable');
});
