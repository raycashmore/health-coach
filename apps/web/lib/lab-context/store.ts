import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from 'postgres';
import { publicationSchema } from './contracts';
import { sectionSchema } from '@health-coach/health-core/lab-context';
import type { ContextStore } from './contracts';

export const manifestSchema = z
  .array(
    z.object({
      id: z.string().min(1),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      authoredDate: z.iso.date().nullable(),
      sections: z.array(sectionSchema.omit({ documentId: true, authoredDate: true })).min(1)
    })
  )
  .superRefine((docs, ctx) => {
    const ids = docs.flatMap((doc) => doc.sections.map((section) => section.id));
    if (new Set(docs.map((doc) => doc.id)).size !== docs.length || new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate manifest identity' });
  });

// Local trusted-runner identity, scoped per transaction. This is not a hosted
// authentication boundary; an untrusted caller must never choose this owner ID.
export function contextStore(
  sql: Sql,
  owner: string
): ContextStore & {
  publish: (manifest: z.infer<typeof manifestSchema>, removed: string[], expected: string | null) => Promise<string>;
} {
  const ownerId = z.string().uuid().parse(owner);
  return {
    async publish(raw, removed, expected) {
      const manifest = manifestSchema.parse(raw),
        revision = randomUUID();
      await sql.begin(async (tx) => {
        await tx`select set_config('hc_context.owner_id', ${ownerId}, true)`;
        await tx`select hc_context.publish(${ownerId}::uuid, ${revision}::uuid, ${expected}::uuid,
          ${tx.json(manifest)}::jsonb, ${removed}::text[])`;
      });
      return revision;
    },
    async search(query, start, end) {
      return sql.begin('isolation level repeatable read', async (tx) => {
        await tx`select set_config('hc_context.owner_id', ${ownerId}, true)`;
        const publications =
          await tx`select revision, published_at from hc_context.publications where owner_id = ${ownerId}::uuid`;
        const publication = publications[0];
        if (!publication) throw new Error('notes-not-published');
        const sections = query
          ? await tx`select section_id as id, document_id as "documentId",
          heading_path as "headingPath", start_line as "startLine", end_line as "endLine",
          authored_date::text as "authoredDate", body as text, count(*) over() as "totalMatches"
          from hc_context.sections where owner_id = ${ownerId}::uuid
          and (authored_date is null or authored_date between ${start}::date and ${end}::date)
          and fts @@ websearch_to_tsquery('english', ${query})
          order by ts_rank_cd(fts, websearch_to_tsquery('english', ${query})) desc, section_id limit 5`
          : [];
        return publicationSchema.parse({
          revision: publication.revision,
          publishedAt: new Date(publication.published_at).toISOString(),
          sections,
          totalMatches: Number(sections[0]?.totalMatches ?? 0)
        });
      });
    },
    async isCurrent(revision) {
      return sql.begin(async (tx) => {
        await tx`select set_config('hc_context.owner_id', ${ownerId}, true)`;
        const rows =
          await tx`select 1 from hc_context.publications where owner_id = ${ownerId}::uuid and revision = ${revision}::uuid`;
        return rows.length === 1;
      });
    }
  };
}
