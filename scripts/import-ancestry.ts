import { createReadStream, existsSync } from 'node:fs';
import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import process from 'node:process';

import { genomeBuildSchema } from '@health-coach/health-core';
import { parseAncestryExportRow } from '@health-coach/health-core/ancestry-export';
import { createClient } from '@supabase/supabase-js';

import { runIronRegulationReview } from '../apps/web/lib/run-iron-regulation-review';

const ancestrySourcePath = resolve(process.cwd(), 'sources/AncestryDNA.txt');
const batchSize = 500;

type ImportTarget = 'local' | 'production';

type VariantInsert = {
  chromosome: string;
  genome_build: 'GRCh37' | 'GRCh38';
  genotype: string;
  owner_id: string;
  position: number;
  rsid: string;
  source_id: string;
};

function getImportTarget(): ImportTarget {
  const target = process.argv.at(2);
  const value = process.argv.at(3);

  if (target === '--target' && (value === 'local' || value === 'production')) {
    return value;
  }

  throw new Error('Usage: tsx scripts/import-ancestry.ts --target local|production');
}

async function loadEnvironment(target: ImportTarget): Promise<void> {
  const environmentFile = resolve(process.cwd(), target === 'local' ? 'apps/web/.env.local' : '.env.local');
  await access(environmentFile, constants.R_OK);
  process.loadEnvFile(environmentFile);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be configured in the selected local environment file.`);
  }

  return value;
}

function requiredAncestryGenomeBuild(): 'GRCh37' | 'GRCh38' {
  const parsed = genomeBuildSchema.safeParse(process.env.ANCESTRY_GENOME_BUILD);

  if (!parsed.success) {
    throw new Error('ANCESTRY_GENOME_BUILD must be set to GRCh37 or GRCh38 after validating the export metadata.');
  }

  return parsed.data;
}

async function flushVariants(variants: VariantInsert[], client: ReturnType<typeof createClient>): Promise<void> {
  if (variants.length === 0) {
    return;
  }

  const { error } = await client.from('genetic_variants').upsert(variants, {
    onConflict: 'source_id,rsid'
  });

  if (error) {
    throw new Error(`Unable to save normalized genetic variants: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const target = getImportTarget();
  await loadEnvironment(target);

  if (!existsSync(ancestrySourcePath)) {
    throw new Error('The ignored AncestryDNA source file is not available locally.');
  }

  const supabaseUrl = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const ownerId = requiredEnvironment('HEALTH_RECORD_OWNER_ID');
  const genomeBuild = requiredAncestryGenomeBuild();
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const importedAt = new Date().toISOString();
  const { data: source, error: sourceError } = await client
    .from('health_sources')
    .upsert(
      {
        owner_id: ownerId,
        provider: 'AncestryDNA',
        source_identifier: 'ancestrydna-export',
        kind: 'genetic-export',
        imported_at: importedAt,
        verification_state: 'parsed'
      },
      { onConflict: 'owner_id,provider,source_identifier' }
    )
    .select('id')
    .single();

  if (sourceError || !source) {
    throw new Error(`Unable to create source metadata: ${sourceError?.message ?? 'no source returned'}`);
  }

  const { error: coverageError } = await client.from('source_coverage').upsert(
    {
      owner_id: ownerId,
      source_id: source.id,
      data_types: ['genetic-variant'],
      synchronized_at: importedAt
    },
    { onConflict: 'source_id' }
  );

  if (coverageError) {
    throw new Error(`Unable to save source coverage: ${coverageError.message}`);
  }

  const variants: VariantInsert[] = [];
  let importedVariantCount = 0;
  let noCallCount = 0;
  let lineNumber = 0;
  const reader = createInterface({ input: createReadStream(ancestrySourcePath), crlfDelay: Infinity });

  for await (const line of reader) {
    lineNumber += 1;
    const result = parseAncestryExportRow(line, lineNumber);

    if (result.kind === 'skip') {
      if (result.reason === 'no-call') {
        noCallCount += 1;
      }
      continue;
    }

    variants.push({
      ...result.variant,
      genome_build: genomeBuild,
      owner_id: ownerId,
      source_id: source.id
    });

    if (variants.length === batchSize) {
      await flushVariants(variants, client);
      importedVariantCount += variants.length;
      variants.length = 0;
    }
  }

  await flushVariants(variants, client);
  importedVariantCount += variants.length;

  const reviewOutcome = await runIronRegulationReview();
  console.log(`Imported ${importedVariantCount} normalized Ancestry variants; skipped ${noCallCount} no-call rows.`);
  console.log(
    reviewOutcome === 'stored'
      ? 'Stored the bounded iron-regulation Health Review.'
      : 'No bounded iron-regulation Health Review was applicable to this import.'
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'The import failed.';
  console.error(message);
  process.exitCode = 1;
});
