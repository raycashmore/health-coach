import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { embeddingEndpoint, loadCloudCredentials, selectProject } from './retrieval/cloud-config.mjs';
import { sectionMarkdown } from './retrieval/prepare-markdown.mjs';
import { corpusVersion, notes, questions as originalQuestions } from './retrieval/synthetic-corpus.mjs';
import { embeddingModel, pricePerMillion, withEmbeddingBudget } from './retrieval/embedding-budget.mjs';
import { withExclusiveRun, saveRunJournal } from './retrieval/run-state.mjs';
import { scoreRetrieval, summarizeTimings } from './retrieval/metrics.mjs';

import { qualityQuestions, lexicalQuery, rubric, inspectQuality, supportMetrics } from './retrieval/quality.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(repository, 'private-data/retrieval-cloud');
const qualityRun = process.argv.includes('--quality');
const questions = qualityRun ? qualityQuestions : originalQuestions;
const modes = ['keyword', 'semantic', 'hybrid'];
const repetitions = 6; // First pass plus five warm repetitions per question and mode.
const digest = (text) => createHash('sha256').update(text).digest('hex');
const sections = notes.flatMap((note) => {
  const parsed = sectionMarkdown(note.markdown);
  if (parsed.warnings.length) throw new Error('Synthetic fixture is not indexable');
  const revision = digest(note.markdown);
  return parsed.sections.map((s, n) => ({ ...s, documentId: note.id, revision, id: `${note.id}:${revision}:${n}` }));
});

async function request(url, headers, body, method = 'POST') {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    const error = new Error(`Remote request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!process.argv.includes('--cloud'))
    throw new Error('Use --cloud with the approved project and private credential files');
  const credentials = await loadCloudCredentials(
    process.env.HC_RETRIEVAL_CREDENTIALS_FILE ?? path.join(directory, 'credentials.env')
  );
  const management = { Authorization: `Bearer ${credentials.managementToken}` };
  const projects = await request('https://api.supabase.com/v1/projects', management, undefined, 'GET');
  const project = selectProject(projects, process.env.HC_RETRIEVAL_PROJECT_REF);
  const projectUrl = `https://api.supabase.com/v1/projects/${project}`;
  const info = await request(projectUrl, management, undefined, 'GET');
  if (info.id !== project || info.status !== 'ACTIVE_HEALTHY')
    throw new Error('Destination is not the verified active project');
  const keys = await request(`${projectUrl}/api-keys`, management, undefined, 'GET');
  const service = keys.find((key) => key.name === 'service_role')?.api_key;
  const anon = keys.find((key) => key.name === 'anon')?.api_key;
  if (!service || !anon) throw new Error('Required project API keys unavailable');
  const url = `https://${project}.supabase.co`;
  const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}` };
  const admin = async (endpoint, body, method) => request(`${url}/auth/v1/${endpoint}`, serviceHeaders, body, method);
  const rest = (endpoint, auth, body, method) =>
    request(`${url}/rest/v1/${endpoint}`, { apikey: anon, Authorization: `Bearer ${auth}` }, body, method);
  const sql = (query) => request(`${projectUrl}/database/query`, management, { query });
  // Verify vector namespace before installing a schema that refers to it.
  const extensions = await sql(
    "select n.nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='vector'"
  );
  if (extensions.length && extensions[0].nspname !== 'extensions')
    throw new Error('Existing vector extension uses another namespace; stop for adaptation');

  const experiment = randomUUID();
  const users = [];
  const journalPath = path.join(directory, 'active-run.json');
  try {
    const journal = JSON.parse(await readFile(journalPath, 'utf8'));
    if (journal.users?.length)
      throw new Error('Previous run needs cleanup; inspect ignored active-run.json before continuing');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const saveJournal = () =>
    saveRunJournal(journalPath, { experiment, project, users: users.map(({ id, email }) => ({ id, email })) });
  await saveJournal();
  let report;
  const rpc = (name, body, auth = service) =>
    request(`${url}/rest/v1/rpc/${name}`, { apikey: anon, Authorization: `Bearer ${auth}` }, body);
  const publish = (owner, data) =>
    rpc('hc_retrieval_exp_publish', { p_experiment: experiment, p_owner: owner, p_sections: data });
  try {
    await sql(await readFile(new URL('./retrieval/experiment.sql', import.meta.url), 'utf8'));
    for (let i = 0; i < 2; i++) {
      const email = `retrieval-${randomUUID()}@example.com`;
      const password = `${randomUUID()}-aA7!`;
      users.push({ email });
      await saveJournal(); // Persist intent before a timeout can hide successful creation.
      const created = await admin('admin/users', { email, password, email_confirm: true });
      if (!created.id) throw new Error('Synthetic account creation returned no ID');
      users.at(-1).id = created.id;
      await saveJournal();
      const session = await request(`${url}/auth/v1/token?grant_type=password`, { apikey: anon }, { email, password });
      users.at(-1).token = session.access_token;
    }
    let embeddedTokens = 0;
    async function embed(inputs) {
      const result = await withEmbeddingBudget(directory, inputs, () =>
        request(
          embeddingEndpoint,
          { Authorization: `Bearer ${credentials.gatewayKey}` },
          { model: embeddingModel, input: inputs, dimensions: 1536, encoding_format: 'float' }
        )
      );
      if (result.data.length !== inputs.length) throw new Error('Embedding count mismatch');
      embeddedTokens += result.usage.total_tokens;
      return result.data
        .sort((a, b) => a.index - b.index)
        .map((row) => {
          if (row.embedding.length !== 1536 || row.embedding.some((n) => !Number.isFinite(n)))
            throw new Error('Invalid embedding');
          return row.embedding;
        });
    }
    const prepareStarted = performance.now();
    const vectors = await embed(sections.map((s) => s.text));
    const prepared = sections.map((s, i) => ({ ...s, embedding: JSON.stringify(vectors[i]) }));
    const publicationStarted = performance.now();
    await publish(users[0].id, prepared);
    const publicationMs = performance.now() - publicationStarted;
    const preparationMs = performance.now() - prepareStarted;
    const countRows = async (token) =>
      rest(`hc_retrieval_exp_sections?experiment_id=eq.${experiment}&select=section_id`, token, undefined, 'GET');
    const storageBeforeDeletion = await sql(
      "select pg_total_relation_size('public.hc_retrieval_exp_sections') as bytes"
    );
    const initial = await countRows(users[0].token);
    if (initial.length !== prepared.length) throw new Error('Publication count mismatch');
    await publish(users[1].id, [{ ...prepared[0], id: 'other-owner-canary', documentId: 'other-owner-canary' }]);
    if (
      (await countRows(users[0].token)).some((s) => s.section_id === 'other-owner-canary') ||
      (await countRows(users[1].token)).length !== 1
    )
      throw new Error('Owner isolation failed');
    let anonymousDenied = false;
    try {
      await countRows(anon);
    } catch (error) {
      if (error.status !== 401 && error.status !== 403) throw error;
      anonymousDenied = true;
    }
    if (!anonymousDenied) throw new Error('Anonymous read was not denied');
    const rankings = Object.fromEntries(modes.map((mode) => [mode, {}]));
    const timings = [];
    for (let repetition = 0; repetition < repetitions; repetition++) {
      for (const q of questions) {
        // Rotate method order per question/pass to reduce fixed ordering bias.
        const order = modes.map((_, i) => modes[(i + repetition + Number(q.id.slice(1))) % modes.length]);
        for (const mode of order) {
          const started = performance.now();
          let vector = null;
          const embeddingStarted = performance.now();
          if (mode !== 'keyword') [vector] = await embed([q.query]);
          const embeddingMs = mode === 'keyword' ? 0 : performance.now() - embeddingStarted;
          const searchStarted = performance.now();
          const result = await rpc(
            'hc_retrieval_exp_search',
            {
              p_experiment: experiment,
              p_query: qualityRun && mode !== 'semantic' ? lexicalQuery(q.query) : q.query,
              p_embedding: vector && JSON.stringify(vector),
              p_mode: mode,
              p_limit: 10
            },
            users[0].token
          );
          const searchRoundTripMs = performance.now() - searchStarted;
          if (result.hits.some((hit) => hit.document_id === 'other-owner-canary'))
            throw new Error('Search leaked another owner');
          const fetchStarted = performance.now();
          let fetched = [];
          if (result.hits.length) {
            const ids = result.hits.map((hit) => `"${hit.section_id}"`).join(',');
            fetched = await rest(
              `hc_retrieval_exp_sections?experiment_id=eq.${experiment}&section_id=in.(${encodeURIComponent(ids)})&select=section_id,revision,body`,
              users[0].token,
              undefined,
              'GET'
            );
          }
          let contextBytes = 0;
          for (const hit of result.hits) {
            const row = fetched.find((r) => r.section_id === hit.section_id && r.revision === hit.revision);
            if (!row) throw new Error('Citation revision unavailable');
            contextBytes += Buffer.byteLength(row.body);
          }
          if (contextBytes > 6000) throw new Error('Synthetic context exceeds conservative byte budget');
          const fetchRoundTripMs = performance.now() - fetchStarted;
          timings.push({
            mode,
            queryId: q.id,
            repetition,
            embeddingMs,
            searchRoundTripMs,
            databaseMs: Number(result.databaseMs),
            fetchRoundTripMs,
            totalMs: performance.now() - started
          });
          if (repetition === 0) rankings[mode][q.id] = result.hits;
        }
      }
      console.log(`Completed synthetic comparison pass ${repetition + 1}/${repetitions}`);
    }
    const lifecycleStarted = performance.now();
    await publish(users[0].id, prepared);
    if ((await countRows(users[0].token)).length !== prepared.length)
      throw new Error('Idempotent projection duplicated sections');
    const editedText = '# Updated synthetic access\nUse the south reception desk.\n';
    const editedRevision = digest(editedText);
    const editedSection = sectionMarkdown(editedText).sections[0];
    const updated = prepared.map((s, i) =>
      i === 0 ? { ...s, ...editedSection, id: `${s.documentId}:${editedRevision}:0`, revision: editedRevision } : s
    );
    [updated[0].embedding] = (await embed([updated[0].text])).map(JSON.stringify);
    await publish(users[0].id, updated);
    const afterEdit = await countRows(users[0].token);
    if (
      afterEdit.some((s) => s.section_id === prepared[0].id) ||
      !afterEdit.some((s) => s.section_id === updated[0].id)
    )
      throw new Error('Old revision remained active');
    const editedEvidence = await rest(
      `hc_retrieval_exp_sections?experiment_id=eq.${experiment}&section_id=eq.${updated[0].id}&select=revision,heading_path,start_line,end_line,body`,
      users[0].token,
      undefined,
      'GET'
    );
    const fetchedEdit = editedEvidence[0];
    if (
      !fetchedEdit ||
      fetchedEdit.revision !== editedRevision ||
      fetchedEdit.body !== editedText ||
      fetchedEdit.start_line !== editedSection.startLine ||
      fetchedEdit.end_line !== editedSection.endLine ||
      JSON.stringify(fetchedEdit.heading_path) !== JSON.stringify(editedSection.headingPath)
    )
      throw new Error('Edited source attribution mismatch');
    await publish(users[0].id, []);
    if ((await countRows(users[0].token)).length) throw new Error('Deleted sections remained active');
    const deletedSearch = await rpc(
      'hc_retrieval_exp_search',
      {
        p_experiment: experiment,
        p_query: questions[0].query,
        p_embedding: JSON.stringify(vectors[0]),
        p_mode: 'hybrid',
        p_limit: 10
      },
      users[0].token
    );
    if (deletedSearch.hits.length) throw new Error('Deleted evidence returned from search');
    const lifecycleMs = performance.now() - lifecycleStarted;
    const storage = await sql("select pg_total_relation_size('public.hc_retrieval_exp_sections') as bytes");
    report = {
      experiment,
      corpusVersion,
      generatedAt: new Date().toISOString(),
      model: embeddingModel,
      embeddingRoute: 'Vercel AI Gateway (routing included in embedding timing)',
      documents: notes.length,
      sections: sections.length,
      queryCount: questions.length,
      region: info.region,
      tableBytesBeforeDeletion: Number(storageBeforeDeletion[0].bytes),
      positiveQueries: questions.filter((q) => q.required.length).length,
      repetitions,
      conditions:
        'Authenticated PostgREST calls from development Mac to hosted Supabase; exact vectors; no HNSW; uncached query embeddings; first pass is not guaranteed cold; no generation. Not a mobile/Mac-off proof.',
      labels:
        'Authored synthetic labels fixed before execution; holdout labels were not used to tune methods. Not owner/private relevance evidence.',
      preparationMs,
      publicationMs,
      lifecycleMs,
      totalTableBytesAfterDeletion: Number(storage[0].bytes),
      embeddingUsage: {
        tokens: embeddedTokens,
        estimatedUsd: (embeddedTokens * pricePerMillion) / 1e6,
        ledger: JSON.parse(await readFile(path.join(directory, 'embedding-budget.json'), 'utf8'))
      },
      quality: Object.fromEntries(
        modes.map((mode) => [
          mode,
          { top5: scoreRetrieval(questions, rankings[mode], 5), top10: scoreRetrieval(questions, rankings[mode], 10) }
        ])
      ),
      timings,
      latency: summarizeTimings(timings),
      checks: { anonymousDenied, ownerIsolation: true, citationRevisions: true, replacement: true, deletion: true },
      ...(qualityRun
        ? {
            rubric,
            inspection: Object.fromEntries(
              modes.map((mode) => [mode, inspectQuality(questions, rankings[mode], sections)])
            ),
            support: Object.fromEntries(
              modes.map((mode) => [mode, supportMetrics(inspectQuality(questions, rankings[mode], sections))])
            )
          }
        : {}),
      missingEvidence: qualityRun
        ? 'Ranking does not establish support. Nonempty results require review; no automatic support acceptance is claimed.'
        : 'Raw semantic and hybrid rankings return neighbors for unanswerable questions; no abstention threshold or answer support policy evaluated.'
    };
    await writeFile(
      path.join(directory, qualityRun ? 'quality-results.json' : 'results.json'),
      JSON.stringify(report, null, 2),
      { mode: 0o600 }
    );
    console.log(
      `Comparison saved to ignored private-data/retrieval-cloud/${qualityRun ? 'quality-results.json' : 'results.json'}`
    );
  } finally {
    const cleanupFailures = [];
    for (const user of users) {
      try {
        if (!user.id) {
          const matches = await sql(`select id from auth.users where email = '${user.email}'`);
          user.id = matches[0]?.id;
        }
        if (!user.id) continue;
        await publish(user.id, []);
        await admin(`admin/users/${user.id}`, undefined, 'DELETE');
      } catch {
        cleanupFailures.push({ id: user.id, email: user.email });
      }
    }
    await writeFile(
      path.join(directory, 'cleanup.json'),
      JSON.stringify({ experiment, remainingSyntheticUserIds: cleanupFailures }, null, 2),
      { mode: 0o600 }
    );
    if (cleanupFailures.length) throw new Error('Synthetic cleanup incomplete; inspect ignored cleanup.json');
    users.length = 0;
    await saveJournal();
  }
  return report;
}

await mkdir(directory, { recursive: true, mode: 0o700 });
try {
  await withExclusiveRun(directory, main);
} catch (error) {
  // Remote bodies and credentials must never enter general output.
  console.error(
    `Synthetic retrieval experiment stopped: ${error instanceof Error ? error.message : 'unknown failure'}`
  );
  process.exitCode = 1;
}
