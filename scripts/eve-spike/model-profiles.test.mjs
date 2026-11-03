import assert from 'node:assert/strict';
import test from 'node:test';
import { modelComparisonIds, selectModelProfile, comparisonReservation } from './model-profiles.mjs';

test('registered comparison keeps original grant isolated and reserves both arms below US$5', () => {
  const original = selectModelProfile();
  assert.equal(original.requests, 40);
  assert.equal(original.outputTokens, 1000);
  assert.equal(original.agentOnly, false);
  const profiles = modelComparisonIds.map(selectModelProfile);
  assert.deepEqual(
    profiles.map((p) => p.model),
    ['openai/gpt-4.1-mini', 'anthropic/claude-sonnet-5.5']
  );
  assert.ok(profiles.every((p) => p.agentOnly && p.outputTokens === 2000 && p.requests === 35));
  for (const p of profiles)
    assert.ok(p.requests * (p.inputTokens * p.inputNanoUsd + p.outputTokens * p.outputNanoUsd) <= p.allowanceNanoUsd);
  assert.equal(comparisonReservation(), 4_872_000_000);
  assert.equal(
    profiles.reduce((sum, p) => sum + p.allowanceNanoUsd, 0),
    5_000_000_000
  );
  assert.throws(() => selectModelProfile('unregistered'));
  assert.throws(() => selectModelProfile('constructor'));
});
