import { z } from 'zod';

const ancestryColumns = ['rsid', 'chromosome', 'position', 'allele1', 'allele2'] as const;

const ancestryExportRowSchema = z.object({
  rsid: z.string().regex(/^rs\d+$/i),
  chromosome: z.string().regex(/^[A-Z0-9]+$/i),
  position: z.coerce.number().int().positive(),
  allele1: z.string().regex(/^[A-Z0-9-]$/i),
  allele2: z.string().regex(/^[A-Z0-9-]$/i)
});

export type AncestryVariant = {
  rsid: string;
  chromosome: string;
  position: number;
  genotype: string;
};

export type AncestryExportRowResult =
  { kind: 'variant'; variant: AncestryVariant } | { kind: 'skip'; reason: 'comment' | 'header' | 'no-call' };

export function parseAncestryExportRow(line: string, lineNumber: number): AncestryExportRowResult {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
    return { kind: 'skip', reason: 'comment' };
  }

  const columns = trimmedLine.split('\t');

  if (columns.length !== ancestryColumns.length) {
    throw new Error(`Ancestry export row ${lineNumber} must contain ${ancestryColumns.length} tab-separated columns.`);
  }

  if (columns.every((column, index) => column.toLowerCase() === ancestryColumns[index])) {
    return { kind: 'skip', reason: 'header' };
  }

  const parsedRow = ancestryExportRowSchema.safeParse({
    rsid: columns[0],
    chromosome: columns[1],
    position: columns[2],
    allele1: columns[3],
    allele2: columns[4]
  });

  if (!parsedRow.success) {
    throw new Error(`Ancestry export row ${lineNumber} is invalid.`);
  }

  const { allele1, allele2, ...location } = parsedRow.data;
  const genotype = `${allele1}${allele2}`.toUpperCase();

  if (genotype === '00' || genotype === '--') {
    return { kind: 'skip', reason: 'no-call' };
  }

  return {
    kind: 'variant',
    variant: {
      ...location,
      rsid: location.rsid.toLowerCase(),
      chromosome: location.chromosome.toUpperCase(),
      genotype
    }
  };
}
