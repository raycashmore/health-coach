import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, writeFile, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGatewayComparison, gatewayModel, verifyGatewayCatalog } from './investigation/gateway.mjs';
import { syntheticCase } from './investigation/fixtures.mjs';
import { replayRequest } from './investigation/replay.mjs';
import { runInvestigation } from './investigation/run.mjs';

const endpoint = 'https://ai-gateway.vercel.sh/v1/messages';
function fixtureTransport({ usage = { input_tokens: 250, output_tokens: 30 }, count = 250, fail = false } = {}) {
  const calls = [];
  const replay = replayRequest({ semanticSearch: true });
  return {
    calls,
    transport: async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), redirect: init.redirect });
      if (url.endsWith('/count_tokens')) return Response.json({ input_tokens: count });
      if (fail) throw new Error('unknown paid outcome');
      const body = JSON.parse(init.body);
      const data = JSON.parse(body.messages[0].content);
      assert.ok(!('case' in data) && !('expected' in data));
      const step = await replay({ ...data, toolsAllowed: body.tools.length > 1 });
      return Response.json({
        id: 'synthetic-generation',
        model: gatewayModel,
        stop_reason: 'tool_use',
        usage,
        content: [
          {
            type: 'tool_use',
            name: step.action === 'answer' ? 'finish_investigation' : step.name,
            input: step.action === 'answer' ? step.answer : step.input
          }
        ]
      });
    }
  };
}
function comparison(transport, record = async () => {}) {
  return createGatewayComparison({ apiKey: 'placeholder', allowanceUsd: 1.28, record, transport });
}
const context = {
  instructions: 'Synthetic question',
  question: 'Synthetic question',
  trace: [],
  noteWindow: {},
  errors: [],
  toolsAllowed: true
};
const options = () => ({ signal: new AbortController().signal });

test('paid entry point refuses missing explicit allowance before any network request', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-investigation-comparison.mjs'], {
    encoding: 'utf8',
    env: { ...process.env, AI_GATEWAY_API_KEY: '' }
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Paid execution requires/);
  assert.throws(
    () => createGatewayComparison({ apiKey: 'placeholder', allowanceUsd: 1.29, record: async () => {} }),
    /paid-opt-in/
  );
});
test('mocked provider exercises both arms with measured usage and pre-request durable reservation', async () => {
  for (const mode of ['agent', 'fixed']) {
    const events = [];
    const fixture = fixtureTransport();
    const arm = comparison(
      async (url, init) => {
        if (url === endpoint) assert.equal(events.at(-1).status, 'reserved');
        return fixture.transport(url, init);
      },
      async (event) => {
        events.push(event);
      }
    ).requestFor(`${mode}:source`);
    const result = await runInvestigation({
      fixture: syntheticCase('source'),
      mode,
      request: arm.request,
      execution: 'gateway'
    });
    assert.equal(result.status, 'validated');
    assert.ok(Math.abs(arm.metrics().costUsd - arm.metrics().requests * 0.0008) < 1e-12);
    assert.equal(events[0].reservationMicroUsd, 30000);
    assert.ok(fixture.calls.every((c) => c.redirect === 'error'));
    assert.ok(
      fixture.calls
        .filter((c) => c.url === endpoint)
        .every(
          (c) =>
            c.body.tool_choice.disable_parallel_tool_use === true &&
            c.body.max_tokens === 1000 &&
            c.body.output_config.effort === 'low' &&
            c.body.providerOptions.gateway.only.join() === 'anthropic'
        )
    );
  }
});
test('catalog changes fail closed before generation', async () => {
  await assert.rejects(
    verifyGatewayCatalog(async () => Response.json({ data: [] })),
    /catalog-contract-changed/
  );
  await verifyGatewayCatalog(async () =>
    Response.json({
      data: [
        {
          id: gatewayModel,
          tags: ['tool-use'],
          reasoning_options: [{ type: 'effort', values: ['low'] }],
          pricing: {
            input: '0.000002',
            output: '0.00001',
            input_cache_write: '0.0000025',
            input_cache_read: '0.0000001'
          }
        }
      ]
    })
  );
});
test('exact token preflight rejects oversized contexts before paid generation', async () => {
  const fixture = fixtureTransport({ count: 7500 });
  const arm = comparison(fixture.transport).requestFor('agent:source');
  await assert.rejects(arm.request(context, options()), /input-limit/);
  assert.equal(fixture.calls.length, 1);
  assert.equal(arm.metrics().requests, 0);
});
test('uncertain paid failures retain reservation, stop all runs and do not retry', async () => {
  const events = [];
  const fixture = fixtureTransport({ fail: true });
  const group = comparison(fixture.transport, async (event) => {
    events.push(event);
  });
  const arm = group.requestFor('agent:source');
  await assert.rejects(arm.request(context, options()), /gateway-request-stopped/);
  assert.equal(arm.metrics().costUsd, null);
  assert.equal(arm.metrics().heldOrMeasuredUsd, 0.03);
  assert.equal(events.at(-1).status, 'uncertain');
  assert.equal(group.stopped, true);
  await assert.rejects(group.requestFor('fixed:source').request(context, options()), /budget-unavailable/);
  assert.equal(fixture.calls.length, 2);
  assert.throws(() => group.requestFor('agent:source'), /run-already-bound/);
});
test('provider usage violations stop comparison and retain worst-case reservation', async () => {
  for (const usage of [
    undefined,
    { input_tokens: 8100, output_tokens: 1 },
    { input_tokens: 250, output_tokens: 1001 },
    { input_tokens: 250, output_tokens: 1, cache_creation: { ephemeral_1h_input_tokens: 1 } }
  ]) {
    const fixture = fixtureTransport({ usage: usage ?? { output_tokens: 1 } });
    const arm = comparison(fixture.transport).requestFor('agent:source');
    await assert.rejects(arm.request(context, options()), /gateway-request-stopped/);
    assert.equal(arm.metrics().costUsd, null);
  }
});
test('durable reservation write failure prevents sending generation', async () => {
  const fixture = fixtureTransport();
  const arm = comparison(fixture.transport, async () => {
    throw new Error('disk full');
  }).requestFor('agent:source');
  await assert.rejects(arm.request(context, options()), /gateway-request-stopped/);
  assert.equal(fixture.calls.length, 1);
});
test('per-run reservation prevents an expensive sixth request before provider generation', async () => {
  const fixture = fixtureTransport({
    count: 6976,
    usage: { input_tokens: 6976, cache_creation_input_tokens: 1024, output_tokens: 1000 }
  });
  const arm = comparison(fixture.transport).requestFor('agent:source');
  for (let i = 0; i < 5; i++) await arm.request(context, options());
  await assert.rejects(arm.request(context, options()), /budget-unavailable/);
  assert.equal(arm.metrics().requests, 5);
  assert.ok(arm.metrics().heldOrMeasuredUsd < 0.16);
});
test('aborted requests cannot begin generation after token counting completes', async () => {
  const controller = new AbortController();
  let generated = false;
  const arm = comparison(async (url) => {
    if (url.endsWith('/count_tokens')) {
      controller.abort();
      return Response.json({ input_tokens: 100 });
    }
    generated = true;
  }).requestFor('agent:source');
  await assert.rejects(arm.request(context, { signal: controller.signal }), /gateway-request-stopped/);
  assert.equal(generated, false);
});

test('measured format failures get one repair and do not block the whole comparison', async () => {
  const fixture = fixtureTransport();
  let first = true;
  const group = comparison(async (url, init) => {
    const response = await fixture.transport(url, init);
    if (url === endpoint && first) {
      first = false;
      const result = await response.json();
      return Response.json({
        ...result,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Unstructured output must not be displayed.' }]
      });
    }
    return response;
  });
  const arm = group.requestFor('fixed:no-change');
  const result = await runInvestigation({
    fixture: syntheticCase('no-change'),
    mode: 'fixed',
    request: arm.request,
    execution: 'gateway'
  });
  assert.equal(result.status, 'validated');
  assert.equal(result.metrics.repair, true);
  assert.equal(arm.metrics().requests, 2);
  assert.doesNotMatch(result.text, /Unstructured output/);
});

test('CLI saves partial evidence and exits with ledger warning after unknown paid outcome', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'investigation-cli-'));
  try {
    const mock = join(directory, 'mock.mjs');
    await writeFile(
      mock,
      `globalThis.fetch = async (url) => {
      if (url.endsWith('/models')) return Response.json({ data: [{ id: 'anthropic/claude-sonnet-5.5', tags: ['tool-use'], reasoning_options: [{type:'effort',values:['low']}], pricing: { input:'0.000002',output:'0.00001',input_cache_write:'0.0000025',input_cache_read:'0.0000001' } }] });
      if (url.endsWith('/count_tokens')) return Response.json({input_tokens:100});
      throw new Error('synthetic unknown paid outcome');
    };`
    );
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        import.meta.resolve('tsx'),
        '--import',
        mock,
        fileURLToPath(new URL('./run-investigation-comparison.mjs', import.meta.url)),
        '--allow-usd',
        '1.28'
      ],
      { cwd: directory, encoding: 'utf8', env: { ...process.env, AI_GATEWAY_API_KEY: 'placeholder' } }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Inspect the local ledger/);
    assert.doesNotMatch(result.stdout, /comparison saved/);
    const folders = await readdir(join(directory, 'outputs'));
    const folder = join(directory, 'outputs', folders[0]);
    const results = JSON.parse(await readFile(join(folder, 'results.json'), 'utf8'));
    assert.equal(results.length, 1);
    assert.equal(results[0].metrics.costUsd, null);
    assert.match(await readFile(join(folder, 'spend.jsonl'), 'utf8'), /uncertain/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a settled model output limit ends only its run and preserves unattempted arms', async () => {
  const fixture = fixtureTransport();
  let first = true;
  const group = comparison(async (url, init) => {
    const response = await fixture.transport(url, init);
    if (url === endpoint && first) {
      first = false;
      const result = await response.json();
      return Response.json({
        ...result,
        stop_reason: 'max_tokens',
        usage: { input_tokens: 250, output_tokens: 1000 },
        content: []
      });
    }
    return response;
  });
  const arm = group.requestFor('fixed:no-change');
  const result = await runInvestigation({
    fixture: syntheticCase('no-change'),
    mode: 'fixed',
    request: arm.request,
    execution: 'gateway'
  });
  assert.equal(result.reason, 'output-limit');
  assert.equal(group.stopped, false);
  assert.equal(arm.metrics().costUsd, 0.0105);
  assert.equal(arm.metrics().usage[0].finishReason, 'max_tokens');
  const next = group.requestFor('fixed:missing');
  const nextResult = await runInvestigation({
    fixture: syntheticCase('missing'),
    mode: 'fixed',
    request: next.request,
    execution: 'gateway'
  });
  assert.equal(nextResult.status, 'validated');
});

test('live answers within the provider token cap are not rejected by the offline byte cap', async () => {
  const fixture = fixtureTransport({ usage: { input_tokens: 250, output_tokens: 900 } });
  const group = comparison(async (url, init) => {
    const response = await fixture.transport(url, init);
    if (url !== endpoint) return response;
    const result = await response.json();
    const answer = result.content[0].input;
    answer.claims[0].text =
      'Recorded sleep has no meaningful change.' +
      ' '.repeat(580) +
      ' Comparable recent and baseline records are available.';
    answer.contextQuestion =
      'Was anything different about the recording setup?' + ' '.repeat(200) + ' Any other context?';
    assert.ok(Buffer.byteLength(JSON.stringify({ action: 'answer', answer })) > 1000);
    return Response.json(result);
  });
  const arm = group.requestFor('fixed:no-change');
  const result = await runInvestigation({
    fixture: syntheticCase('no-change'),
    mode: 'fixed',
    request: arm.request,
    execution: 'gateway'
  });
  assert.equal(result.status, 'validated');
});
test('a smaller approved total allowance blocks before an extra generation', async () => {
  const fixture = fixtureTransport();
  const group = createGatewayComparison({
    apiKey: 'placeholder',
    allowanceUsd: 0.03,
    record: async () => {},
    transport: fixture.transport
  });
  const arm = group.requestFor('agent:source');
  await arm.request(context, options());
  await assert.rejects(arm.request(context, options()), /budget-unavailable/);
  assert.equal(fixture.calls.length, 2);
});

test('a known preflight input limit stops only its run with no paid reservation', async () => {
  const fixture = fixtureTransport({ count: 7500 });
  const group = comparison(fixture.transport);
  const arm = group.requestFor('fixed:no-change');
  const result = await runInvestigation({
    fixture: syntheticCase('no-change'),
    mode: 'fixed',
    request: arm.request,
    execution: 'gateway'
  });
  assert.equal(result.reason, 'input-limit');
  assert.equal(group.stopped, false);
  assert.equal(arm.metrics().requests, 0);
  assert.equal(arm.metrics().costUsd, 0);
});
