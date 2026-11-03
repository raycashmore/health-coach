import { createHash } from 'node:crypto';
import { sectionMarkdown } from './prepare-markdown.mjs';
import { notes, questions } from './synthetic-corpus.mjs';

export const rubric = {
  version: 'support-v1',
  formulation:
    'Lowercase alphanumeric terms, preserving hyphenated identifiers; remove fixed question stopwords; OR matching. No model rewriting.',
  tuning: 'Fixed before execution. No thresholds calibrated on holdout. Original questions and corpus unchanged.',
  support:
    'Authored labels: candidate = all requested facts present; partial = only some facts present; absent = no requested fact present. Relevance alone does not establish support.',
  decision:
    'Empty retrieval: no-support-found (not proof of corpus absence). Nonempty: review-needed. No automatic candidate/partial acceptance is defensible from ranking alone.'
};
const stopwords = new Set(
  'a an the is are was were do does i it its and or of to in on at for from with where which what how who should can my before rather than'.split(
    ' '
  )
);
export function lexicalTerms(query) {
  return [
    ...new Set((query.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? []).filter((term) => !stopwords.has(term)))
  ];
}
export function lexicalQuery(query) {
  return lexicalTerms(query).join(' OR ');
}
export const qualityQuestions = [
  ...questions.map((q) => ({ ...q, support: q.required.length ? 'candidate' : 'absent' })),
  {
    id: 'q13',
    query: 'What is the repair ledger password?',
    required: [],
    kind: 'misleading-neighbor',
    split: 'development',
    support: 'absent'
  },
  {
    id: 'q14',
    query: 'Which ribbon fits LP-42 and what does it cost?',
    required: ['printer'],
    kind: 'partial',
    split: 'development',
    support: 'partial'
  },
  {
    id: 'q15',
    query: 'What is the steel charging cabinet access code?',
    required: [],
    kind: 'misleading-neighbor',
    split: 'holdout',
    support: 'absent'
  },
  {
    id: 'q16',
    query: 'Where do large deliveries enter and what is the delivery charge?',
    required: ['delivery'],
    kind: 'partial',
    split: 'holdout',
    support: 'partial'
  }
];
export function syntheticSections() {
  return notes.flatMap((note) => {
    const revision = createHash('sha256').update(note.markdown).digest('hex');
    return sectionMarkdown(note.markdown).sections.map((section, n) => ({
      ...section,
      documentId: note.id,
      revision,
      id: `${note.id}:${revision}:${n}`
    }));
  });
}
export function localLexicalSearch(query, sections) {
  const terms = lexicalTerms(query);
  return sections
    .map((s) => {
      const words = new Set(s.text.toLowerCase().match(/[a-z0-9]+(?:-[a-z0-9]+)*/g));
      return {
        section_id: s.id,
        document_id: s.documentId,
        revision: s.revision,
        score: terms.filter((term) => words.has(term)).length
      };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.section_id.localeCompare(b.section_id))
    .slice(0, 5);
}
export function inspectQuality(cases, rankings, sections) {
  return cases.map((q) => {
    const hits = rankings[q.id].slice(0, 5);
    const sources = hits.map((hit) => {
      const s = sections.find((section) => section.id === hit.section_id && section.revision === hit.revision);
      if (!s) throw new Error('Citation revision unavailable');
      return {
        document: s.documentId,
        section: s.id,
        revision: s.revision,
        heading: s.headingPath,
        startLine: s.startLine,
        endLine: s.endLine,
        excerpt: s.text
      };
    });
    if (Buffer.byteLength(sources.map((s) => s.excerpt).join('')) > 6000)
      throw new Error('Context exceeds byte budget');
    return {
      ...q,
      lexicalQuery: lexicalQuery(q.query),
      outcome: hits.length ? 'review-needed' : 'no-support-found',
      sources
    };
  });
}
export function supportMetrics(rows) {
  return Object.fromEntries(
    ['development', 'holdout'].map((split) => {
      const samples = rows.filter((r) => r.split === split);
      const answerable = samples.filter((r) => r.support === 'candidate');
      const unsupported = samples.filter((r) => r.support !== 'candidate');
      return [
        split,
        {
          samples: samples.length,
          requiredPassages: samples.reduce((n, r) => n + r.required.length, 0),
          foundPassages: samples.reduce(
            (n, r) => n + r.required.filter((id) => r.sources.some((s) => s.document === id)).length,
            0
          ),
          unsupportedCases: unsupported.length,
          unsupportedAccepted: unsupported.filter((r) => r.outcome === 'candidate-evidence').length,
          automaticAcceptances: samples.filter((r) => r.outcome === 'candidate-evidence').length,
          falseAbstentions: answerable.filter((r) => r.outcome === 'no-support-found').length,
          answerableCases: answerable.length,
          reviewNeeded: samples.filter((r) => r.outcome === 'review-needed').length,
          irrelevantContext: samples.reduce(
            (n, r) => n + r.sources.filter((s) => !r.required.includes(s.document)).length,
            0
          ),
          returnedPassages: samples.reduce((n, r) => n + r.sources.length, 0)
        }
      ];
    })
  );
}
