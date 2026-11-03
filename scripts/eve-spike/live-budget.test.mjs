import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createLedger,
  validateRequest,
  reserveRequest,
  finishRequest,
  runMarker,
  liveEnvelope,
  requestReservation
} from './live-budget.mjs';
import { fixedEvidence } from './control.mjs';
import { demoCases } from './fixtures.mjs';

export function request(mode = 'agent', id = 'reference') {
  return {
    method: 'POST',
    headers: { 'ai-language-model-id': liveEnvelope.model, 'ai-language-model-streaming': 'false' },
    body: JSON.stringify({
      prompt: [{ role: 'user', content: [{ type: 'text', text: runMarker(mode, id) }] }],
      maxOutputTokens: 1000,
      providerOptions: { gateway: { only: ['openai'] } }
    })
  };
}
export async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'eve-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ledgerFile = path.join(directory, 'ledger.json');
  await createLedger(ledgerFile);
  return { directory, ledgerFile };
}
test('real HTTP boundary rejects alternate models, hosts, routing, tools and input/output overages', () => {
  const valid = request();
  assert.equal(validateRequest(liveEnvelope.endpoint, valid).key, 'agent:reference');
  assert.throws(() => validateRequest('https://example.com', valid));
  assert.throws(() =>
    validateRequest(liveEnvelope.endpoint, {
      ...valid,
      headers: { ...valid.headers, 'ai-language-model-id': 'different' }
    })
  );
  for (const change of [
    { maxOutputTokens: 1001 },
    { providerOptions: { gateway: { order: ['openai'] } } },
    { providerOptions: { gateway: { only: ['openai'], models: ['different'] } } },
    { tools: [{ name: 'bash', type: 'function' }] },
    { tools: [{ name: 'search', type: 'provider' }] },
    { prompt: Array(33).fill({ role: 'user', content: [] }) }
  ])
    assert.throws(() =>
      validateRequest(liveEnvelope.endpoint, {
        ...valid,
        body: JSON.stringify({ ...JSON.parse(valid.body), ...change })
      })
    );
  assert.throws(() =>
    validateRequest(liveEnvelope.endpoint, {
      ...valid,
      body: valid.body.replace('SPIKE_RUN', 'x'.repeat(36000) + 'SPIKE_RUN')
    })
  );
});
test('reservation persists before requests, failed calls consume allowance, replay and restarts are blocked', async (t) => {
  const { ledgerFile } = await fixture(t);
  const data = validateRequest(liveEnvelope.endpoint, request());
  const index = await reserveRequest(ledgerFile, data);
  assert.equal(JSON.parse(await readFile(ledgerFile)).requests[0].status, 'reserved');
  await assert.rejects(reserveRequest(ledgerFile, data));
  await finishRequest(ledgerFile, index, { status: 'incomplete' });
  await assert.rejects(reserveRequest(ledgerFile, { ...data, fingerprint: 'changed' }));
  await assert.rejects(createLedger(ledgerFile));
  assert.equal(requestReservation * 40, 704_000_000);
});
test('per-run and total provider limits apply across workers and failed attempts', async (t) => {
  const { ledgerFile } = await fixture(t);
  for (const item of demoCases) {
    for (const mode of ['agent', 'fixed']) {
      const data = validateRequest(liveEnvelope.endpoint, request(mode, item.id));
      for (let i = 0; i < (mode === 'agent' ? 7 : 1); i++)
        await reserveRequest(ledgerFile, { ...data, fingerprint: String(i) });
      await assert.rejects(reserveRequest(ledgerFile, { ...data, fingerprint: 'extra' }));
    }
  }
  assert.equal(JSON.parse(await readFile(ledgerFile)).requests.length, 40);
});
test('lock contention fails closed and never erases another worker lock', async (t) => {
  const { ledgerFile } = await fixture(t);
  await writeFile(`${ledgerFile}.lock`, 'other worker');
  await assert.rejects(reserveRequest(ledgerFile, validateRequest(liveEnvelope.endpoint, request())));
  assert.equal(await readFile(`${ledgerFile}.lock`, 'utf8'), 'other worker');
});
test('fixed control reads all five returned hits inside the same six-call evidence envelope', () => {
  for (const item of demoCases) {
    const result = fixedEvidence(item.query);
    assert.equal(result.status, 'ready');
    assert.equal(result.trace.length, result.trace[0].output.sources.length + 1);
    assert.ok(result.state.calls <= 6 && result.state.bytes <= 24000);
  }
});
