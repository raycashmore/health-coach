import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import {
  buildWearableReview,
  validateWearableExplanation,
  wearablePromptVersion,
  wearableReviewRequestSchema
} from '@health-coach/health-core/wearable-review';
import { explainWearableReview } from '../../../lib/explain-wearable-review';

export const runtime = 'nodejs';
export const maxDuration = 60;

function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.length;
    if (bytes > 32_768) {
      await reader.cancel();
      throw new Error('Body too large');
    }
    text += decoder.decode(part.value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const configuredOwner = process.env.HEALTH_RECORD_OWNER_ID;
  if (!url || !serviceKey || !configuredOwner)
    return reply({ error: 'The private review service is not configured.' }, 503);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return reply({ error: 'Sign in to request a review.' }, 401);
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let identity;
  try {
    identity = await client.auth.getUser(token);
  } catch {
    return reply({ error: 'Owner sign-in could not be verified. Try again.' }, 503);
  }
  if (identity.error || identity.data.user?.id !== configuredOwner)
    return reply({ error: 'Owner access required.' }, 401);
  let snapshot;
  let question;
  let analysis;
  try {
    const body = wearableReviewRequestSchema.parse(await readBoundedJson(request));
    snapshot = body.snapshot;
    question = body.question;
    analysis = buildWearableReview(snapshot);
  } catch {
    return reply({ error: 'Read 21 completed days again before requesting a review.' }, 400);
  }
  if (analysis.status === 'insufficient-data') return reply({ kind: 'baseline', analysis });
  const model = process.env.WEARABLE_REVIEW_MODEL;
  if (process.env.WEARABLE_AI_ENABLED !== 'true' || !model || !process.env.AI_GATEWAY_API_KEY) {
    return reply({
      kind: 'baseline',
      analysis,
      message: 'AI explanations are not enabled. The calculated comparison is available.'
    });
  }
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        days: snapshot.days,
        timeZone: snapshot.timeZone,
        completedBefore: snapshot.completedBefore,
        calculation: analysis.calculationVersion,
        prompt: wearablePromptVersion,
        model,
        question
      })
    )
    .digest('hex');
  // A reservation key identifies this caller without sending health content to logs.
  const reservationKey = randomUUID();
  const reservation = await client.rpc('reserve_wearable_review', {
    review_owner_id: configuredOwner,
    fingerprint,
    configured_model: model,
    version: wearablePromptVersion,
    snapshot: { snapshot, analysis, question, reservationKey }
  });
  if (reservation.error)
    return reply(
      { error: 'Review storage is unavailable or the five-review limit for 24 hours was reached.' },
      reservation.error.code === 'P0001' ? 429 : 503
    );
  const reviewId = reservation.data as string;
  const stored = await client
    .from('wearable_reviews')
    .select('status, input_snapshot, output_snapshot')
    .eq('id', reviewId)
    .single();
  if (stored.error || !stored.data) return reply({ error: 'The private review could not be loaded.' }, 503);
  if (stored.data.status === 'succeeded') {
    try {
      const explanation = validateWearableExplanation(stored.data.output_snapshot, analysis);
      return reply({ kind: 'ai', analysis, reviewId, explanation });
    } catch {
      return reply({ error: 'The stored explanation could not be verified.' }, 502);
    }
  }
  if (stored.data.input_snapshot?.reservationKey !== reservationKey)
    return reply({ error: 'This review is already running. Try again shortly.' }, 409);
  try {
    const result = await explainWearableReview(analysis, model, question);
    const saved = await client
      .from('wearable_reviews')
      .update({
        status: 'succeeded',
        output_snapshot: result.explanation,
        elapsed_ms: result.elapsedMs,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens
      })
      .eq('id', reviewId)
      .eq('status', 'running');
    if (saved.error) throw new Error('Storage unavailable');
    return reply({ kind: 'ai', analysis, reviewId, explanation: result.explanation });
  } catch (error) {
    await client.from('wearable_reviews').update({ status: 'failed' }).eq('id', reviewId).eq('status', 'running');
    const zeroRetentionUnavailable =
      error instanceof Error &&
      error.message.includes('Zero Data Retention') &&
      error.message.includes('only available for Pro and Enterprise');
    console.warn('wearable-review-failed', {
      code: zeroRetentionUnavailable ? 'gateway-zero-retention-plan' : 'generation-or-storage'
    });
    if (zeroRetentionUnavailable) {
      return reply(
        {
          error:
            'Your Gateway plan does not support the required zero-retention setting. Review the server data-handling configuration before retrying.'
        },
        503
      );
    }
    return reply(
      { error: 'The explanation could not be verified or saved. The calculated comparison remains available.' },
      502
    );
  }
}
