import { contextPacketSchema } from '@health-coach/health-core/lab-context';
import type { ContextPacket } from '@health-coach/health-core/lab-context';
import { publicationSchema, requestSchema } from './contracts';
import type { ContextRequest, ContextStore } from './contracts';
import { activityWindows, contextRequestDate, packEvidence, structuredEvidence } from './evidence';

/** Assemble prepared evidence only. No generation, persistence or private source discovery. */
export async function assembleContextPacket(
  raw: ContextRequest,
  dependencies: { store: ContextStore; activityAvailable?: boolean; now?: () => Date; kind?: ContextPacket['kind'] }
): Promise<ContextPacket> {
  const request = requestSchema.parse(raw);
  const requestDate = contextRequestDate(request.asOf, request.activity.timeZone);
  const packet: ContextPacket = {
    kind: dependencies.kind ?? 'synthetic-context',
    caseId: request.caseId,
    question: request.question,
    asOf: request.asOf,
    requestDate,
    panel: null,
    panelCandidates: request.panels.map(({ id, sourceId, collectionDate }) => ({ id, sourceId, collectionDate })),
    laboratoryStatus: 'available',
    activityStatus: dependencies.activityAvailable === false ? 'unavailable' : 'available',
    activitySnapshotId: request.activity.id,
    windows: [],
    notes: {
      status: 'unavailable',
      revision: null,
      publishedAt: null,
      checkedAt: (dependencies.now?.() ?? new Date()).toISOString(),
      sections: [],
      omittedSections: null,
      datedCount: 0,
      undatedCount: 0
    },
    limitations: [
      dependencies.kind === 'private-context'
        ? 'Prepared private evidence only. No AI interpretation or health recommendation.'
        : 'Synthetic prepared evidence only. No AI interpretation or health recommendation.'
    ]
  };
  // An unavailable read must never be interpreted as a genuine empty/zero activity record.
  const evidenceRequest =
    dependencies.activityAvailable === false ? { ...request, activity: { ...request.activity, days: [] } } : request;
  let structured: ReturnType<typeof structuredEvidence>;
  try {
    structured = structuredEvidence(evidenceRequest);
    packet.panel = structured.panel;
  } catch (error) {
    packet.laboratoryStatus =
      error instanceof Error && error.message === 'ambiguous-panel-date' ? 'ambiguous' : 'unavailable';
    packet.limitations.push(
      packet.laboratoryStatus === 'ambiguous'
        ? 'The latest panel cannot be chosen because collection dates are missing, tied or unavailable for this date.'
        : 'Laboratory evidence could not be verified.'
    );
    if (dependencies.activityAvailable !== false) packet.windows = activityWindows(request.activity, requestDate, null);
    packet.limitations.push(
      'Collection-relative activity and relevant notes were not selected without an unambiguous panel.'
    );
    return contextPacketSchema.parse(packet);
  }
  packet.windows = dependencies.activityAvailable === false ? [] : structured.windows;
  if (dependencies.activityAvailable === false)
    packet.limitations.push('Activity source unavailable; no activity values or coverage were used.');
  else packet.limitations.push('Missing activity days are unknown, not zero. Each window excludes its anchor date.');
  try {
    const start = structured.windows.map((window) => window.start).sort()[0]!;
    const publication = publicationSchema.parse(await dependencies.store.search(structured.query, start, requestDate));
    packet.notes.revision = publication.revision;
    packet.notes.publishedAt = publication.publishedAt;
    const packed = packEvidence(structured, publication);
    if (!(await dependencies.store.isCurrent(publication.revision))) {
      packet.notes.status = 'stale';
      packet.limitations.push(
        'Notes changed or were deleted while loading. Old passages were withheld; reload to check the current revision.'
      );
    } else {
      packet.notes = {
        ...packed.packet.notes,
        status: 'current',
        checkedAt: (dependencies.now?.() ?? new Date()).toISOString()
      };
      packet.limitations.push(
        'Notes are attributed source statements, not verified health observations. Undated notes do not establish chronology.'
      );
    }
  } catch {
    packet.notes.status = 'unavailable';
    packet.limitations.push(
      'Notes could not be loaded or their revision could not be verified. No note passages were used.'
    );
  }
  return contextPacketSchema.parse(packet);
}
