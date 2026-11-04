export type PreparedSection = {
  headingPath: string[];
  startLine: number;
  endLine: number;
  text: string;
};
export function sectionMarkdown(text: string, maxBytes?: number): { sections: PreparedSection[]; warnings: string[] };
export type PreparedMarkdown = {
  schemaVersion: number;
  maxBytes: number;
  readyForIndexing: boolean;
  documents: {
    id: string;
    relativePath: string;
    contentHash: string;
    revision: string;
    warnings: string[];
    sections: (PreparedSection & { id: string; documentId: string; revision: string })[];
  }[];
  changes: { added: number; updated: number; renamed: number; deletedIds: string[] };
};
export function prepareMarkdown(options: {
  root: string;
  files: string[];
  previous?: PreparedMarkdown;
  maxBytes?: number;
}): Promise<PreparedMarkdown>;
