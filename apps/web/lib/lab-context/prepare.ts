import { prepareMarkdown } from '../../../../scripts/retrieval/prepare-markdown.mjs';
import type { PreparedMarkdown } from '../../../../scripts/retrieval/prepare-markdown.mjs';
import { manifestSchema } from './store';

export async function prepareContextPublication(options: {
  root: string;
  files: string[];
  previous?: PreparedMarkdown;
  dates: Record<string, string | null>;
  explicitlyRemoved: string[];
}) {
  const prepared = await prepareMarkdown(options);
  if (!prepared.readyForIndexing) throw new Error('markdown-not-indexable');
  if (prepared.changes.deletedIds.some((id) => !options.explicitlyRemoved.includes(id)))
    throw new Error('explicit-removal-required');
  const manifest = manifestSchema.parse(
    prepared.documents.map((doc) => ({
      id: doc.id,
      hash: doc.contentHash,
      // Dates must be selected explicitly. Frontmatter and filesystem timestamps
      // are not promoted into verified dates by the existing parser.
      authoredDate: options.dates[doc.relativePath] ?? null,
      sections: doc.sections
    }))
  );
  return { prepared, manifest, removed: prepared.changes.deletedIds };
}
