import {
  toHealthInvestigationSummary,
  type HealthInvestigationSummary
} from '@health-coach/health-core/iron-regulation-panel';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from './action-button';
import { beginRefresh, failRefresh } from './health-investigation-refresh-state';
import { HealthRecordEditor } from './health-record-editor';
import { HealthFollowUpSection } from './health-follow-up';
import { supabase } from './supabase-client';
import { RatingButtons } from './rating-buttons';
import type { RatingJudgement } from './rating-buttons';
import { ScreenLead } from './screen-lead';
import { SectionHeading } from './section-heading';
import { colors, layout, typography } from './theme';

type ScreenState =
  | { kind: 'loading' }
  | {
      kind: 'ready';
      evidenceSources: EvidenceSource[];
      feedbackJudgement: RatingJudgement | null;
      investigation: HealthInvestigationSummary | null;
      isRefreshing: boolean;
      ownerId: string;
      reviewWorkState: 'queued' | 'running' | null;
      refreshError: string | null;
      sourceCount: number;
    }
  | { kind: 'error'; message: string };

type EvidenceSource = {
  id: string;
  importedAt: string;
  provider: string;
  verificationState: string;
};

export function HealthInvestigationScreen({ ownerId }: { ownerId: string }) {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  useEffect(() => {
    void loadReview(ownerId);
  }, [ownerId]);

  async function refreshReview(): Promise<void> {
    if (state.kind !== 'ready') {
      return;
    }

    setState(beginRefresh(state));
    await loadReview(state.ownerId, true);
  }

  async function loadReview(ownerId: string, isRefresh = false): Promise<void> {
    if (!supabase) {
      return;
    }

    try {
      const [
        { data: investigation, error: investigationError },
        { count: sourceCount, error: sourcesError },
        { data: reviewWork, error: reviewWorkError }
      ] = await Promise.all([
        supabase
          .from('health_investigations')
          .select(
            'citation_references, created_at, id, panel_id, panel_version, personal_evidence_references, result_type, summary'
          )
          .eq('owner_id', ownerId)
          .is('superseded_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('health_sources').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId),
        supabase
          .from('health_review_requests')
          .select('state')
          .eq('owner_id', ownerId)
          .in('state', ['queued', 'running'])
          .order('requested_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      if (investigationError || sourcesError || reviewWorkError) {
        showLoadError(isRefresh, 'Your Health Investigation could not be loaded.');
        return;
      }

      const review = investigation ? toHealthInvestigationSummary(investigation) : null;
      const [{ data: evidenceSources, error: evidenceSourcesError }, { data: feedback, error: feedbackError }] = review
        ? await Promise.all([
            supabase
              .from('health_sources')
              .select('id, imported_at, provider, verification_state')
              .eq('owner_id', ownerId)
              .in('id', review.personalEvidenceReferenceIds),
            supabase
              .from('health_investigation_feedback')
              .select('judgement')
              .eq('investigation_id', review.id)
              .eq('owner_id', ownerId)
              .maybeSingle()
          ])
        : [
            { data: [], error: null },
            { data: null, error: null }
          ];

      if (evidenceSourcesError || feedbackError) {
        showLoadError(isRefresh, 'Your Health Investigation evidence could not be loaded.');
        return;
      }

      setState({
        kind: 'ready',
        evidenceSources: (evidenceSources ?? []).map((source) => ({
          id: source.id,
          importedAt: source.imported_at,
          provider: source.provider,
          verificationState: source.verification_state
        })),
        feedbackJudgement:
          feedback?.judgement === 'useful' ||
          feedback?.judgement === 'not-useful' ||
          feedback?.judgement === 'concerning'
            ? feedback.judgement
            : null,
        investigation: review,
        isRefreshing: false,
        ownerId,
        reviewWorkState: reviewWork?.state === 'queued' || reviewWork?.state === 'running' ? reviewWork.state : null,
        refreshError: null,
        sourceCount: sourceCount ?? 0
      });
    } catch {
      showLoadError(isRefresh, 'Your Health Investigation has an invalid record.');
    }
  }

  function showLoadError(isRefresh: boolean, message: string): void {
    if (!isRefresh) {
      setState({ kind: 'error', message });
      return;
    }

    setState((currentState) =>
      currentState.kind === 'ready' ? failRefresh(currentState, message) : { kind: 'error', message }
    );
  }

  if (state.kind === 'ready') {
    return (
      <InvestigationResult
        evidenceSources={state.evidenceSources}
        feedbackJudgement={state.feedbackJudgement}
        investigation={state.investigation}
        isRefreshing={state.isRefreshing}
        onRefresh={refreshReview}
        ownerId={state.ownerId}
        reviewWorkState={state.reviewWorkState}
        refreshError={state.refreshError}
        sourceCount={state.sourceCount}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={layout.screen}>
      {state.kind === 'error' ? (
        <>
          <Text role="alert" style={typography.alert}>
            {state.message}
          </Text>
          <ActionButton
            label="Retry loading investigation"
            onPress={() => {
              setState({ kind: 'loading' });
              void loadReview(ownerId);
            }}
          />
        </>
      ) : (
        <ActivityIndicator color={colors.ink} />
      )}
    </ScrollView>
  );
}

function InvestigationResult({
  evidenceSources,
  feedbackJudgement,
  investigation,
  isRefreshing,
  onRefresh,
  ownerId,
  reviewWorkState,
  refreshError,
  sourceCount
}: {
  evidenceSources: EvidenceSource[];
  feedbackJudgement: RatingJudgement | null;
  investigation: HealthInvestigationSummary | null;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  ownerId: string;
  reviewWorkState: 'queued' | 'running' | null;
  refreshError: string | null;
  sourceCount: number;
}) {
  const sourceStatus =
    sourceCount === 0
      ? 'No sources are connected yet. Import data privately on the web to begin a Health Review.'
      : `${sourceCount} private ${sourceCount === 1 ? 'source is' : 'sources are'} connected and available for a bounded Health Review.`;
  const workStatus = reviewWorkState
    ? `A background Health Review is ${reviewWorkState === 'queued' ? 'queued' : 'running'}.`
    : null;

  if (!investigation) {
    return (
      <ScrollView contentContainerStyle={layout.screen}>
        <ScreenLead context="Health Review" headline="Your private record is ready." />
        <ReviewStatus sourceStatus={sourceStatus} workStatus={workStatus}>
          <Text style={typography.note}>No Health Investigation has been surfaced yet.</Text>
        </ReviewStatus>
        <ReviewRefreshControls isRefreshing={isRefreshing} onRefresh={onRefresh} refreshError={refreshError} />
        <HealthRecordEditor key={ownerId} ownerId={ownerId} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={layout.screen}>
      <ScreenLead context="Health Review" headline="Your latest investigation" />
      <ReviewStatus sourceStatus={sourceStatus} workStatus={workStatus} />
      <ReviewRefreshControls isRefreshing={isRefreshing} onRefresh={onRefresh} refreshError={refreshError} />
      <HealthRecordEditor key={ownerId} ownerId={ownerId} />
      <View style={styles.group}>
        <Text accessibilityRole="header" style={styles.investigationTitle}>
          {investigation.resultType.replaceAll('-', ' ')}
        </Text>
        <Text style={typography.body}>{investigation.summary}</Text>
      </View>
      <View style={styles.group}>
        <SectionHeading title="Why this was surfaced" />
        <Text style={typography.note}>
          {investigation.panelId.replaceAll('-', ' ')} panel v{investigation.panelVersion} reviewed{' '}
          {investigation.personalEvidenceCount} private{' '}
          {investigation.personalEvidenceCount === 1 ? 'record' : 'records'}.
        </Text>
        {evidenceSources.map((source) => (
          <Text key={source.id} style={typography.meta}>
            Source: {source.provider}, {source.verificationState}, imported {source.importedAt.slice(0, 10)}.
          </Text>
        ))}
        <Text style={typography.meta}>Clinical references: {investigation.citationReferences.join('; ')}</Text>
      </View>
      <HealthFollowUpSection key={`follow-ups-${investigation.id}`} investigation={investigation} ownerId={ownerId} />
      <HealthInvestigationFeedback
        key={`feedback-${investigation.id}`}
        initialJudgement={feedbackJudgement}
        investigationId={investigation.id}
        ownerId={ownerId}
      />
      <Text style={typography.meta}>Reviewed {investigation.createdAt.slice(0, 10)}</Text>
    </ScrollView>
  );
}

function HealthInvestigationFeedback({
  initialJudgement,
  investigationId,
  ownerId
}: {
  initialJudgement: RatingJudgement | null;
  investigationId: string;
  ownerId: string;
}) {
  const [judgement, setJudgement] = useState<RatingJudgement | null>(initialJudgement);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function saveJudgement(nextJudgement: RatingJudgement): Promise<void> {
    if (!supabase || isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    const { error } = await supabase
      .from('health_investigation_feedback')
      .upsert(
        { investigation_id: investigationId, judgement: nextJudgement, owner_id: ownerId },
        { onConflict: 'owner_id,investigation_id' }
      );
    setIsSaving(false);

    if (error) {
      setSaveError('Your feedback could not be saved.');
      return;
    }

    setJudgement(nextJudgement);
  }

  return (
    <View style={styles.group}>
      <SectionHeading title="Was this review useful?" />
      <Text style={typography.note}>
        Your private rating helps assess the Health Review. It does not change care advice.
      </Text>
      <RatingButtons disabled={isSaving} onRate={(option) => void saveJudgement(option)} selected={judgement} />
      {saveError ? (
        <Text role="alert" style={typography.alert}>
          {saveError}
        </Text>
      ) : null}
    </View>
  );
}

function ReviewRefreshControls({
  isRefreshing,
  onRefresh,
  refreshError
}: {
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  refreshError: string | null;
}) {
  return (
    <View style={styles.group}>
      <ActionButton
        disabled={isRefreshing}
        label={isRefreshing ? 'Refreshing review…' : 'Refresh review'}
        onPress={() => void onRefresh()}
        variant="secondary"
      />
      {refreshError ? (
        <Text role="alert" style={typography.alert}>
          {refreshError}
        </Text>
      ) : null}
    </View>
  );
}

function ReviewStatus({
  children,
  sourceStatus,
  workStatus
}: {
  children?: ReactNode;
  sourceStatus: string;
  workStatus: string | null;
}) {
  return (
    <View style={styles.group}>
      <SectionHeading title="Review status" />
      <Text style={typography.note}>{sourceStatus}</Text>
      {workStatus ? <Text style={typography.note}>{workStatus}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 12 },
  investigationTitle: { ...typography.title, textTransform: 'capitalize' }
});
