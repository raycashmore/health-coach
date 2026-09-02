import { createClient } from '@supabase/supabase-js';
import type { ReviewOutcome } from './run-iron-regulation-review';

type HealthReviewRequest = {
  id: string;
  owner_id: string;
  state: 'queued' | 'running' | 'succeeded' | 'failed' | 'superseded';
  started_at: string | null;
  updated_at: string;
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
  const { data, error } = await workflowClient()
    .from('health_review_requests')
    .select('id')
    .or(`state.eq.queued,and(state.eq.running,started_at.lt.${new Date(Date.now() - 15 * 60 * 1000).toISOString()})`)
    .order('requested_at')
    .limit(20);

  if (error) {
    throw new Error('Unable to retrieve queued Health Reviews.');
  }

  return (data ?? []).map((request) => request.id as string);
}

async function claimReviewRequest(requestId: string): Promise<HealthReviewRequest | null> {
  const client = workflowClient();
  const { data: claimed, error: claimError } = await client
    .from('health_review_requests')
    .update({ started_at: new Date().toISOString(), state: 'running' })
    .eq('id', requestId)
    .eq('state', 'queued')
    .select('id, owner_id, started_at, state, updated_at')
    .maybeSingle();

  if (claimError) {
    throw new Error('Unable to claim the queued Health Review.');
  }

  if (claimed) {
    return claimed as HealthReviewRequest;
  }

  const { data: running, error: runningError } = await client
    .from('health_review_requests')
    .update({ started_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('state', 'running')
    .select('id, owner_id, started_at, state, updated_at')
    .maybeSingle();

  if (runningError) {
    throw new Error('Unable to retrieve the running Health Review.');
  }

  return running ? (running as HealthReviewRequest) : null;
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
): Promise<void> {
  const request = await claimReviewRequest(requestId);

  if (!request || !request.started_at) {
    return;
  }

  let reviewRunId: string | null = null;

  try {
    reviewRunId = await startRun(request);
    await writeTrace(reviewRunId, request.owner_id, 'started');
    const outcome = await runReview(request.owner_id);
    const { data: currentRequest, error: requestError } = await workflowClient()
      .from('health_review_requests')
      .select('updated_at')
      .eq('id', request.id)
      .single();

    if (requestError || !currentRequest) {
      throw new Error('Unable to check Health Review freshness.');
    }

    const superseded = outcome.kind === 'superseded' || currentRequest.updated_at > request.started_at;
    const client = workflowClient();
    const { data: completed, error: completionError } = await client.rpc('complete_health_review_request', {
      expected_updated_at: currentRequest.updated_at,
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
  } catch (error) {
    await workflowClient().from('health_review_requests').update({ state: 'queued' }).eq('id', request.id);
    if (reviewRunId) {
      await workflowClient().from('health_review_runs').update({ status: 'failed' }).eq('id', reviewRunId);
      await writeTrace(reviewRunId, request.owner_id, 'failed', 'retryable').catch(() => undefined);
    }
    throw error;
  }
}
