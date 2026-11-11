import { z } from 'zod';

export const dateSchema = z.iso.date();
export const panelSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  collectionDate: dateSchema.nullable(),
  omittedSourceResults: z.number().int().nonnegative().optional(),
  results: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1),
        value: z.number().finite(),
        unit: z.string().min(1),
        referenceRange: z.string().nullable(),
        aliases: z.array(z.string()).default([])
      })
    )
    .min(1)
});
export const snapshotSchema = z
  .object({
    id: z.string().uuid(),
    timeZone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
    days: z.array(
      z.object({
        date: dateSchema,
        steps: z.number().int().nonnegative().nullable(),
        sleepMinutes: z.number().nonnegative().nullable()
      })
    )
  })
  .superRefine((value, ctx) => {
    if (new Set(value.days.map((day) => day.date)).size !== value.days.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate activity dates' });
  });
export const sectionSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  headingPath: z.array(z.string()),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string().min(1),
  authoredDate: dateSchema.nullable()
});

const windowSchema = z.object({
  id: z.enum(['activity-collection', 'activity-request']),
  start: dateSchema,
  end: dateSchema,
  timeZone: snapshotSchema.shape.timeZone,
  expectedDays: z.literal(14),
  coveredStepsDays: z.number().int().min(0).max(14),
  coveredSleepDays: z.number().int().min(0).max(14),
  days: snapshotSchema.shape.days
});

export const syntheticContextScenarioSchema = z.enum([
  'prepared',
  'corrected-notes',
  'deleted-notes',
  'notes-unavailable',
  'stale-notes',
  'activity-unavailable',
  'ambiguous-dates'
]);
export type SyntheticContextScenario = z.infer<typeof syntheticContextScenarioSchema>;

export const contextPacketSchema = z
  .object({
    kind: z.enum(['synthetic-context', 'private-context']),
    caseId: z.string().uuid(),
    question: z.string(),
    asOf: z.iso.datetime({ offset: true }),
    requestDate: dateSchema,
    panel: panelSchema
      .extend({
        results: z.array(panelSchema.shape.results.element.extend({ evidenceId: z.string() })),
        omittedResults: z.number().int().nonnegative()
      })
      .nullable(),
    panelCandidates: z.array(panelSchema.pick({ id: true, sourceId: true, collectionDate: true })),
    laboratoryStatus: z.enum(['available', 'ambiguous', 'unavailable']),
    activityStatus: z.enum(['available', 'unavailable']),
    activitySnapshotId: z.string().uuid(),
    windows: z.array(windowSchema),
    notes: z.object({
      status: z.enum(['current', 'unavailable', 'stale']),
      revision: z.string().uuid().nullable(),
      publishedAt: z.iso.datetime({ offset: true }).nullable(),
      checkedAt: z.iso.datetime({ offset: true }),
      sections: z.array(sectionSchema.extend({ evidenceId: z.string() })),
      omittedSections: z.number().int().nonnegative().nullable(),
      datedCount: z.number().int().nonnegative(),
      undatedCount: z.number().int().nonnegative()
    }),
    limitations: z.array(z.string())
  })
  .superRefine((packet, ctx) => {
    if (packet.notes.status !== 'current' && packet.notes.sections.length)
      ctx.addIssue({ code: 'custom', message: 'Unverified notes must not be displayed' });
  });
export type ContextPacket = z.infer<typeof contextPacketSchema>;
