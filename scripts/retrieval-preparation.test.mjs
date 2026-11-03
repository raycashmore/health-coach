import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rename, rm, symlink, mkdir, cp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareMarkdown, sectionMarkdown } from './retrieval/prepare-markdown.mjs';

test('preparation tracks no-op, edit, rename and deletion without stale sections', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retrieval-'));
  try {
    await writeFile(path.join(root, 'note.md'), '# Notes\nOriginal evidence\n');
    let result = await prepareMarkdown({ root, files: ['note.md'] });
    const id = result.documents[0].id;
    const original = result.documents[0].sections[0].id;
    const unchanged = await prepareMarkdown({ root, files: ['note.md'], previous: result });
    assert.deepEqual(unchanged.documents, result.documents);
    assert.equal(unchanged.changes.updated, 0);
    await rename(path.join(root, 'note.md'), path.join(root, 'moved.md'));
    result = await prepareMarkdown({ root, files: ['moved.md'], previous: unchanged });
    assert.equal(result.documents[0].id, id);
    assert.equal(result.changes.renamed, 1);
    await writeFile(path.join(root, 'moved.md'), '# Notes\nCorrected evidence\n');
    result = await prepareMarkdown({ root, files: ['moved.md'], previous: result });
    assert.equal(result.documents[0].id, id);
    assert.equal(result.changes.updated, 1);
    assert.notEqual(result.documents[0].sections[0].id, original);
    await writeFile(path.join(root, 'replacement.md'), '# Different\nOther evidence\n');
    result = await prepareMarkdown({ root, files: ['replacement.md'], previous: result });
    assert.deepEqual(result.changes.deletedIds, [id]);
    assert.ok(result.documents.every((doc) => doc.id !== id));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sections preserve text, line ranges, table units and fenced headings', () => {
  const text =
    '---\ntitle: Example\n---\n# Summary\n' +
    'A qualification remains source text.\n'.repeat(40) +
    '| Item | Amount (mg) |\n| --- | --- |\n| Example | 2 |\n```md\n# Not a heading\n```\n';
  const { sections, warnings } = sectionMarkdown(text, 256);
  assert.equal(sections.map((s) => s.text).join(''), text);
  const lines = text.split(/(?<=\n)/);
  for (const section of sections)
    assert.equal(lines.slice(section.startLine - 1, section.endLine).join(''), section.text);
  assert.ok(sections.some((s) => s.text.includes('| Amount (mg) |') && s.text.includes('| Example | 2 |')));
  assert.ok(sections.every((s) => !s.headingPath.includes('Not a heading')));
  assert.deepEqual(warnings, []);
});

test('oversized evidence is retained and blocks indexing rather than silently truncated', () => {
  const { sections, warnings } = sectionMarkdown('# Notes\n' + 'x'.repeat(1000), 256);
  assert.ok(warnings.includes('oversized-block'));
  assert.ok(sections.some((s) => s.text.includes('x'.repeat(1000))));
});

test('rejects hidden files, traversal, attachments and escaping symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retrieval-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'outside-'));
  try {
    await writeFile(path.join(outside, 'note.md'), 'Excluded');
    await symlink(path.join(outside, 'note.md'), path.join(root, 'link.md'));
    for (const file of ['.hidden.md', '../note.md', 'source.pdf', 'link.md'])
      await assert.rejects(prepareMarkdown({ root, files: [file] }));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('empty selection removes the final document and skipped heading levels retain siblings', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retrieval-'));
  try {
    await writeFile(path.join(root, 'note.md'), '# Parent\n### Child A\nA\n### Child B\nB\n');
    const result = await prepareMarkdown({ root, files: ['note.md'] });
    assert.deepEqual(result.documents[0].sections.at(-1).headingPath, ['Parent', 'Child B']);
    const empty = await prepareMarkdown({ root, files: [], previous: result });
    assert.deepEqual(empty.documents, []);
    assert.deepEqual(empty.changes.deletedIds, [result.documents[0].id]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('changing preparation budget invalidates citations even when source is unchanged', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retrieval-'));
  try {
    await writeFile(path.join(root, 'note.md'), '# Notes\n' + 'Example passage.\n'.repeat(50));
    const first = await prepareMarkdown({ root, files: ['note.md'], maxBytes: 256 });
    const second = await prepareMarkdown({ root, files: ['note.md'], previous: first, maxBytes: 4000 });
    assert.equal(first.documents[0].id, second.documents[0].id);
    assert.equal(first.documents[0].contentHash, second.documents[0].contentHash);
    assert.notEqual(first.documents[0].sections[0].id, second.documents[0].sections[0].id);
    assert.equal(second.changes.updated, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI writes a private snapshot atomically and preserves it on failed reads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'retrieval-cli-'));
  try {
    const scripts = path.join(root, 'scripts');
    await mkdir(scripts);
    await cp(new URL('./retrieval', import.meta.url), path.join(scripts, 'retrieval'), { recursive: true });
    await cp(new URL('./prepare-retrieval.mjs', import.meta.url), path.join(scripts, 'prepare-retrieval.mjs'));
    const run = (files) =>
      execFileSync(process.execPath, [path.join(scripts, 'prepare-retrieval.mjs'), root, ...files], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    await writeFile(path.join(root, 'note.md'), '# Example\nSynthetic source text.\n');
    const log = run(['note.md']);
    assert.equal(JSON.parse(log).documents, 1);
    assert.ok(!log.includes('Synthetic source text'));
    const output = path.join(root, 'private-data/retrieval/prepared.json');
    const saved = await readFile(output, 'utf8');
    assert.throws(() => run(['missing.md']));
    assert.equal(await readFile(output, 'utf8'), saved);
    assert.equal(JSON.parse(run(['--empty'])).deleted, 1);
    assert.deepEqual(JSON.parse(await readFile(output, 'utf8')).documents, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
