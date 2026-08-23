import { describe, expect, it } from 'vitest';

import { parseAncestryExportRow } from './ancestry-export.js';

describe('parseAncestryExportRow', () => {
  it('normalizes a called Ancestry variant', () => {
    expect(parseAncestryExportRow('rs123\t1\t100\ta\tg', 3)).toEqual({
      kind: 'variant',
      variant: {
        rsid: 'rs123',
        chromosome: '1',
        position: 100,
        genotype: 'AG'
      }
    });
  });

  it('skips metadata, headers, and uncalled variants', () => {
    expect(parseAncestryExportRow('# generated export', 1)).toEqual({ kind: 'skip', reason: 'comment' });
    expect(parseAncestryExportRow('rsid\tchromosome\tposition\tallele1\tallele2', 2)).toEqual({
      kind: 'skip',
      reason: 'header'
    });
    expect(parseAncestryExportRow('rs123\t1\t100\t0\t0', 3)).toEqual({ kind: 'skip', reason: 'no-call' });
  });

  it('rejects malformed source rows without exposing their content', () => {
    expect(() => parseAncestryExportRow('not a tabular row', 12)).toThrow('row 12');
  });
});
