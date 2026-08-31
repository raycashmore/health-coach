import {
  toHealthInvestigationSummary,
  type HealthInvestigationSummary
} from '@health-coach/health-core/iron-regulation-panel';
import { createClient } from '@supabase/supabase-js';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;

type ScreenState =
  | { kind: 'configuration-needed' }
  | { kind: 'signed-out' }
  | { kind: 'signing-in' }
  | { kind: 'loading' }
  | { kind: 'ready'; investigation: HealthInvestigationSummary | null }
  | { kind: 'error'; message: string };

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
    const { data: investigation, error: investigationError } = await supabase
      .from('health_investigations')
      .select('id, result_type, summary, created_at')
      .eq('owner_id', data.user.id)
      .is('superseded_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (investigationError) {
      setState({ kind: 'error', message: 'Your Health Investigation could not be loaded.' });
      return;
    }

    try {
      setState({ kind: 'ready', investigation: investigation ? toHealthInvestigationSummary(investigation) : null });
    } catch {
      setState({ kind: 'error', message: 'Your Health Investigation has an invalid record.' });
    }
  }

  if (state.kind === 'configuration-needed') {
    return <ConfigurationNeeded />;
  }

  if (state.kind === 'ready') {
    return <InvestigationResult investigation={state.investigation} />;
  }

  const isBusy = state.kind === 'signing-in' || state.kind === 'loading';
  const errorMessage = state.kind === 'error' ? state.message : null;

  return (
    <View style={styles.content}>
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
    </View>
  );
}

function ConfigurationNeeded() {
  return (
    <View style={styles.content}>
      <Text style={styles.eyebrow}>HEALTH INVESTIGATION</Text>
      <Text style={styles.title}>Private connection required.</Text>
      <Text style={styles.body}>
        Configure the public Supabase URL and anonymous key in the app environment. Owner credentials and service keys
        never belong in the app bundle.
      </Text>
    </View>
  );
}

function InvestigationResult({ investigation }: { investigation: HealthInvestigationSummary | null }) {
  if (!investigation) {
    return (
      <View style={styles.content}>
        <Text style={styles.eyebrow}>HEALTH INVESTIGATION</Text>
        <Text style={styles.title}>Nothing to surface yet.</Text>
        <Text style={styles.body}>
          When a bounded Health Investigation has a valid result, it will appear here with its evidence and uncertainty.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.content}>
      <Text style={styles.eyebrow}>IRON-REGULATION INVESTIGATION</Text>
      <Text style={styles.title}>{investigation.resultType.replaceAll('-', ' ')}</Text>
      <Text style={styles.body}>{investigation.summary}</Text>
      <Text style={styles.status}>Reviewed {investigation.createdAt.slice(0, 10)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: '#55555a', fontSize: 17, lineHeight: 26, marginTop: 16 },
  button: { alignItems: 'center', backgroundColor: '#39734f', borderRadius: 8, marginTop: 20, padding: 14 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  content: { flex: 1, justifyContent: 'center', padding: 28 },
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
  status: { color: '#39734f', fontSize: 15, fontWeight: '600', marginTop: 28 },
  title: { color: '#1d1d20', fontSize: 30, fontWeight: '700', lineHeight: 38, marginTop: 12 }
});
