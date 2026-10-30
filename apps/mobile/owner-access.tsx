import { useState } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton } from './action-button';
import { supabase } from './supabase-client';
import { ScreenLead } from './screen-lead';
import { colors, field, layout, typography } from './theme';
import { TopBar } from './top-bar';

const prefillLocalOwner =
  __DEV__ &&
  /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?\/?$/.test(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '');

export function OwnerAccess({ children }: { children: (ownerId: string, signOut: () => void) => ReactNode }) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [email, setEmail] = useState(prefillLocalOwner ? 'owner@local.invalid' : '');
  const [password, setPassword] = useState(
    prefillLocalOwner ? (process.env.EXPO_PUBLIC_LOCAL_OWNER_PASSWORD ?? '') : ''
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (ownerId)
    return children(ownerId, () => {
      void supabase?.auth.signOut();
      setOwnerId(null);
    });
  async function signIn() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error || !result.data.user) {
        setError('Sign-in failed. Check your owner credentials.');
      } else {
        setPassword('');
        setOwnerId(result.data.user.id);
      }
    } catch {
      setError('Sign-in failed. Check your owner credentials.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.screen}>
      <TopBar />
      <ScrollView contentContainerStyle={layout.screen} keyboardShouldPersistTaps="handled">
        <ScreenLead context="Private owner access" headline="Understand recent changes in your wearable record." />
        {!supabase ? (
          <Text style={typography.alert}>Configure the Supabase connection before signing in.</Text>
        ) : (
          <View style={styles.form}>
            <TextInput
              accessibilityLabel="Owner email"
              placeholder="Owner email"
              placeholderTextColor={colors.secondary}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
              style={field.input}
            />
            <TextInput
              accessibilityLabel="Owner password"
              placeholder="Password"
              placeholderTextColor={colors.secondary}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              style={field.input}
            />
            <ActionButton label={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={() => void signIn()} />
          </View>
        )}
        {error ? (
          <Text role="alert" style={typography.alert}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16 },
  screen: { flex: 1 }
});
