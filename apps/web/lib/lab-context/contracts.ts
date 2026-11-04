import { z } from 'zod';

export const dateSchema = z.iso.date();
export const panelSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  collectionDate: dateSchema.nullable(),
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
export const requestSchema = z.object({
  caseId: z.string().uuid(),
  ownerId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  asOf: z.iso.datetime({ offset: true }),
  panels: z.array(panelSchema),
  activity: snapshotSchema
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
export const publicationSchema = z
  .object({
    revision: z.string().uuid(),
    publishedAt: z.iso.datetime({ offset: true }),
    sections: z.array(sectionSchema),
    totalMatches: z.number().int().nonnegative()
  })
  .refine((value) => value.totalMatches >= value.sections.length, 'Invalid match count');
export const answerSchema = z.object({
  findings: z
    .array(z.object({ text: z.string().min(1).max(1500), evidenceIds: z.array(z.string()).min(1) }))
    .min(1)
    .max(12),
  limitations: z.array(z.string().min(1).max(1000)).max(12)
});
export type ContextRequest = z.infer<typeof requestSchema>;
export type NoteSection = z.infer<typeof sectionSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type ContextAnswer = z.infer<typeof answerSchema>;
export type ContextStore = {
  search: (query: string, start: string, end: string) => Promise<Publication>;
  isCurrent: (revision: string) => Promise<boolean>;
};
