import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

import { executeQueuedIronRegulationReview } from '../apps/web/lib/health-review-workflow-store';
import { runIronRegulationReview } from '../apps/web/lib/run-iron-regulation-review';

type Investigation = {
  id: string;
  input_fingerprint: string;
  personal_evidence_references: string[];
  result_type: string;
  superseded_at: string | null;
};

type ReviewRequest = {
  id: string;
  state: string;
  trigger_kind: string;
};

type ReviewRun = {
  attempt_count: number;
  status: string;
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be configured after starting local Supabase.`);
  }

  return value;
}

async function investigationsForOwner(
  client: ReturnType<typeof createClient>,
  ownerId: string
): Promise<Investigation[]> {
  const { data, error } = await client
    .from('health_investigations')
    .select('id, input_fingerprint, personal_evidence_references, result_type, superseded_at')
    .eq('owner_id', ownerId)
    .eq('panel_id', 'iron-regulation')
    .eq('panel_version', '1.1')
    .order('created_at');

  if (error) {
    throw new Error(`Unable to retrieve persisted Health Investigations: ${error.message}`);
  }

  return (data ?? []) as Investigation[];
}

async function reviewRequestsForOwner(
  client: ReturnType<typeof createClient>,
  ownerId: string
): Promise<ReviewRequest[]> {
  const { data, error } = await client
    .from('health_review_requests')
    .select('id, state, trigger_kind')
    .eq('owner_id', ownerId)
    .order('created_at');

  if (error) {
    throw new Error(`Unable to retrieve queued Health Reviews: ${error.message}`);
  }

  return (data ?? []) as ReviewRequest[];
}

async function reviewRunsForOwner(client: ReturnType<typeof createClient>, ownerId: string): Promise<ReviewRun[]> {
  const { data, error } = await client
    .from('health_review_runs')
    .select('attempt_count, status')
    .eq('owner_id', ownerId)
    .order('created_at');

  if (error) {
    throw new Error(`Unable to retrieve Health Review runs: ${error.message}`);
  }

  return (data ?? []) as ReviewRun[];
}

async function insertAncestrySource(
  client: ReturnType<typeof createClient>,
  ownerId: string,
  sourceIdentifier: string
): Promise<string> {
  const { data, error } = await client
    .from('health_sources')
    .insert({
      owner_id: ownerId,
      provider: 'AncestryDNA',
      source_identifier: sourceIdentifier,
      kind: 'genetic-export',
      verification_state: 'parsed'
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create test source metadata: ${error?.message ?? 'no source returned'}`);
  }

  return data.id as string;
}

async function insertVariant(
  client: ReturnType<typeof createClient>,
  ownerId: string,
  sourceId: string,
  genotype: string
): Promise<void> {
  const { error } = await client.from('genetic_variants').upsert(
    {
      owner_id: ownerId,
      source_id: sourceId,
      rsid: 'rs1800562',
      chromosome: '6',
      position: 1,
      genotype,
      genome_build: 'GRCh37'
    },
    { onConflict: 'source_id,rsid' }
  );

  if (error) {
    throw new Error(`Unable to save test genetic variant: ${error.message}`);
  }
}

async function insertLabSource(
  client: ReturnType<typeof createClient>,
  ownerId: string,
  sourceIdentifier: string
): Promise<string> {
  const { data, error } = await client
    .from('health_sources')
    .insert({
      owner_id: ownerId,
      provider: 'I-Screen',
      source_identifier: sourceIdentifier,
      kind: 'provider-report',
      verification_state: 'parsed'
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`Unable to create test laboratory source metadata: ${error?.message ?? 'no source returned'}`);
  }

  return data.id as string;
}

async function insertFerritinResult(
  client: ReturnType<typeof createClient>,
  ownerId: string,
  sourceId: string,
  recordedAt: string,
  value: number
): Promise<void> {
  const { error } = await client.from('lab_results').insert({
    numeric_value: value,
    owner_id: ownerId,
    recorded_at: recordedAt,
    reference_range: '20 - 300',
    source_id: sourceId,
    test_name: 'Ferritin',
    unit: 'ug/L'
  });

  if (error) {
    throw new Error(`Unable to save test ferritin result: ${error.message}`);
  }
}

async function main(): Promise<void> {
  const environmentFile = resolve(process.cwd(), 'apps/web/.env.local');
  await access(environmentFile, constants.R_OK);
  process.loadEnvFile(environmentFile);

  const client = createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const originalOwnerId = process.env.HEALTH_RECORD_OWNER_ID;
  const testRunId = randomUUID();
  const { data: owner, error: ownerError } = await client.auth.admin.createUser({
    email: `integration-${testRunId}@local.invalid`,
    password: randomUUID(),
    email_confirm: true
  });

  if (ownerError || !owner.user) {
    throw new Error(`Unable to create the integration-test owner: ${ownerError?.message ?? 'no owner returned'}`);
  }

  const ownerId = owner.user.id;
  process.env.HEALTH_RECORD_OWNER_ID = ownerId;

  try {
    const firstSourceId = await insertAncestrySource(client, ownerId, `integration-source-${testRunId}-one`);
    await insertVariant(client, ownerId, firstSourceId, 'AA');

    const queuedAfterFirstVariant = await reviewRequestsForOwner(client, ownerId);
    assert.equal(queuedAfterFirstVariant.length, 1);
    assert.equal(queuedAfterFirstVariant[0]?.state, 'queued');
    assert.equal(queuedAfterFirstVariant[0]?.trigger_kind, 'data-change');

    assert.equal((await runIronRegulationReview()).kind, 'stored');
    const firstStored = await investigationsForOwner(client, ownerId);
    assert.equal(firstStored.length, 1);
    assert.equal(firstStored[0]?.result_type, 'data-quality-follow-up');
    assert.equal(firstStored[0]?.superseded_at, null);
    assert.deepEqual(firstStored[0]?.personal_evidence_references, [firstSourceId]);

    assert.equal((await runIronRegulationReview()).kind, 'stored');
    const rerun = await investigationsForOwner(client, ownerId);
    assert.equal(rerun.length, 1);
    assert.equal(rerun[0]?.id, firstStored[0]?.id);
    assert.equal(rerun[0]?.input_fingerprint, firstStored[0]?.input_fingerprint);
    assert.equal(rerun[0]?.superseded_at, null);

    await insertVariant(client, ownerId, firstSourceId, 'CC');
    assert.equal((await runIronRegulationReview()).kind, 'not-applicable');
    const inapplicable = await investigationsForOwner(client, ownerId);
    assert.equal(inapplicable.length, 1);
    assert.notEqual(inapplicable[0]?.superseded_at, null);

    await insertVariant(client, ownerId, firstSourceId, 'AA');
    assert.equal((await runIronRegulationReview()).kind, 'stored');
    const restored = await investigationsForOwner(client, ownerId);
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.id, firstStored[0]?.id);
    assert.equal(restored[0]?.superseded_at, null);

    const conflictingSourceId = await insertAncestrySource(client, ownerId, `integration-source-${testRunId}-two`);
    await insertVariant(client, ownerId, conflictingSourceId, 'CC');
    const queuedAfterSecondVariant = await reviewRequestsForOwner(client, ownerId);

    assert.equal(queuedAfterSecondVariant.length, 1);
    assert.equal(queuedAfterSecondVariant[0]?.id, queuedAfterFirstVariant[0]?.id);
    assert.equal((await runIronRegulationReview()).kind, 'stored');
    const conflicting = await investigationsForOwner(client, ownerId);
    const activeInvestigations = conflicting.filter((investigation) => investigation.superseded_at === null);

    assert.equal(conflicting.length, 2);
    assert.equal(activeInvestigations.length, 1);
    assert.equal(activeInvestigations[0]?.result_type, 'data-quality-follow-up');
    assert.deepEqual(
      activeInvestigations[0]?.personal_evidence_references.sort(),
      [firstSourceId, conflictingSourceId].sort()
    );
    assert.notEqual(conflicting.find((investigation) => investigation.id === firstStored[0]?.id)?.superseded_at, null);

    const { error: removeConflictingVariantError } = await client
      .from('genetic_variants')
      .delete()
      .eq('source_id', conflictingSourceId)
      .eq('owner_id', ownerId);

    if (removeConflictingVariantError) {
      throw new Error(`Unable to remove the conflicting test variant: ${removeConflictingVariantError.message}`);
    }

    await insertVariant(client, ownerId, firstSourceId, 'AG');
    const olderLabSourceId = await insertLabSource(client, ownerId, `integration-laboratory-old-${testRunId}`);
    await insertFerritinResult(client, ownerId, olderLabSourceId, '2025-01-01T00:00:00.000Z', 299);
    const labSourceId = await insertLabSource(client, ownerId, `integration-laboratory-current-${testRunId}`);
    await insertFerritinResult(client, ownerId, labSourceId, '2026-01-01T00:00:00.000Z', 301);

    assert.equal((await runIronRegulationReview()).kind, 'stored');
    const labLedReview = await investigationsForOwner(client, ownerId);
    const activeLabLedReview = labLedReview.filter((investigation) => investigation.superseded_at === null);

    assert.equal(activeLabLedReview.length, 1);
    assert.equal(activeLabLedReview[0]?.result_type, 'clinician-review-prompt');
    assert.deepEqual(activeLabLedReview[0]?.personal_evidence_references.sort(), [firstSourceId, labSourceId].sort());

    const queuedRequest = (await reviewRequestsForOwner(client, ownerId)).find((request) => request.state === 'queued');
    assert.ok(queuedRequest);
    await executeQueuedIronRegulationReview(queuedRequest.id, runIronRegulationReview);

    const completedRequests = await reviewRequestsForOwner(client, ownerId);
    assert.equal(completedRequests.find((request) => request.id === queuedRequest.id)?.state, 'succeeded');
    assert.deepEqual(await reviewRunsForOwner(client, ownerId), [{ attempt_count: 1, status: 'succeeded' }]);

    const { count: traceCount, error: traceError } = await client
      .from('operational_traces')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId);
    const { count: snapshotCount, error: snapshotError } = await client
      .from('private_evaluation_snapshots')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ownerId);

    if (traceError || snapshotError) {
      throw new Error('Unable to verify private Health Review records.');
    }

    assert.equal(traceCount, 2);
    assert.equal(snapshotCount, 1);
    await executeQueuedIronRegulationReview(queuedRequest.id, runIronRegulationReview);
    assert.deepEqual(await reviewRunsForOwner(client, ownerId), [{ attempt_count: 1, status: 'succeeded' }]);
  } finally {
    if (originalOwnerId) {
      process.env.HEALTH_RECORD_OWNER_ID = originalOwnerId;
    } else {
      delete process.env.HEALTH_RECORD_OWNER_ID;
    }

    const { error } = await client.auth.admin.deleteUser(ownerId);

    if (error) {
      throw new Error(`Unable to remove the integration-test owner: ${error.message}`);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'The Health Review lifecycle integration check failed.';
  console.error(message);
  process.exitCode = 1;
});
