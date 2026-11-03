import { mkdir, writeFile } from 'node:fs/promises';
import {
  inspectQuality,
  localLexicalSearch,
  qualityQuestions,
  rubric,
  supportMetrics,
  syntheticSections
} from './retrieval/quality.mjs';
import { scoreRetrieval } from './retrieval/metrics.mjs';
const sections = syntheticSections();
const rankings = Object.fromEntries(qualityQuestions.map((q) => [q.id, localLexicalSearch(q.query, sections)]));
const inspection = inspectQuality(qualityQuestions, rankings, sections);
const report = {
  rubric,
  environment:
    'Local exact-token OR baseline; cloud Postgres uses English stemming and rank. No embeddings or paid calls.',
  usage: { tokens: 0, usd: 0 },
  quality: scoreRetrieval(qualityQuestions, rankings, 5),
  support: supportMetrics(inspection),
  inspection
};
await mkdir('private-data/retrieval-quality', { recursive: true });
await writeFile('private-data/retrieval-quality/local.json', JSON.stringify(report, null, 2));
console.log('Synthetic inspection saved to private-data/retrieval-quality/local.json');
