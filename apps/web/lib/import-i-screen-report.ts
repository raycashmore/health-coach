import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { IScreenLabResult } from '@health-coach/health-core/i-screen-report';

type IScreenImportReceipt = {
  importedObservationCount: number;
  periodEnd: string;
  periodStart: string;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`The server is missing ${name}.`);
  }

  return value;
}

export async function importIScreenReport(results: IScreenLabResult[]): Promise<IScreenImportReceipt> {
  const supabaseUrl = requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const ownerId = requiredEnvironment('HEALTH_RECORD_OWNER_ID');
  const importedAt = new Date().toISOString();
  const periodStart = results.reduce(
    (earliest, result) => (result.recordedAt < earliest ? result.recordedAt : earliest),
    results[0]!.recordedAt
  );
  const periodEnd = results.reduce(
    (latest, result) => (result.recordedAt > latest ? result.recordedAt : latest),
    results[0]!.recordedAt
  );
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data: source, error: sourceError } = await client
    .from('health_sources')
    .upsert(
      {
        imported_at: importedAt,
        kind: 'provider-report',
        observed_at: periodStart,
        owner_id: ownerId,
        provider: 'I-Screen',
        source_identifier: `i-screen-laboratory-report-${periodStart.slice(0, 10)}`,
        verification_state: 'parsed'
      },
      { onConflict: 'owner_id,provider,source_identifier' }
    )
    .select('id')
    .single();

  if (sourceError || !source) {
    throw new Error('Unable to create the I-Screen source metadata.');
  }

  const { error: coverageError } = await client.from('source_coverage').upsert(
    {
      data_types: ['lab-result'],
      owner_id: ownerId,
      period_end: periodEnd,
      period_start: periodStart,
      source_id: source.id,
      synchronized_at: importedAt
    },
    { onConflict: 'source_id' }
  );

  if (coverageError) {
    throw new Error('Unable to save I-Screen source coverage.');
  }

  const { error: observationError } = await client.from('health_observations').upsert(
    results.map((result) => ({
      kind: 'lab-result',
      numeric_value: result.value,
      owner_id: ownerId,
      recorded_at: result.recordedAt,
      reference_range: result.referenceRange ?? null,
      source_id: source.id,
      test_name: result.testName,
      unit: result.unit
    })),
    { onConflict: 'source_id,test_name,recorded_at' }
  );

  if (observationError) {
    throw new Error('Unable to save normalized I-Screen observations.');
  }

  return {
    importedObservationCount: results.length,
    periodEnd,
    periodStart
  };
}
