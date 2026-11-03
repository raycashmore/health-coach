import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareMarkdown } from './retrieval/prepare-markdown.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(repository, 'private-data/retrieval/prepared.json');
try {
  const [root, ...selection] = process.argv.slice(2);
  const files = selection.length === 1 && selection[0] === '--empty' ? [] : selection;
  if (!root || !selection.length)
    throw new Error('Usage: pnpm retrieval:prepare ROOT selected.md [folder/other.md ...]');
  let previous;
  try {
    previous = JSON.parse(await readFile(output, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // A manifest belongs to one source root. Do not reuse identities across vaults.
  const { realpath } = await import('node:fs/promises');
  const sourceRoot = await realpath(root);
  if (previous && previous.sourceRoot !== sourceRoot)
    throw new Error('Existing manifest belongs to another root; archive it before changing roots');
  const result = await prepareMarkdown({ root, files, previous });
  await mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...result, sourceRoot }, null, 2), { mode: 0o600 });
  await rename(temporary, output);
  console.log(
    JSON.stringify({
      documents: result.documents.length,
      sections: result.documents.reduce((n, doc) => n + doc.sections.length, 0),
      added: result.changes.added,
      updated: result.changes.updated,
      renamed: result.changes.renamed,
      deleted: result.changes.deletedIds.length,
      readyForIndexing: result.readyForIndexing
    })
  );
} catch {
  // Filesystem errors can contain private filenames. Details stay out of logs.
  console.error(
    'Preparation failed. Check selected paths, Markdown structure and existing local manifest. See docs/research/retrieval-experiment.md.'
  );
  process.exitCode = 1;
}
