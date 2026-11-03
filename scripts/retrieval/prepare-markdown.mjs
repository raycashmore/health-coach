import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

const hash = (text) => createHash('sha256').update(text).digest('hex');

// Byte limits are deterministic preparation bounds, not model token estimates.
export function sectionMarkdown(text, maxBytes = 4000) {
  if (!Number.isInteger(maxBytes) || maxBytes < 256) throw new Error('Invalid byte budget');
  const lines = text.split(/(?<=\n)/);
  const sections = [];
  const warnings = new Set();
  let headings = [];
  let headingLevels = [];
  let pending = [];
  let start = 1;
  let size = 0;
  function flush() {
    if (!pending.length) return;
    sections.push({
      headingPath: [...headings],
      startLine: start,
      endLine: start + pending.length - 1,
      text: pending.join('')
    });
    pending = [];
    size = 0;
  }
  let i = 0;
  // Keep frontmatter opaque: its fields are not verified source dates.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, n) => n > 0 && /^(---|\.\.\.)$/.test(line.trim()));
    if (end < 0) throw new Error('Unclosed frontmatter');
    pending = lines.slice(0, end + 1);
    start = 1;
    flush();
    i = end + 1;
  }
  while (i < lines.length) {
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[i].trimEnd());
    if (heading) {
      flush();
      headingLevels = headingLevels.filter((item) => item.level < heading[1].length);
      headingLevels.push({ level: heading[1].length, text: heading[2] });
      headings = headingLevels.map((item) => item.text);
    }
    const blockStart = i;
    const fence = /^\s{0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (fence) {
      const closing = new RegExp(`^\\s{0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      i++;
      while (i < lines.length && !closing.test(lines[i])) i++;
      if (i === lines.length) warnings.add('unclosed-fence');
      else i++;
    } else if (i + 1 < lines.length && lines[i].includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      // Keep a table atomic, including its header and units. Oversized tables
      // block indexing until an explicit subdivision strategy is selected.
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) i++;
    } else i++;
    const block = lines.slice(blockStart, i);
    const bytes = Buffer.byteLength(block.join(''));
    if (size + bytes > maxBytes) flush();
    if (!pending.length) start = blockStart + 1;
    pending.push(...block);
    size += bytes;
    if (size > maxBytes) warnings.add('oversized-block');
  }
  flush();
  if (/\[\[|\]\(/.test(text)) warnings.add('links-not-resolved');
  if (sections.some((section) => Buffer.byteLength(section.text) > maxBytes)) warnings.add('oversized-block');
  return { sections, warnings: [...warnings] };
}

export async function prepareMarkdown({ root, files, previous, maxBytes = 4000 }) {
  const canonicalRoot = await realpath(root);
  if (new Set(files).size !== files.length) throw new Error('Select unique Markdown paths');
  const inputs = [];
  for (const relativePath of files) {
    const parts = relativePath.split(/[\\/]/);
    if (
      path.isAbsolute(relativePath) ||
      parts.some((part) => !part || part.startsWith('.')) ||
      !/\.md$/i.test(relativePath)
    )
      throw new Error('Invalid selected Markdown path');
    const filename = path.resolve(canonicalRoot, relativePath);
    const resolved = await realpath(filename);
    if (!resolved.startsWith(canonicalRoot + path.sep) || !(await lstat(filename)).isFile())
      throw new Error('Selected path must be a regular file inside root');
    const text = await readFile(filename, 'utf8');
    inputs.push({ relativePath, text, contentHash: hash(text), revision: hash(`preparation-v1:${maxBytes}:${text}`) });
  }
  const prior = previous?.documents ?? [];
  const used = new Set();
  const documents = [];
  // Reserve unchanged paths before matching unique content-based renames.
  for (const input of inputs) {
    const samePath = prior.find((doc) => doc.relativePath === input.relativePath);
    if (samePath) used.add(samePath.id);
  }
  for (const input of inputs) {
    let old = prior.find((doc) => doc.relativePath === input.relativePath);
    if (!old) {
      const matches = prior.filter((doc) => !used.has(doc.id) && doc.revision === input.revision);
      const newMatches = inputs.filter(
        (doc) => doc.revision === input.revision && !prior.some((p) => p.relativePath === doc.relativePath)
      );
      if (matches.length === 1 && newMatches.length === 1) old = matches[0];
    }
    const id = old?.id ?? randomUUID();
    used.add(id);
    const { sections, warnings } = sectionMarkdown(input.text, maxBytes);
    documents.push({
      id,
      relativePath: input.relativePath,
      contentHash: input.contentHash,
      revision: input.revision,
      warnings,
      sections: sections.map((section, ordinal) => ({
        ...section,
        ordinal,
        id: `${id}:${input.revision}:${ordinal}`,
        documentId: id,
        revision: input.revision,
        provenance: 'unverified-wiki'
      }))
    });
  }
  const deletedIds = prior.filter((doc) => !used.has(doc.id)).map((doc) => doc.id);
  return {
    schemaVersion: 1,
    maxBytes,
    documents,
    changes: {
      added: documents.filter((doc) => !prior.some((p) => p.id === doc.id)).length,
      updated: documents.filter((doc) => prior.some((p) => p.id === doc.id && p.revision !== doc.revision)).length,
      renamed: documents.filter((doc) => prior.some((p) => p.id === doc.id && p.relativePath !== doc.relativePath))
        .length,
      deletedIds
    },
    readyForIndexing: documents.every((doc) => !doc.warnings.some((warning) => warning !== 'links-not-resolved'))
  };
}
