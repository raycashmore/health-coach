import { z } from 'zod';
import { panelSchema, snapshotSchema, sectionSchema } from '@health-coach/health-core/lab-context';

export const requestSchema = z.object({
  caseId: z.string().uuid(),
  ownerId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  asOf: z.iso.datetime({ offset: true }),
  panels: z.array(panelSchema),
  activity: snapshotSchema
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
