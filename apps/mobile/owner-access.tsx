import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button, ScrollView, Text, TextInput, View } from 'react-native';
import { supabase } from './supabase-client';

export function OwnerAccess({ children }: { children: (ownerId: string) => ReactNode }) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (ownerId)
    return (
      <View style={{ flex: 1 }}>
        <Button
          title="Sign out"
          onPress={() => {
            void supabase?.auth.signOut();
            setOwnerId(null);
          }}
        />
        {children(ownerId)}
      </View>
    );
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
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
      <Text accessibilityRole="header">Health Coach</Text>
      <Text>Understand recent changes in your wearable record.</Text>
      <Text>
        Steps and recorded sleep are read only when you choose. A local comparison stays on your phone. Requesting an AI
        explanation sends derived daily totals to your private server, and calculated comparisons plus your question to
        the configured model; private review snapshots are retained for evaluation. No health actions are performed.
      </Text>
      {!supabase ? (
        <Text>Configure the Supabase connection before signing in.</Text>
      ) : (
        <>
          <TextInput
            accessibilityLabel="Owner email"
            placeholder="Owner email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            accessibilityLabel="Owner password"
            placeholder="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button title={busy ? 'Signing in…' : 'Sign in'} disabled={busy} onPress={() => void signIn()} />
        </>
      )}
      {error ? <Text role="alert">{error}</Text> : null}
    </ScrollView>
  );
}
