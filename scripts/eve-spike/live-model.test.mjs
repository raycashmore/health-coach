import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateText, streamText } from 'ai';
import { createLedger, runMarker } from './live-budget.mjs';
import { liveModel } from './live-model.mjs';
import { fixtureTransport } from './fixture-transport.mjs';

async function setup(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'eve-model-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ledgerFile = path.join(directory, 'ledger.json');
  const credentialsFile = path.join(directory, 'fixture.env');
  await createLedger(ledgerFile);
  await writeFile(credentialsFile, 'AI_GATEWAY_API_KEY=placeholder');
  return { ledgerFile, credentialsFile };
}
for (const streamed of [false, true])
  test(`SDK ${streamed ? 'stream' : 'generate'} uses one bounded non-streaming transport and records usage`, async (t) => {
    const config = await setup(t);
    let calls = 0;
    const model = await liveModel({
      ...config,
      transport: (...args) => {
        calls++;
        assert.ok(!args[1].body.includes('SPIKE_RUN'));
        assert.ok(!new Headers(args[1].headers).has('x-hc-spike-run'));
        return fixtureTransport(...args);
      },
      toolsAvailable: false
    });
    const options = { model, prompt: runMarker('fixed', 'reference'), maxRetries: 0 };
    const result = streamed ? streamText(options) : await generateText(options);
    assert.equal(await result.text, 'OFFLINE comparison transport fixture.');
    assert.equal(calls, 1);
    const ledger = JSON.parse(await readFile(config.ledgerFile));
    assert.equal(ledger.requests[0].status, 'completed');
    assert.ok(ledger.requests[0].inputTokens > 0);
    assert.equal(ledger.requests[0].reservationNanoUsd, 17_600_000);
  });
test('network/provider failure is terminal, consumes reservation and cannot retry even with changed context', async (t) => {
  const config = await setup(t);
  let calls = 0;
  const model = await liveModel({
    ...config,
    transport: async () => {
      calls++;
      return new Response('unavailable', { status: 503 });
    },
    toolsAvailable: false
  });
  await assert.rejects(generateText({ model, prompt: runMarker('fixed', 'reference'), maxRetries: 2 }), /incomplete/);
  await assert.rejects(
    generateText({ model, prompt: runMarker('fixed', 'reference') + '\nchanged', maxRetries: 0 }),
    /incomplete/
  );
  assert.equal(calls, 1);
  assert.equal(JSON.parse(await readFile(config.ledgerFile)).requests[0].status, 'incomplete');
});
test('oversized context fails before HTTP and before reservation', async (t) => {
  const config = await setup(t);
  let calls = 0;
  const model = await liveModel({
    ...config,
    transport: async () => {
      calls++;
      throw new Error('must not call');
    },
    toolsAvailable: false
  });
  await assert.rejects(
    generateText({ model, prompt: runMarker('fixed', 'reference') + 'x'.repeat(40000), maxRetries: 0 }),
    /incomplete/
  );
  assert.equal(calls, 0);
  assert.equal(JSON.parse(await readFile(config.ledgerFile)).requests.length, 0);
});
test('provider usage overflow withholds the output and blocks later calls', async (t) => {
  const config = await setup(t);
  const model = await liveModel({
    ...config,
    transport: async (...args) => {
      const data = await (await fixtureTransport(...args)).json();
      data.usage.outputTokens.total = 1001;
      return Response.json(data);
    },
    toolsAvailable: false
  });
  await assert.rejects(generateText({ model, prompt: runMarker('fixed', 'reference'), maxRetries: 0 }), /incomplete/);
  assert.equal(JSON.parse(await readFile(config.ledgerFile)).requests[0].status, 'incomplete');
});

test('length-limited output preserves billed usage and stopping reason while withholding the answer', async (t) => {
  const config = await setup(t);
  const model = await liveModel({
    ...config,
    transport: async (...args) => {
      const data = await (await fixtureTransport(...args)).json();
      data.finishReason = { unified: 'length', raw: 'length' };
      return Response.json(data);
    },
    toolsAvailable: false
  });
  await assert.rejects(generateText({ model, prompt: runMarker('fixed', 'reference'), maxRetries: 0 }), /incomplete/);
  const row = JSON.parse(await readFile(config.ledgerFile)).requests[0];
  assert.equal(row.status, 'incomplete');
  assert.equal(row.reason, 'incomplete-provider-output');
  assert.ok(row.inputTokens > 0 && row.tokenCostNanoUsd > 0);
});

test('provider usage-contract violation stops the whole experiment, including other cases', async (t) => {
  const config = await setup(t);
  let calls = 0;
  const model = await liveModel({
    ...config,
    transport: async (...args) => {
      calls++;
      const data = await (await fixtureTransport(...args)).json();
      data.usage.inputTokens.total = 40001;
      return Response.json(data);
    },
    toolsAvailable: false
  });
  await assert.rejects(generateText({ model, prompt: runMarker('fixed', 'reference'), maxRetries: 0 }), /incomplete/);
  await assert.rejects(generateText({ model, prompt: runMarker('fixed', 'partial'), maxRetries: 0 }), /incomplete/);
  const ledger = JSON.parse(await readFile(config.ledgerFile));
  assert.equal(calls, 1);
  assert.equal(ledger.stoppedReason, 'provider-usage-limit');
  assert.equal(ledger.requests[0].inputTokens, 40001);
});

test('HTTP redirects fail closed without a second request or another reservation', async (t) => {
  const { createServer } = await import('node:http');
  const config = await setup(t);
  let initial = 0;
  let redirected = 0;
  const server = createServer((request, response) => {
    if (request.url === '/redirected') {
      redirected++;
      response.end('must not arrive');
    } else {
      initial++;
      response.writeHead(307, { location: '/redirected' });
      response.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const model = await liveModel({
    ...config,
    transport: (_url, init) => fetch(`http://127.0.0.1:${address.port}/start`, init),
    toolsAvailable: false
  });
  await assert.rejects(generateText({ model, prompt: runMarker('fixed', 'reference'), maxRetries: 2 }), /incomplete/);
  assert.equal(initial, 1);
  assert.equal(redirected, 0);
  assert.equal(JSON.parse(await readFile(config.ledgerFile)).requests.length, 1);
});
