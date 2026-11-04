import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEvidence } from './investigation/evidence.mjs';
import { validateAnswer } from './investigation/answer.mjs';
import { syntheticCase } from './investigation/fixtures.mjs';
import { replayAll, replayRequest } from './investigation/replay.mjs';
import { fixedEvidence, runInvestigation } from './investigation/run.mjs';

const search = (query) => ({ query, from: '2026-10-13', to: '2026-10-22' });
const answer = (conclusion, claims) => ({ conclusion, claims, contextQuestion: null });
const claim = (kind, text, ...evidence) => ({ kind, text, evidence });

test('offline paired replay exercises four fixed cases without claiming model performance', async () => {
  const report = await replayAll();
  assert.match(report.evidence, /not a model comparison/);
  assert.equal(report.rows.length, 8);
  assert.ok(report.rows.every((r) => r.status === 'validated' && r.costUsd === 0));
  assert.equal(
    report.rows.find((r) => r.case === 'different-words' && r.arm === 'fixed').conclusion,
    'unexplained-change'
  );
});
test('both arms require two distinct full-window searches for unexplained', () => {
  const evidence = createEvidence(syntheticCase('missing'));
  evidence.call('get_wearable_comparison', {});
  const first = evidence.call('search_notes', search('sleep'));
  const make = (...handles) => answer('unexplained-change', [claim('not-found', 'No note matched.', ...handles)]);
  assert.ok(validateAnswer(make(first.records[0].handle), evidence).includes('two-searches-required'));
  const duplicate = evidence.call('search_notes', search('sleep'));
  assert.equal(duplicate.duplicate, true);
  assert.equal(evidence.trace.length, 3);
  assert.ok(
    validateAnswer(make(first.records[0].handle, duplicate.records[0].handle), evidence).includes(
      'two-searches-required'
    )
  );
  const second = evidence.call('search_notes', search('travel'));
  assert.deepEqual(validateAnswer(make(first.records[0].handle, second.records[0].handle), evidence), []);
  const fixed = createEvidence(syntheticCase('missing'));
  fixedEvidence(fixed);
  assert.equal(fixed.trace.filter((r) => r.name === 'search_notes').length, 2);
});
test('note search filters the old distractor; read requires a returned current handle', () => {
  const e = createEvidence(syntheticCase('different-words'));
  assert.deepEqual(e.call('search_notes', search('sleep')).hits, []);
  assert.equal(e.call('read_note_section', { handle: 'note:travel:v1:0:L1-2' }).status, 'unavailable');
  const hit = e.call('search_notes', search('flight')).hits[0];
  const a = answer('explained-by-owner-note', [claim('owner-note', 'Travel was noted.', hit.handle)]);
  assert.ok(validateAnswer(a, e).includes('note-not-read'));
  e.call('read_note_section', { handle: hit.handle });
  assert.deepEqual(validateAnswer(a, e), []);
  const stale = createEvidence(syntheticCase('different-words'));
  assert.ok(validateAnswer(a, stale).includes('unknown-evidence'));
});
test('a search hit cannot support a not-found claim, and an old note cannot explain the change', () => {
  const e = createEvidence(syntheticCase('different-words'));
  const found = e.call('search_notes', search('flight')).records[0];
  assert.ok(
    validateAnswer(answer('unexplained-change', [claim('not-found', 'No match.', found.handle)]), e).includes(
      'not-found-search'
    )
  );
  const old = e.call('search_notes', { query: 'sleep' }).hits[0];
  e.call('read_note_section', { handle: old.handle });
  assert.ok(
    validateAnswer(answer('explained-by-owner-note', [claim('owner-note', 'Old context.', old.handle)]), e).includes(
      'in-window-note-required'
    )
  );
});
test('measurement numbers and dates must match cited records', () => {
  const e = createEvidence(syntheticCase('missing'));
  const sleep = e.call('get_wearable_comparison', {}).records.find((r) => r.metric === 'sleepMinutes');
  const valid = answer('unexplained-change', [
    claim('measured', 'About 92 minutes below 442, ending 2026-10-22.', sleep.handle)
  ]);
  assert.ok(!validateAnswer(valid, e).includes('number-mismatch'));
  valid.claims[0].text = 'About 150 minutes below, ending 2026-10-23.';
  assert.ok(validateAnswer(valid, e).includes('number-mismatch'));
  assert.ok(validateAnswer(valid, e).includes('date-mismatch'));
});
test('source conclusion needs recent and earlier sleep days with differing aliases', () => {
  const e = createEvidence(syntheticCase('source'));
  const s = e.call('get_wearable_comparison', {}).records.find((r) => r.metric === 'sleepMinutes');
  const a = answer('recording-source-change', [claim('measured', 'Sources changed.', s.handle)]);
  assert.ok(validateAnswer(a, e).includes('source-change-evidence'));
  const days = e.call('get_daily_values', { metric: 'sleepMinutes', start: '2026-10-16', end: '2026-10-22' }).records;
  a.claims[0].evidence = days.map((r) => r.handle);
  assert.deepEqual(validateAnswer(a, e), []);
  assert.throws(
    () => e.call('get_daily_values', { metric: 'sleepMinutes', start: '2026-09-01', end: '2026-10-22' }),
    /date-outside/
  );
});
test('non-notable sleep requires restraint even when another metric changes', () => {
  const e = createEvidence(syntheticCase('no-change'));
  const s = e.call('get_wearable_comparison', {}).records.find((r) => r.metric === 'sleepMinutes');
  assert.ok(
    validateAnswer(answer('explained-by-owner-note', [claim('measured', 'Changed.', s.handle)]), e).includes(
      'sleep-notable-conclusion'
    )
  );
});
test('one repair is accepted, second invalid answer fails closed without partial text', async () => {
  let attempt = 0;
  const replay = replayRequest();
  const repaired = await runInvestigation({
    fixture: syntheticCase('no-change'),
    mode: 'fixed',
    request: async (ctx) => (++attempt === 1 ? { action: 'answer', answer: {} } : replay(ctx))
  });
  assert.equal(repaired.status, 'validated');
  assert.equal(repaired.metrics.repair, true);
  const failed = await runInvestigation({
    fixture: syntheticCase('missing'),
    mode: 'fixed',
    request: async () => ({ action: 'answer', answer: { text: 'DO NOT SHOW' } })
  });
  assert.equal(failed.reason, 'validation-failed');
  assert.equal(failed.metrics.requests, 2);
  assert.deepEqual(failed.metrics.validationFailures, [['answer-schema'], ['answer-schema']]);
  assert.doesNotMatch(failed.text, /DO NOT SHOW/);
});
test('coverage stops before invoking request; fixed arm rejects model-selected tools', async () => {
  const fixture = syntheticCase('missing');
  fixture.comparison.coverage.find((c) => c.metric === 'sleepMinutes').comparable = false;
  const result = await runInvestigation({
    fixture,
    request: () => {
      throw new Error('must not run');
    }
  });
  assert.equal(result.reason, 'insufficient-coverage');
  assert.equal(result.metrics.requests, 0);
  const fixed = await runInvestigation({
    fixture: syntheticCase('missing'),
    mode: 'fixed',
    request: async () => ({ action: 'tool', name: 'search_notes', input: search('flight') })
  });
  assert.equal(fixed.reason, 'tools-not-allowed');
});
test('deadline aborts a hanging request and rejects late answers', async () => {
  let signal;
  const result = await runInvestigation({
    fixture: syntheticCase('missing'),
    timeoutMs: 10,
    request: async (_, options) => {
      signal = options.signal;
      return new Promise(() => {});
    }
  });
  assert.equal(result.reason, 'time-limit');
  assert.equal(signal.aborted, true);
});
test('request, tool and byte budgets fail closed; duplicates consume calls', async () => {
  const result = await runInvestigation({
    fixture: syntheticCase('missing'),
    request: async () => ({ action: 'tool', name: 'get_wearable_comparison', input: {} })
  });
  assert.equal(result.reason, 'request-limit');
  const e = createEvidence(syntheticCase('missing'));
  for (let i = 0; i < 6; i++) e.call('get_wearable_comparison', {});
  assert.throws(() => e.call('get_wearable_comparison', {}), /tool-call-limit/);
  const large = syntheticCase('different-words');
  large.notes[1].text = `flight ${'x'.repeat(6100)}`;
  const bytes = createEvidence(large);
  const hit = bytes.call('search_notes', search('flight')).hits[0];
  assert.throws(() => bytes.call('read_note_section', { handle: hit.handle }), /evidence-byte-limit/);
  const output = await runInvestigation({
    fixture: syntheticCase('missing'),
    request: async () => ({ text: 'x'.repeat(1100) })
  });
  assert.equal(output.reason, 'output-limit');
});
test('invalid tools and request failures never escape as owner answers', async () => {
  const result = await runInvestigation({
    fixture: syntheticCase('missing'),
    request: async () => ({ action: 'tool', name: 'shell', input: {} })
  });
  assert.equal(result.reason, 'invalid-tool-input');
  const failed = await runInvestigation({
    fixture: syntheticCase('missing'),
    request: async () => {
      throw new Error('provider secret');
    }
  });
  assert.equal(failed.reason, 'request-failed');
  assert.doesNotMatch(JSON.stringify(failed), /provider secret/);
});

test('reordered source aliases do not create a recording-source change', () => {
  const fixture = syntheticCase('source');
  for (const [i, day] of fixture.snapshot.days.entries()) {
    day.sleepMinutes.origins = i >= 18 ? ['source-2', 'source-1'] : ['source-1', 'source-2'];
  }
  const e = createEvidence(fixture);
  const days = e.call('get_daily_values', { metric: 'sleepMinutes', start: '2026-10-16', end: '2026-10-22' }).records;
  assert.ok(
    validateAnswer(
      answer('recording-source-change', [claim('measured', 'Sources changed.', ...days.map((r) => r.handle))]),
      e
    ).includes('source-change-evidence')
  );
});
test('wearable handles use each metric end date', () => {
  const e = createEvidence(syntheticCase('source'));
  const records = e.call('get_wearable_comparison', {}).records;
  assert.ok(records.every((record) => record.handle.endsWith(record.endDate)));
});
test('non-Error callback rejections still return the deterministic fallback', async () => {
  for (const rejection of [null, undefined, 'private failure']) {
    const result = await runInvestigation({
      fixture: syntheticCase('missing'),
      request: () => Promise.reject(rejection)
    });
    assert.equal(result.reason, 'request-failed');
  }
});

test('prose dates cannot pass by accidentally matching a measurement count', () => {
  const e = createEvidence(syntheticCase('missing'));
  const s = e.call('get_wearable_comparison', {}).records.find((r) => r.metric === 'sleepMinutes');
  for (const text of ['Recorded sleep was lower on October 18.', 'Recorded sleep was lower on 10/18.']) {
    assert.ok(
      validateAnswer(answer('unexplained-change', [claim('measured', text, s.handle)]), e).includes(
        'date-format-use-iso'
      )
    );
  }
});
test('stopword-only query changes do not count as a second evidence search', () => {
  const e = createEvidence(syntheticCase('missing'));
  const first = e.call('search_notes', search('sleep')).records[0];
  const second = e.call('search_notes', search('my sleep')).records[0];
  assert.ok(
    validateAnswer(
      answer('unexplained-change', [claim('not-found', 'No match.', first.handle, second.handle)]),
      e
    ).includes('two-searches-required')
  );
});

test('modal may remains valid hedging while May dates require ISO format', () => {
  const e = createEvidence(syntheticCase('source'));
  const s = e.call('get_wearable_comparison', {}).records.find((r) => r.metric === 'sleepMinutes');
  const make = (text) => answer('recording-source-change', [claim('inference', text, s.handle)]);
  assert.ok(!validateAnswer(make('This may reflect a recording change.'), e).includes('date-format-use-iso'));
  for (const text of ['Changed on May 18.', 'Changed on 18 May.', 'Changed on May 1.']) {
    assert.ok(validateAnswer(make(text), e).includes('date-format-use-iso'));
  }
});

test('live input envelopes over the offline byte approximation can reach paid token preflight', async () => {
  let requests = 0;
  let repairedEnvelopeBytes = 0;
  const result = await runInvestigation({
    fixture: syntheticCase('source'),
    execution: 'gateway',
    request: async (context) => {
      requests++;
      if (requests === 1) return { action: 'tool', name: 'get_wearable_comparison', input: {} };
      if (requests === 2)
        return {
          action: 'tool',
          name: 'get_daily_values',
          input: { metric: 'sleepMinutes', start: '2026-10-02', end: '2026-10-22' }
        };
      if (requests === 3) return { action: 'answer', answer: { invalidDraft: 'x'.repeat(1800) } };
      repairedEnvelopeBytes = Buffer.byteLength(JSON.stringify(context)) + 1000;
      const days = context.trace.find((t) => t.name === 'get_daily_values').output.records;
      return {
        action: 'answer',
        answer: answer('recording-source-change', [
          claim('measured', 'Recording sources changed in the recent window.', days[0].handle, days.at(-1).handle)
        ])
      };
    }
  });
  assert.ok(repairedEnvelopeBytes > 8000);
  assert.equal(result.status, 'validated');
  assert.equal(requests, 4);
  assert.deepEqual(result.metrics.validationFailures, [['answer-schema']]);
});
