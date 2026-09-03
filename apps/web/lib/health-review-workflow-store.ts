import { createClient } from '@supabase/supabase-js';
import type { ReviewOutcome } from './run-iron-regulation-review';

type HealthReviewRequest = {
  execution_token: string;
  id: string;
  material_change_version: number;
  owner_id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded';
};

type QueuedReviewExecution = {
  status: 'skipped' | 'succeeded' | 'superseded';
};

const workflowVersion = '1';

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`The server is missing ${name}.`);
  }

  return value;
}

function workflowClient() {
  return createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false }
    }
  );
}

export async function queueWeeklyIronRegulationReview(): Promise<void> {
  const { error } = await workflowClient().rpc('queue_iron_regulation_review', {
    review_owner_id: requiredEnvironment('HEALTH_RECORD_OWNER_ID'),
    review_trigger_kind: 'weekly'
  });

  if (error) {
    throw new Error('Unable to queue the weekly Health Review.');
  }
}

export async function queuedHealthReviewRequestIds(): Promise<string[]> {
  const { data, error } = await workflowClient().rpc('queued_health_review_request_ids');

  if (error) {
    throw new Error('Unable to retrieve queued Health Reviews.');
  }

  return ((data ?? []) as { id: string }[]).map((request) => request.id);
}

async function claimReviewRequest(requestId: string): Promise<HealthReviewRequest | null> {
  const { data, error: claimError } = await workflowClient().rpc('claim_health_review_request', {
    review_request_id: requestId
  });

  if (claimError) {
    throw new Error('Unable to claim the queued Health Review.');
  }

  const claimed = (data ?? []) as HealthReviewRequest[];
  return claimed[0] ?? null;
}

async function startRun(request: HealthReviewRequest): Promise<string> {
  const { data, error } = await workflowClient().rpc('begin_health_review_run', { review_request_id: request.id });

  if (error || typeof data !== 'string') {
    throw new Error('Unable to create the Health Review run record.');
  }

  return data;
}

async function writeTrace(
  reviewRunId: string,
  ownerId: string,
  status: 'started' | 'succeeded' | 'failed' | 'superseded',
  errorCategory?: 'retryable'
) {
  const { error } = await workflowClient().from('operational_traces').insert({
    event_name: 'iron-regulation-review',
    error_category: errorCategory,
    owner_id: ownerId,
    review_run_id: reviewRunId,
    status,
    workflow_version: workflowVersion
  });

  if (error) {
    throw new Error('Unable to write the safe Operational Trace.');
  }
}

async function captureEvaluationSnapshot(reviewRunId: string, ownerId: string, investigationId: string): Promise<void> {
  const { data: investigation, error: investigationError } = await workflowClient()
    .from('health_investigations')
    .select(
      'citation_references, input_fingerprint, panel_id, panel_version, personal_evidence_references, result_type, summary'
    )
    .eq('owner_id', ownerId)
    .eq('id', investigationId)
    .maybeSingle();

  if (investigationError) {
    throw new Error('Unable to capture the private evaluation snapshot.');
  }

  const inputSnapshot = investigation
    ? {
        inputFingerprint: investigation.input_fingerprint,
        panelId: investigation.panel_id,
        panelVersion: investigation.panel_version
      }
    : { panelId: 'iron-regulation', panelVersion: '1.1' };
  const outputSnapshot = investigation
    ? {
        citations: investigation.citation_references,
        resultType: investigation.result_type,
        summary: investigation.summary
      }
    : { resultType: 'not-applicable' };
  const evidenceReferences = investigation?.personal_evidence_references ?? [];
  const { error } = await workflowClient().from('private_evaluation_snapshots').upsert(
    {
      evidence_references: evidenceReferences,
      input_snapshot: inputSnapshot,
      output_snapshot: outputSnapshot,
      owner_id: ownerId,
      review_run_id: reviewRunId
    },
    { onConflict: 'review_run_id' }
  );

  if (error) {
    throw new Error('Unable to save the private evaluation snapshot.');
  }
}

export async function executeQueuedIronRegulationReview(
  requestId: string,
  runReview: (ownerId: string) => Promise<ReviewOutcome>
): Promise<QueuedReviewExecution> {
  const request = await claimReviewRequest(requestId);

  if (!request) {
    return { status: 'skipped' };
  }

  let reviewRunId: string | null = null;

  try {
    reviewRunId = await startRun(request);
    await writeTrace(reviewRunId, request.owner_id, 'started');
    const outcome = await runReview(request.owner_id);
    const { data: currentRequest, error: requestError } = await workflowClient()
      .from('health_review_requests')
      .select('material_change_version')
      .eq('id', request.id)
      .single();

    if (requestError || !currentRequest) {
      throw new Error('Unable to check Health Review freshness.');
    }

    const superseded =
      outcome.kind === 'superseded' || currentRequest.material_change_version !== request.material_change_version;
    const client = workflowClient();
    const { data: completed, error: completionError } = await client.rpc('complete_health_review_request', {
      expected_execution_token: request.execution_token,
      expected_material_change_version: currentRequest.material_change_version,
      review_request_id: request.id,
      review_state: superseded ? 'queued' : 'succeeded'
    });

    if (completionError || typeof completed !== 'boolean') {
      throw new Error('Unable to complete the Health Review request.');
    }

    const finalStatus = superseded || !completed ? 'superseded' : 'succeeded';
    const { error: runError } = await client
      .from('health_review_runs')
      .update({
        finished_at: new Date().toISOString(),
        result_type: outcome.kind,
        status: finalStatus
      })
      .eq('id', reviewRunId);

    if (runError) {
      throw new Error('Unable to complete the Health Review run record.');
    }

    if (finalStatus === 'succeeded' && outcome.kind === 'stored') {
      await captureEvaluationSnapshot(reviewRunId, request.owner_id, outcome.investigationId);
    }

    await writeTrace(reviewRunId, request.owner_id, finalStatus);
    return { status: finalStatus };
  } catch (error) {
    const client = workflowClient();
    const { data: released, error: releaseError } = await client
      .from('health_review_requests')
      .update({ lease_expires_at: null, state: 'queued' })
      .eq('id', request.id)
      .eq('execution_token', request.execution_token)
      .eq('state', 'running')
      .select('id')
      .maybeSingle();

    if (releaseError) {
      throw new Error('Unable to release the failed Health Review request.');
    }

    if (released && reviewRunId) {
      await client.from('health_review_runs').update({ status: 'failed' }).eq('id', reviewRunId);
      await writeTrace(reviewRunId, request.owner_id, 'failed', 'retryable').catch(() => undefined);
    }

    if (!released) {
      const { data: currentRequest, error: currentRequestError } = await client
        .from('health_review_requests')
        .select('state')
        .eq('id', request.id)
        .maybeSingle();

      if (currentRequestError) {
        throw new Error('Unable to check the terminal Health Review state.');
      }

      return { status: currentRequest?.state === 'succeeded' ? 'succeeded' : 'superseded' };
    }

    throw error;
  }
}
