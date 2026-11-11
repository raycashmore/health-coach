import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ContextPacket } from '@health-coach/health-core/lab-context';
import { ActionButton } from './action-button';
import { ContextPacketEvidence } from './context-packet-evidence';
import { readPrivateContext } from './read-private-context';
import { SectionHeading } from './section-heading';
import { rule, typography } from './theme';

export function PrivateContextCase() {
  const [packet, setPacket] = useState<ContextPacket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!__DEV__) return null;

  async function load() {
    setPacket(null);
    setError(null);
    setBusy(true);
    try {
      setPacket(await readPrivateContext());
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The private case could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.group}>
      <View style={rule.light} />
      <SectionHeading title="Prepared private case" />
      <Text style={typography.note}>
        Development only. Inspect the prepared laboratory and notes sources with the last 14 completed days of steps and
        recorded sleep. No AI interpretation.
      </Text>
      <ActionButton
        label={busy ? 'Loading private case…' : packet ? 'Reload private case' : 'Load private case'}
        disabled={busy}
        variant="secondary"
        onPress={() => void load()}
      />
      {packet ? <ContextPacketEvidence packet={packet} /> : null}
      {error ? (
        <Text role="alert" style={typography.alert}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ group: { gap: 16 } });
