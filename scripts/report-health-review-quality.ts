import { access, constants } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

type ReviewRun = {
  attempt_count: number;
  status: 'failed' | 'running' | 'succeeded' | 'superseded';
};

type Feedback = {
  judgement: 'concerning' | 'not-useful' | 'useful';
};

function requiredEnvironment(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} must be configured to create the local quality report.`);
  }

  return value;
}

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce<Record<T, number>>(
    (counts, value) => {
      counts[value] = (counts[value] ?? 0) + 1;
      return counts;
    },
    {} as Record<T, number>
  );
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
  const ownerId = requiredEnvironment('HEALTH_RECORD_OWNER_ID');
  const [
    { data: runs, error: runsError },
    { data: feedback, error: feedbackError },
    { count: snapshotCount, error: snapshotsError }
  ] = await Promise.all([
    client.from('health_review_runs').select('attempt_count, status').eq('owner_id', ownerId),
    client.from('health_investigation_feedback').select('judgement').eq('owner_id', ownerId),
    client.from('private_evaluation_snapshots').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId)
  ]);

  if (runsError || feedbackError || snapshotsError) {
    throw new Error('Unable to create the local Health Review quality report.');
  }

  const typedRuns = (runs ?? []) as ReviewRun[];
  const typedFeedback = (feedback ?? []) as Feedback[];
  const retriedRuns = typedRuns.filter((run) => run.attempt_count > 1).length;
  const report = {
    evaluationSnapshotCount: snapshotCount ?? 0,
    feedbackByJudgement: countBy(typedFeedback.map((item) => item.judgement)),
    retriedRunCount: retriedRuns,
    runCount: typedRuns.length,
    runsByStatus: countBy(typedRuns.map((run) => run.status))
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'The Health Review quality report failed.');
  process.exitCode = 1;
});
