import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import postgres from 'postgres';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace';
import { contextStore } from '../lib/lab-context/store';
import { prepareContextPublication } from '../lib/lab-context/prepare';
import { runContextBaseline } from '../lib/lab-context/run';
import { operationalRecorder } from '../lib/lab-context/telemetry';
import { citationScore, retrievalScores } from '../lib/lab-context/evaluate';
import { defaultContextModel } from '../lib/lab-context/generate';
import { packEvidence, structuredEvidence } from '../lib/lab-context/evidence';
import { syntheticRequest, fakeContextModel } from './lab-context-fixtures';

const exec = promisify(execFile);
const container = `hc-context-${randomUUID()}`;
const directory = await mkdtemp(path.join(tmpdir(), 'hc-context-'));
const reportDirectory = new URL('../../../private-data/lab-context-synthetic/', import.meta.url);
const exporter = new InMemorySpanExporter();
const recorder = operationalRecorder(new SimpleSpanProcessor({ exporter }));
let admin: ReturnType<typeof postgres> | undefined;
let sql: ReturnType<typeof postgres> | undefined;
let started = false;
try {
  await exec('docker', [
    'run',
    '--detach',
    '--name',
    container,
    '--label',
    'health-coach.synthetic=lab-context',
    '--env',
    'POSTGRES_HOST_AUTH_METHOD=trust',
    '--env',
    'POSTGRES_DB=lab_context_synthetic',
    '--publish',
    '127.0.0.1::5432',
    '--tmpfs',
    '/var/lib/postgresql/data',
    'postgres:17-alpine'
  ]);
  started = true;
  const { stdout } = await exec('docker', ['port', container, '5432/tcp']);
  const port = Number(stdout.trim().split(':').at(-1));
  assert(Number.isInteger(port) && port > 0);
  admin = postgres({
    host: '127.0.0.1',
    port,
    user: 'postgres',
    database: 'lab_context_synthetic',
    max: 1,
    onnotice: () => {}
  });
  let connected = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await admin`select 1`;
      connected = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  assert(connected, 'Disposable database did not start');
  await admin.unsafe(await readFile(new URL('../../../scripts/lab-context/schema.sql', import.meta.url), 'utf8'));
  await admin.unsafe(`create role context_runner login; create role context_anonymous login;
    grant usage on schema hc_context to context_runner;
    grant select, insert, update, delete on all tables in schema hc_context to context_runner;
    grant execute on function hc_context.publish(uuid,uuid,uuid,jsonb,text[]) to context_runner;`);
  sql = postgres({ host: '127.0.0.1', port, user: 'context_runner', database: 'lab_context_synthetic', max: 1 });
  const anonymous = postgres({ host: '127.0.0.1', port, user: 'context_anonymous', database: 'lab_context_synthetic' });
  try {
    await assert.rejects(() => anonymous`select * from hc_context.sections`);
  } finally {
    await anonymous.end();
  }
  const reports = [];
  for (const scenario of ['complete', 'missing-activity', 'undated-notes', 'conflict', 'correction', 'paraphrase']) {
    const request = syntheticRequest();
    const store = contextStore(sql, request.ownerId);
    if (scenario === 'missing-activity') request.activity.days = [];
    if (scenario === 'paraphrase') request.question = 'How does my newest panel relate to changes in my routine?';
    await writeFile(path.join(directory, 'context.md'), '# Marker A\nThe routine changed; timing remains uncertain.\n');
    const dates = { 'context.md': scenario === 'undated-notes' ? null : '2026-01-18' };
    const preparation = await prepareContextPublication({
      root: directory,
      files: ['context.md'],
      dates,
      explicitlyRemoved: []
    });
    let manifest = preparation.manifest;
    if (scenario === 'conflict') {
      await writeFile(
        path.join(directory, 'counter.md'),
        '# Marker A\nA second note says the routine did not change. Both notes are unverified.\n'
      );
      manifest = (
        await prepareContextPublication({
          root: directory,
          files: ['context.md', 'counter.md'],
          previous: preparation.prepared,
          dates: { ...dates, 'counter.md': '2026-01-19' },
          explicitlyRemoved: []
        })
      ).manifest;
    }
    let revision = await store.publish(manifest, [], null);
    const initialRevision = revision;
    // Failed publication and stale writer must preserve the entire old revision.
    await assert.rejects(() => store.publish([], [], revision));
    await assert.rejects(() => store.publish(manifest, [], randomUUID()));
    assert(await store.isCurrent(revision));
    if (scenario === 'correction') {
      await writeFile(
        path.join(directory, 'context.md'),
        '# Marker A\nCorrection: routine did not change; the earlier note was mistaken.\n'
      );
      const edited = await prepareContextPublication({
        root: directory,
        files: ['context.md'],
        dates,
        previous: preparation.prepared,
        explicitlyRemoved: []
      });
      assert.equal(edited.manifest[0]!.id, manifest[0]!.id);
      manifest = edited.manifest;
      revision = await store.publish(manifest, [], revision);
      assert.equal(await store.isCurrent(initialRevision), false);
    }
    const foreign = contextStore(sql, randomUUID());
    await assert.rejects(() => foreign.search('marker', '2026-01-01', '2026-01-21'));
    await sql.begin(async (tx) => {
      await tx`select set_config('hc_context.owner_id', ${randomUUID()}, true)`;
      assert.equal((await tx`select * from hc_context.sections`).length, 0);
    });
    const result = await runContextBaseline(request, {
      store,
      model: fakeContextModel(),
      modelId: 'test/fake',
      record: async (trace) => {
        await recorder.record(trace);
      }
    });
    const retrieved = result.evidence.packet.notes.sections.map((section) => section.id);
    const expected = manifest.flatMap((doc) => doc.sections.map((section) => section.id));
    const scores = retrievalScores(retrieved, {
      requiredEvidenceIds: expected,
      relevantEvidenceIds: expected,
      forbiddenClaimCategories: ['causal-claim'],
      expectedGaps: ['incomplete-coverage'],
      reviewerLabelStatus: 'draft'
    });
    assert.equal(scores.requiredPassageRecall, 1);
    assert.equal(result.evidence.packet.notes.revision, revision);
    assert.equal(result.evidence.packet.notes.undatedCount, scenario === 'undated-notes' ? 1 : 0);
    if (scenario === 'conflict') assert.equal(retrieved.length, 2);
    if (scenario === 'missing-activity')
      assert(result.evidence.packet.windows.every((window) => window.coveredStepsDays === 0));
    const removed = manifest.map((doc) => doc.id);
    await store.publish([], removed, revision);
    assert.equal(await store.isCurrent(revision), false);
    assert.equal((await store.search('marker', '2026-01-01', '2026-01-21')).sections.length, 0);
    const tombstones: { document_id: string }[] = await sql.begin(async (tx) => {
      await tx`select set_config('hc_context.owner_id', ${request.ownerId}, true)`;
      return tx`select document_id from hc_context.tombstones`;
    });
    assert.equal(tombstones.length, removed.length);
    reports.push({
      scenario,
      evidence: result.evidence.packet,
      answer: result.answer,
      scores: { ...scores, citationValidity: citationScore(result.answer, result.evidence.evidenceIds) },
      trace: result.trace,
      reviewStatus: result.reviewStatus
    });
  }
  // A top-five result must expose omitted matches from the same SQL snapshot.
  const overflowRequest = syntheticRequest();
  const overflowStore = contextStore(sql, overflowRequest.ownerId);
  await writeFile(
    path.join(directory, 'many.md'),
    Array.from({ length: 6 }, (_, i) => `# Marker A ${i}\nA qualified note.\n`).join('\n')
  );
  const many = await prepareContextPublication({
    root: directory,
    files: ['many.md'],
    dates: { 'many.md': '2026-01-18' },
    explicitlyRemoved: []
  });
  await overflowStore.publish(many.manifest, [], null);
  const overflowPublication = await overflowStore.search('marker', '2026-01-01', '2026-01-22');
  assert.equal(overflowPublication.sections.length, 5);
  assert.equal(overflowPublication.totalMatches, 6);
  assert.equal(packEvidence(structuredEvidence(overflowRequest), overflowPublication).packet.notes.omittedSections, 1);
  const spans = exporter.getFinishedSpans().map((span) => ({
    name: span.name,
    attributes: span.attributes,
    traceId: span.spanContext().traceId,
    spanId: span.spanContext().spanId,
    parentSpanId: span.parentSpanContext?.spanId
  }));
  assert.equal(spans.length, 24);
  assert(!JSON.stringify(spans).includes('routine changed'));
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    new URL('report.json', reportDirectory),
    JSON.stringify(
      {
        provenance:
          'Synthetic contract verification with fake generation; not an owner evaluation or model-quality result.',
        configuredLiveCandidate: defaultContextModel,
        actualModel: 'test/fake',
        reports,
        spans
      },
      null,
      2
    ),
    { mode: 0o600 }
  );
  console.log(
    'Six integrated synthetic cases passed: FTS, publication/correction/deletion, isolation, fake generation and safe traces.'
  );
  console.log(
    'Local inspectable report: private-data/lab-context-synthetic/report.json. No model or Langfuse network calls.'
  );
} finally {
  await recorder.shutdown();
  await sql?.end();
  await admin?.end();
  if (started) await exec('docker', ['rm', '--force', '--volumes', container]);
  await rm(directory, { recursive: true, force: true });
}
