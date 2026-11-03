import { createHash } from 'node:crypto';
import { notes } from '../retrieval/synthetic-corpus.mjs';
import { sectionMarkdown } from '../retrieval/prepare-markdown.mjs';

// Separate extension: the frozen retrieval benchmark stays unchanged.
const referenceNote = {
  id: 'packing',
  markdown:
    '# Parcel packing\n\nFor LP-42 ribbon type and spare location, see [Printer supply](printer.md#printer-supply).\n'
};
export const spikeSections = [...notes, referenceNote].flatMap((note) => {
  const revision = createHash('sha256').update(note.markdown).digest('hex');
  return sectionMarkdown(note.markdown).sections.map((section, ordinal) => ({
    ...section,
    documentId: note.id,
    revision,
    id: `${note.id}:${revision}:${ordinal}`
  }));
});

// Freeze before live execution. Demonstrations, not independent held-out evidence.
export const demoCases = [
  {
    id: 'reference',
    query: 'For parcel packing, which ribbon fits LP-42 and where are the spares?',
    expected: 'R7; drawer seven beside the packing bench',
    sources: ['packing', 'printer'],
    support: 'answerable'
  },
  {
    id: 'paraphrase',
    query: 'Where can I concentrate without people talking?',
    expected: 'Upstairs blue room',
    sources: ['quiet'],
    support: 'answerable'
  },
  {
    id: 'partial',
    query: 'Which ribbon fits LP-42 and what does it cost?',
    expected: 'R7; price missing',
    sources: ['printer'],
    support: 'partial'
  },
  {
    id: 'neighbor',
    query: 'What is the steel charging cabinet access code?',
    expected: 'Access code missing; storage instructions do not establish a code',
    sources: [],
    support: 'missing'
  },
  {
    id: 'missing',
    query: 'Which bus route stops outside the workshop?',
    expected: 'Bus route missing',
    sources: [],
    support: 'missing'
  }
];

export const manualRubric = [
  'requested facts supported/missing',
  'invented claims',
  'revision and line citation resolution',
  'unnecessary calls',
  'useful follow-up retrieval',
  'stopping reason',
  'latency',
  'input/output tokens and cost'
];
