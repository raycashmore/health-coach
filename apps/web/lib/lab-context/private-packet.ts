import { createHash, randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { panelSchema, snapshotSchema } from '@health-coach/health-core/lab-context';
import { shiftDate } from '@health-coach/health-core/wearable-review';
import { publicationSchema } from './contracts';
import { contextRequestDate } from './evidence';
import { assembleContextPacket } from './packet';

const preparedCaseSchema = z
  .strictObject({
    panels: z.array(panelSchema).min(1).max(10),
    notes: publicationSchema,
    limitations: z.array(z.string().min(1).max(1000)).max(12).default([]),
    sources: z
      .array(
        z.strictObject({
          role: z.enum(['laboratory', 'notes']),
          path: z.string().refine(isAbsolute),
          sha256: z.string().regex(/^[a-f0-9]{64}$/)
        })
      )
      .min(1)
      .max(8)
  })
  .refine(
    (value) =>
      value.sources.some((source) => source.role === 'laboratory') &&
      (!value.notes.sections.length || value.sources.some((source) => source.role === 'notes')),
    'Missing source verification'
  );

export const privateContextBodySchema = z.strictObject({
  activity: snapshotSchema.refine((value) => value.days.length <= 14).nullable()
});

async function readBoundedFile(path: string, limit: number) {
  const file = await open(path, 'r');
  try {
    const metadata = await file.stat();
    if (!metadata.isFile() || metadata.size > limit) throw new Error('private-source-unavailable');
    const buffer = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > limit) throw new Error('private-source-unavailable');
    return buffer.subarray(0, length);
  } finally {
    await file.close();
  }
}

/** One explicitly configured, prepared case. No discovery, generation or persistence. */
export async function loadPrivateContextPacket(
  ownerId: string,
  path: string,
  activity: z.infer<typeof snapshotSchema> | null,
  now = new Date()
) {
  if (!isAbsolute(path)) throw new Error('private-case-unavailable');
  const preparedBytes = await readBoundedFile(path, 256 * 1024);
  const prepared = preparedCaseSchema.parse(JSON.parse(preparedBytes.toString('utf8')));
  async function verifySources() {
    let notesCurrent = true;
    let laboratoryCurrent = true;
    for (const source of prepared.sources) {
      try {
        const bytes = await readBoundedFile(source.path, 32 * 1024 * 1024);
        if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
          throw new Error('private-source-changed');
      } catch {
        if (source.role === 'laboratory') laboratoryCurrent = false;
        else notesCurrent = false;
      }
    }
    // Editing the prepared manifest also invalidates a packet already being assembled.
    if (!(await readBoundedFile(path, 256 * 1024)).equals(preparedBytes)) throw new Error('private-case-changed');
    return { notesCurrent, laboratoryCurrent };
  }
  const initialSources = await verifySources();
  const asOf = now.toISOString();
  const timeZone = activity?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const requestDate = contextRequestDate(asOf, timeZone);
  if (activity?.days.some((day) => day.date < shiftDate(requestDate, -14) || day.date >= requestDate))
    throw new Error('private-activity-outside-window');
  const packet = await assembleContextPacket(
    {
      ownerId,
      caseId: randomUUID(),
      question: 'Show the latest laboratory panel alongside activity and relevant notes.',
      asOf,
      panels: initialSources.laboratoryCurrent ? prepared.panels : [],
      activity: { ...(activity ?? { timeZone, days: [] }), id: randomUUID() }
    },
    {
      kind: 'private-context',
      activityAvailable: activity !== null,
      now: () => now,
      store: {
        search: async () => {
          if (!prepared.sources.some((source) => source.role === 'notes')) throw new Error('private-notes-unavailable');
          return prepared.notes;
        },
        isCurrent: async (revision) => initialSources.notesCurrent && revision === prepared.notes.revision
      }
    }
  );
  const finalSources = await verifySources();
  if (!initialSources.laboratoryCurrent || !finalSources.laboratoryCurrent) {
    packet.panel = null;
    packet.panelCandidates = [];
    packet.laboratoryStatus = 'unavailable';
    packet.windows = packet.windows.filter((window) => window.id === 'activity-request');
    packet.notes = {
      status: 'unavailable',
      revision: null,
      publishedAt: null,
      checkedAt: now.toISOString(),
      sections: [],
      omittedSections: null,
      datedCount: 0,
      undatedCount: 0
    };
    packet.limitations.push(
      'Laboratory source changed or is unavailable. Laboratory values, collection-relative activity and panel-selected notes were withheld; prepare current sources again.'
    );
  }
  if (!finalSources.notesCurrent && packet.notes.status === 'current') {
    packet.notes = {
      ...packet.notes,
      status: 'stale',
      sections: [],
      omittedSections: null,
      datedCount: 0,
      undatedCount: 0
    };
    packet.limitations.push(
      'Notes changed or were deleted while loading. Old passages were withheld; prepare current sources again.'
    );
  }
  packet.limitations.push(
    'Only the explicitly prepared source passages and laboratory subset were considered. Source freshness was checked at loading.',
    ...prepared.limitations
  );
  if (activity)
    packet.limitations.push(
      'Steps retain their local activity date. Recorded sleep is session duration grouped by local wake day; unfinished days are excluded. No historical activity was reconstructed.'
    );
  return packet;
}
