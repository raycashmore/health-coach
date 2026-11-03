import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectQuality,
  lexicalTerms,
  localLexicalSearch,
  qualityQuestions,
  supportMetrics,
  syntheticSections
} from './retrieval/quality.mjs';
test('identifier matching retrieves resolvable bounded evidence without accepting support', () => {
  const sections = syntheticSections();
  assert.deepEqual(lexicalTerms('Which ribbon fits LP-42?'), ['ribbon', 'fits', 'lp-42']);
  const q = qualityQuestions.find((q) => q.id === 'q05');
  const hits = localLexicalSearch(q.query, sections);
  const [row] = inspectQuality([q], { [q.id]: hits }, sections);
  assert.equal(row.sources[0].document, 'printer');
  assert.match(row.sources[0].excerpt, /R7/);
  assert.equal(row.outcome, 'review-needed');
  assert.throws(
    () => inspectQuality([q], { [q.id]: [{ ...hits[0], revision: 'stale' }] }, sections),
    /revision unavailable/
  );
});
test('empty answerable retrieval records false abstention; misleading and partial matches stay reviewable', () => {
  const sections = syntheticSections();
  const cases = qualityQuestions.filter((q) => ['q01', 'q13', 'q14'].includes(q.id));
  const rankings = Object.fromEntries(
    cases.map((q) => [q.id, q.id === 'q01' ? [] : localLexicalSearch(q.query, sections)])
  );
  const rows = inspectQuality(cases, rankings, sections);
  assert.equal(rows[0].outcome, 'no-support-found');
  assert.equal(rows[1].outcome, 'review-needed');
  assert.equal(rows[2].support, 'partial');
  const metrics = supportMetrics(rows).development;
  assert.equal(metrics.falseAbstentions, 1);
  assert.equal(metrics.unsupportedCases, 2);
  assert.equal(metrics.unsupportedAccepted, 0);
  assert.equal(metrics.reviewNeeded, 2);
});
