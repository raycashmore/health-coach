import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { generateText, streamText } from 'ai';
import { liveModel } from './live-model.mjs';
import { createLedger, runMarker } from './live-budget.mjs';
import { sonnetFixtureTransport } from './sonnet-model.mjs';

async function setup(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'sonnet-spike-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ledgerFile = path.join(dir, 'ledger.json');
  const credentialsFile = path.join(dir, 'fixture.env');
  await createLedger(ledgerFile);
  await writeFile(credentialsFile, 'AI_GATEWAY_API_KEY=placeholder');
  return { ledgerFile, credentialsFile };
}
for (const stream of [false, true])
  test(`Sonnet ${stream ? 'stream' : 'generate'} counts native input before one bounded generation`, async (t) => {
    const config = await setup(t);
    const requests = [];
    const model = await liveModel({
      ...config,
      toolsAvailable: false,
      transport: (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(init.body) });
        assert.equal(init.redirect, 'error');
        assert.ok(!init.body.includes('SPIKE_RUN'));
        assert.ok(!new Headers(init.headers).has('x-hc-spike-run'));
        return sonnetFixtureTransport(url, init);
      }
    });
    const options = { model, prompt: runMarker('agent', 'reference'), maxRetries: 0 };
    const result = stream ? streamText(options) : await generateText(options);
    assert.equal(await result.text, 'OFFLINE Sonnet transport fixture.');
    assert.equal(requests.length, 2);
    assert.ok(requests[0].url.endsWith('/count_tokens'));
    assert.equal(requests[0].body.providerOptions, undefined);
    assert.ok(requests[1].url.endsWith('/messages'));
    assert.deepEqual(requests[0].body.messages, requests[1].body.messages);
    assert.deepEqual(requests[0].body.system, requests[1].body.system);
    assert.deepEqual(requests[0].body.tools, requests[1].body.tools);
    assert.equal(requests[1].body.max_tokens, 2000);
    assert.equal(requests[1].body.output_config.effort, 'low');
    assert.deepEqual(requests[1].body.providerOptions, { gateway: { only: ['anthropic'] } });
    const ledger = JSON.parse(await readFile(config.ledgerFile));
    assert.equal(ledger.requests[0].preflightInputTokens, 250);
    assert.equal(ledger.requests[0].status, 'completed');
  });
test('Sonnet input count failure or excessive count prevents generation and consumes no unrecorded retry', async (t) => {
  const config = await setup(t);
  let calls = 0;
  const model = await liveModel({
    ...config,
    toolsAvailable: false,
    transport: async () => {
      calls++;
      return Response.json({ input_tokens: 40000 });
    }
  });
  await assert.rejects(generateText({ model, prompt: runMarker('agent', 'reference'), maxRetries: 2 }), /incomplete/);
  assert.equal(calls, 1);
  const row = JSON.parse(await readFile(config.ledgerFile)).requests[0];
  assert.equal(row.generationSent, false);
  assert.equal(row.reason, 'token-count-limit');
});
test('Sonnet native usage includes cached tokens and thinking within the output cap', async (t) => {
  const config = await setup(t);
  const model = await liveModel({
    ...config,
    toolsAvailable: false,
    transport: async (url, init) => {
      const response = await sonnetFixtureTransport(url, init);
      if (String(url).endsWith('/count_tokens')) return Response.json({ input_tokens: 350 });
      const data = await response.json();
      data.usage.cache_creation_input_tokens = 50;
      data.usage.cache_read_input_tokens = 50;
      return Response.json(data);
    }
  });
  await generateText({ model, prompt: runMarker('agent', 'reference'), maxRetries: 0 });
  const row = JSON.parse(await readFile(config.ledgerFile)).requests[0];
  assert.equal(row.inputTokens, 350);
  assert.equal(row.outputTokens, 30);
  assert.equal(row.tokenCostNanoUsd, 250 * 2000 + 50 * 2500 + 50 * 100 + 30 * 10000);
});

test('Sonnet provider failure is terminal and cannot resend generation after a changed prompt', async (t) => {
  const config = await setup(t);
  const calls = [];
  const model = await liveModel({
    ...config,
    toolsAvailable: false,
    transport: async (url, init) => {
      calls.push(String(url));
      if (String(url).endsWith('/count_tokens')) return Response.json({ input_tokens: 250 });
      return new Response('unavailable', { status: 503 });
    }
  });
  await assert.rejects(generateText({ model, prompt: runMarker('agent', 'reference'), maxRetries: 2 }), /incomplete/);
  await assert.rejects(
    generateText({ model, prompt: runMarker('agent', 'reference') + '\nchanged', maxRetries: 0 }),
    /incomplete/
  );
  assert.equal(calls.length, 2);
  const row = JSON.parse(await readFile(config.ledgerFile)).requests[0];
  assert.equal(row.reason, 'provider-failure');
  assert.equal(row.generationSent, true);
});
test('Sonnet count/body or output contract violations withhold answers and stop later cases', async (t) => {
  const config = await setup(t);
  let calls = 0;
  const model = await liveModel({
    ...config,
    toolsAvailable: false,
    transport: async (url, init) => {
      calls++;
      if (String(url).endsWith('/count_tokens')) return Response.json({ input_tokens: 250 });
      const data = await (await sonnetFixtureTransport(url, init)).json();
      data.usage.output_tokens = 2001;
      return Response.json(data);
    }
  });
  await assert.rejects(generateText({ model, prompt: runMarker('agent', 'reference'), maxRetries: 0 }), /incomplete/);
  await assert.rejects(generateText({ model, prompt: runMarker('agent', 'partial'), maxRetries: 0 }), /incomplete/);
  assert.equal(calls, 2);
  const ledger = JSON.parse(await readFile(config.ledgerFile));
  assert.equal(ledger.stoppedReason, 'provider-usage-limit');
  assert.equal(ledger.requests[0].outputTokens, 2001);
});
test('Sonnet reserved profile cannot be used to generate the fixed-control arm', async (t) => {
  const config = await setup(t);
  let calls = 0;
  const model = await liveModel({
    ...config,
    toolsAvailable: false,
    transport: async () => {
      calls++;
      throw new Error('must not send');
    }
  });
  await assert.rejects(generateText({ model, prompt: runMarker('fixed', 'reference'), maxRetries: 0 }), /incomplete/);
  assert.equal(calls, 0);
});

test('unexpected one-hour cache charge is recorded accurately and stops the experiment', async (t) => {
  const config = await setup(t);
  const model = await liveModel({
    ...config,
    toolsAvailable: false,
    transport: async (url, init) => {
      if (String(url).endsWith('/count_tokens')) return Response.json({ input_tokens: 350 });
      const data = await (await sonnetFixtureTransport(url, init)).json();
      data.usage.cache_creation_input_tokens = 100;
      data.usage.cache_creation = { ephemeral_1h_input_tokens: 100 };
      return Response.json(data);
    }
  });
  await assert.rejects(generateText({ model, prompt: runMarker('agent', 'reference'), maxRetries: 0 }), /incomplete/);
  const ledger = JSON.parse(await readFile(config.ledgerFile));
  assert.equal(ledger.stoppedReason, 'provider-usage-limit');
  assert.equal(ledger.requests[0].tokenCostNanoUsd, 250 * 2000 + 100 * 4000 + 30 * 10000);
});
