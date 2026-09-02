import {
  toHealthInvestigationSummary,
  type HealthInvestigationSummary
} from '@health-coach/health-core/iron-regulation-panel';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { beginRefresh, failRefresh } from './health-investigation-refresh-state';
import { HealthRecordEditor } from './health-record-editor';
import { HealthFollowUpSection } from './health-follow-up';
import { supabase } from './supabase-client';

type ScreenState =
  | { kind: 'configuration-needed' }
  | { kind: 'signed-out' }
  | { kind: 'signing-in' }
  | { kind: 'loading' }
  | {
      kind: 'ready';
      evidenceSources: EvidenceSource[];
      investigation: HealthInvestigationSummary | null;
      isRefreshing: boolean;
      ownerId: string;
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

export function HealthInvestigationScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<ScreenState>(supabase ? { kind: 'signed-out' } : { kind: 'configuration-needed' });

  async function signIn(): Promise<void> {
    if (!supabase) {
      return;
    }

    setState({ kind: 'signing-in' });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      setState({ kind: 'error', message: 'Sign-in failed. Check the owner credentials and try again.' });
      return;
    }

    setState({ kind: 'loading' });
    await loadReview(data.user.id);
  }

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
      const [{ data: investigation, error: investigationError }, { count: sourceCount, error: sourcesError }] =
        await Promise.all([
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
          supabase.from('health_sources').select('id', { count: 'exact', head: true }).eq('owner_id', ownerId)
        ]);

      if (investigationError || sourcesError) {
        showLoadError(isRefresh, 'Your Health Investigation could not be loaded.');
        return;
      }

      const review = investigation ? toHealthInvestigationSummary(investigation) : null;
      const { data: evidenceSources, error: evidenceSourcesError } = review
        ? await supabase
            .from('health_sources')
            .select('id, imported_at, provider, verification_state')
            .eq('owner_id', ownerId)
            .in('id', review.personalEvidenceReferenceIds)
        : { data: [], error: null };

      if (evidenceSourcesError) {
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
        investigation: review,
        isRefreshing: false,
        ownerId,
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

  if (state.kind === 'configuration-needed') {
    return <ConfigurationNeeded />;
  }

  if (state.kind === 'ready') {
    return (
      <InvestigationResult
        evidenceSources={state.evidenceSources}
        investigation={state.investigation}
        isRefreshing={state.isRefreshing}
        onRefresh={refreshReview}
        ownerId={state.ownerId}
        refreshError={state.refreshError}
        sourceCount={state.sourceCount}
      />
    );
  }

  const isBusy = state.kind === 'signing-in' || state.kind === 'loading';
  const errorMessage = state.kind === 'error' ? state.message : null;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.eyebrow}>HEALTH INVESTIGATION</Text>
      <Text style={styles.title}>Sign in to view your private record.</Text>
      <Text style={styles.body}>
        Your Android app reads only the Health Investigations that belong to your signed-in owner account.
      </Text>
      <TextInput
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={setEmail}
        placeholder="Owner email"
        style={styles.input}
        textContentType="emailAddress"
        value={email}
      />
      <TextInput
        autoComplete="current-password"
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        textContentType="password"
        value={password}
      />
      {errorMessage ? (
        <Text role="alert" style={styles.error}>
          {errorMessage}
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" disabled={isBusy} onPress={signIn} style={styles.button}>
        {isBusy ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </ScrollView>
  );
}

function ConfigurationNeeded() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>HEALTH INVESTIGATION</Text>
      <Text style={styles.title}>Private connection required.</Text>
      <Text style={styles.body}>
        Configure the public Supabase URL and anonymous key in the app environment. Owner credentials and service keys
        never belong in the app bundle.
      </Text>
    </ScrollView>
  );
}

function InvestigationResult({
  evidenceSources,
  investigation,
  isRefreshing,
  onRefresh,
  ownerId,
  refreshError,
  sourceCount
}: {
  evidenceSources: EvidenceSource[];
  investigation: HealthInvestigationSummary | null;
  isRefreshing: boolean;
  onRefresh: () => Promise<void>;
  ownerId: string;
  refreshError: string | null;
  sourceCount: number;
}) {
  const sourceStatus =
    sourceCount === 0
      ? 'No sources are connected yet. Import data privately on the web to begin a Health Review.'
      : `${sourceCount} private ${sourceCount === 1 ? 'source is' : 'sources are'} connected and available for a bounded Health Review.`;

  if (!investigation) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>HEALTH REVIEW</Text>
        <Text style={styles.title}>Your private record is ready.</Text>
        <View style={styles.reviewCard}>
          <Text style={styles.cardTitle}>Review status</Text>
          <Text style={styles.cardBody}>{sourceStatus}</Text>
          <Text style={styles.cardBody}>No Health Investigation has been surfaced yet.</Text>
        </View>
        <ReviewRefreshControls isRefreshing={isRefreshing} onRefresh={onRefresh} refreshError={refreshError} />
        <HealthRecordEditor key={ownerId} ownerId={ownerId} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.eyebrow}>HEALTH REVIEW</Text>
      <Text style={styles.title}>Your latest investigation</Text>
      <View style={styles.reviewCard}>
        <Text style={styles.cardTitle}>Review status</Text>
        <Text style={styles.cardBody}>{sourceStatus}</Text>
      </View>
      <ReviewRefreshControls isRefreshing={isRefreshing} onRefresh={onRefresh} refreshError={refreshError} />
      <HealthRecordEditor key={ownerId} ownerId={ownerId} />
      <Text style={styles.investigationTitle}>{investigation.resultType.replaceAll('-', ' ')}</Text>
      <Text style={styles.body}>{investigation.summary}</Text>
      <View style={styles.provenanceCard}>
        <Text style={styles.cardTitle}>Why this was surfaced</Text>
        <Text style={styles.cardBody}>
          {investigation.panelId.replaceAll('-', ' ')} panel v{investigation.panelVersion} reviewed{' '}
          {investigation.personalEvidenceCount} private{' '}
          {investigation.personalEvidenceCount === 1 ? 'record' : 'records'}.
        </Text>
        {evidenceSources.map((source) => (
          <Text key={source.id} style={styles.cardBody}>
            Source: {source.provider}, {source.verificationState}, imported {source.importedAt.slice(0, 10)}.
          </Text>
        ))}
        <Text style={styles.cardBody}>Clinical references: {investigation.citationReferences.join('; ')}</Text>
      </View>
      <HealthFollowUpSection key={investigation.id} investigation={investigation} ownerId={ownerId} />
      <Text style={styles.status}>Reviewed {investigation.createdAt.slice(0, 10)}</Text>
    </ScrollView>
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
    <>
      <Pressable accessibilityRole="button" disabled={isRefreshing} onPress={onRefresh} style={styles.refreshButton}>
        {isRefreshing ? (
          <ActivityIndicator color="#39734f" />
        ) : (
          <Text style={styles.refreshButtonText}>Refresh review</Text>
        )}
      </Pressable>
      {refreshError ? (
        <Text role="alert" style={styles.error}>
          {refreshError}
        </Text>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { color: '#55555a', fontSize: 17, lineHeight: 26, marginTop: 16 },
  button: { alignItems: 'center', backgroundColor: '#39734f', borderRadius: 8, marginTop: 20, padding: 14 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  cardBody: { color: '#55555a', fontSize: 16, lineHeight: 24, marginTop: 8 },
  cardTitle: { color: '#1d1d20', fontSize: 16, fontWeight: '700' },
  content: { flexGrow: 1, justifyContent: 'center', padding: 28 },
  eyebrow: { color: '#39734f', fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  error: { color: '#9d1c1c', fontSize: 15, marginTop: 12 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#b4b4b4',
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginTop: 14,
    padding: 12
  },
  investigationTitle: { color: '#1d1d20', fontSize: 22, fontWeight: '700', lineHeight: 30, marginTop: 28 },
  provenanceCard: { backgroundColor: '#f2f2ef', borderRadius: 12, marginTop: 20, padding: 18 },
  refreshButton: {
    alignItems: 'center',
    borderColor: '#39734f',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 16,
    padding: 14
  },
  refreshButtonText: { color: '#39734f', fontSize: 16, fontWeight: '700' },
  reviewCard: { backgroundColor: '#eef5ef', borderRadius: 12, marginTop: 24, padding: 18 },
  status: { color: '#39734f', fontSize: 15, fontWeight: '600', marginTop: 28 },
  title: { color: '#1d1d20', fontSize: 30, fontWeight: '700', lineHeight: 38, marginTop: 12 }
});
