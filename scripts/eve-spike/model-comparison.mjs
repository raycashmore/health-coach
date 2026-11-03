import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoCases, manualRubric } from './fixtures.mjs';
import { modelComparisonIds, selectModelProfile, comparisonReservation } from './model-profiles.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const live = process.argv.includes('--live');
if (!live && !process.argv.includes('--fixture'))
  throw new Error('Choose --fixture or an explicitly approved --live comparison');
if (live && process.argv.includes('--fixture')) throw new Error('Choose one transport');
const output = path.join(directory, '.eve', live ? 'model-comparison-v1' : `model-fixture-${Date.now()}`);
const reservation = comparisonReservation();
if (reservation > 5_000_000_000) throw new Error('Model comparison exceeds its proposed US$5 allowance');
let credentialsFile;
if (live) {
  credentialsFile =
    process.env.HC_SPIKE_CREDENTIALS ?? path.resolve(directory, '../../private-data/retrieval-cloud/credentials.env');
  if (!parseEnv(await readFile(credentialsFile, 'utf8')).AI_GATEWAY_API_KEY?.trim())
    throw new Error('Gateway credential unavailable');
  const response = await fetch('https://ai-gateway.vercel.sh/v1/models', {
    signal: AbortSignal.timeout(15000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error('Cannot verify model prices');
  const { data } = await response.json();
  for (const id of modelComparisonIds) {
    const p = selectModelProfile(id);
    const model = data.find((item) => item.id === p.model);
    const prices = [model?.pricing?.input, model?.pricing?.input_cache_write]
      .filter((value) => value !== undefined)
      .map(Number);
    if (
      !model?.tags?.includes('tool-use') ||
      !prices.length ||
      prices.some((value) => !Number.isFinite(value) || value <= 0 || value * 1e9 > p.inputNanoUsd) ||
      !Number(model.pricing.output) ||
      Number(model.pricing.output) * 1e9 > p.outputNanoUsd
    )
      throw new Error('Model prices no longer fit the reservation');
  }
}
await mkdir(output, { recursive: true, mode: 0o700 });
if (!live) {
  credentialsFile = path.join(output, 'fixture.env');
  await writeFile(credentialsFile, 'AI_GATEWAY_API_KEY=placeholder', { flag: 'wx', mode: 0o600 });
}
// One batch, including crash recovery: never silently rerun a completed arm.
const manifest = await open(path.join(output, 'manifest.json'), 'wx', 0o600);
try {
  await manifest.writeFile(
    JSON.stringify({
      version: 1,
      status: live ? 'approved-live-execution' : 'fixture',
      profiles: modelComparisonIds,
      questions: demoCases.map(({ id, query }) => ({ id, query })),
      rubric: manualRubric,
      reservedNanoUsd: reservation,
      allowanceNanoUsd: 5_000_000_000
    })
  );
  await manifest.sync();
} finally {
  await manifest.close();
}
for (const id of modelComparisonIds) {
  const resultDirectory = path.join(output, id);
  await mkdir(resultDirectory, { mode: 0o700 });
  const child = spawn(process.execPath, [path.join(directory, 'run-model-arm.mjs')], {
    cwd: directory,
    env: {
      ...process.env,
      EVE_TELEMETRY_DISABLED: '1',
      HC_SPIKE_DRY_RUN: live ? '0' : '1',
      HC_SPIKE_PROFILE: id,
      HC_SPIKE_LEDGER: path.join(resultDirectory, 'ledger.json'),
      HC_SPIKE_CREDENTIALS: credentialsFile,
      HC_SPIKE_RESULTS: resultDirectory
    },
    stdio: 'inherit'
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  if (code !== 0) throw new Error('Comparison arm did not complete; inspect its journal, do not repeat automatically');
}
// Quality review sees no model label, usage, cost or latency. Reveal mapping only
// after recording the rubric verdicts; traces retain observable tool actions only.
const blinded = [];
const mapping = [];
for (const item of demoCases) {
  const order = randomInt(2) ? [...modelComparisonIds].reverse() : [...modelComparisonIds];
  const pair = { caseId: item.id, query: item.query };
  for (let i = 0; i < 2; i++) {
    const data = JSON.parse(await readFile(path.join(output, order[i], `${item.id}.json`), 'utf8'));
    pair[i ? 'B' : 'A'] = {
      answer: data.agent.answer,
      status: data.agent.events.findLast((event) => event.type === 'turn.settled')?.data.outcome ?? data.agent.status,
      error: data.agent.error,
      tools: data.agent.tools.map(({ name, input, output, status }) => ({ name, input, output, status }))
    };
  }
  blinded.push(pair);
  mapping.push({ caseId: item.id, A: order[0], B: order[1] });
}
await writeFile(path.join(output, 'blinded.json'), JSON.stringify({ rubric: manualRubric, cases: blinded }, null, 2), {
  flag: 'wx',
  mode: 0o600
});
await writeFile(path.join(output, 'model-mapping.json'), JSON.stringify(mapping), { flag: 'wx', mode: 0o600 });
console.log(
  JSON.stringify({
    transport: live ? 'live' : 'fixture',
    attemptedAnswers: 10,
    completedAnswers: blinded.reduce(
      (total, pair) =>
        total + [pair.A, pair.B].filter((answer) => answer.status === 'completed' && answer.answer.trim()).length,
      0
    ),
    reservedUsd: reservation / 1e9,
    outputDirectory: path.relative(directory, output)
  })
);
