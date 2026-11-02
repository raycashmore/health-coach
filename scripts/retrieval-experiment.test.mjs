import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { withEmbeddingBudget, reserveCost } from './retrieval/embedding-budget.mjs';
import { percentile, scoreRetrieval, summarizeTimings } from './retrieval/metrics.mjs';
import { notes, questions } from './retrieval/synthetic-corpus.mjs';
import { sectionMarkdown } from './retrieval/prepare-markdown.mjs';

test('budget persists reservations across uncertain failures and rejects overspend before remote calls', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'embedding-budget-'));
  try {
    await assert.rejects(
      withEmbeddingBudget(dir, ['synthetic'], async () => {
        throw new Error('uncertain remote failure');
      })
    );
    const first = JSON.parse(await readFile(path.join(dir, 'embedding-budget.json'), 'utf8'));
    assert.equal(first.reservedUsd, reserveCost(['synthetic']));
    await withEmbeddingBudget(dir, ['next'], async () => ({ usage: { total_tokens: 2 } }));
    const second = JSON.parse(await readFile(path.join(dir, 'embedding-budget.json'), 'utf8'));
    assert.equal(second.successfulCalls, 1);
    assert.equal(second.measuredTokens, 2);
    await writeFile(path.join(dir, 'embedding-budget.json'), JSON.stringify({ ...second, reservedUsd: 1 }));
    let called = false;
    await assert.rejects(
      withEmbeddingBudget(dir, ['over limit'], async () => {
        called = true;
      })
    );
    assert.equal(called, false);
    assert.throws(() => reserveCost(['x'.repeat(8001)]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('recall counts every required passage and does not treat missing-evidence queries as perfect recall', () => {
  const cases = [
    { id: 'a', required: ['one', 'two'] },
    { id: 'missing', required: [] }
  ];
  const results = {
    a: [{ document_id: 'one' }, { document_id: 'one' }, { document_id: 'two' }],
    missing: [{ document_id: 'noise' }]
  };
  assert.equal(scoreRetrieval(cases, results, 2).recall, 0.5);
  assert.equal(scoreRetrieval(cases, results, 3).recall, 1);
  assert.equal(scoreRetrieval(cases, results, 3).perQuestion[1].relevant, 0);
});

test('nearest-rank percentiles separate warm and first-pass samples', () => {
  assert.equal(
    percentile(
      Array.from({ length: 100 }, (_, i) => i + 1),
      0.95
    ),
    95
  );
  const row = {
    mode: 'keyword',
    embeddingMs: 0,
    searchRoundTripMs: 20,
    databaseMs: 1,
    fetchRoundTripMs: 10,
    totalMs: 30
  };
  const summary = summarizeTimings([
    { ...row, repetition: 0, totalMs: 1000 },
    { ...row, repetition: 1 }
  ]);
  assert.equal(summary.keyword.warm.totalMs.p95, 30);
  assert.equal(summary.keyword.firstPass.length, 1);
});

test('synthetic labels reference unique bounded, indexable notes', () => {
  assert.equal(new Set(notes.map((note) => note.id)).size, notes.length);
  assert.equal(questions.length, 12);
  assert.ok(questions.some((q) => !q.required.length));
  for (const note of notes) assert.deepEqual(sectionMarkdown(note.markdown).warnings, []);
  for (const q of questions) for (const id of q.required) assert.ok(notes.some((note) => note.id === id));
});

test('only one run can own the recovery journal and creation intent is persisted before an ID exists', async () => {
  const { withExclusiveRun, saveRunJournal } = await import('./retrieval/run-state.mjs');
  const dir = await mkdtemp(path.join(os.tmpdir(), 'retrieval-run-'));
  try {
    await withExclusiveRun(dir, async () => {
      await assert.rejects(withExclusiveRun(dir, async () => assert.fail('second run entered')));
      const filename = path.join(dir, 'active-run.json');
      const state = { project: 'synthetic', users: [{ email: 'synthetic@example.com' }] };
      await saveRunJournal(filename, state);
      assert.deepEqual(JSON.parse(await readFile(filename, 'utf8')), state);
    });
    await withExclusiveRun(dir, async () => {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
