import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ContextPacket, SyntheticContextScenario } from '@health-coach/health-core/lab-context';
import { ActionButton } from './action-button';
import { ContextPacketEvidence } from './context-packet-evidence';
import { readSyntheticContext } from './read-synthetic-context';
import { SectionHeading } from './section-heading';
import { rule, typography } from './theme';

export function SyntheticContextExample() {
  const [showGaps, setShowGaps] = useState(false);
  const [packet, setPacket] = useState<ContextPacket | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenario, setScenario] = useState<SyntheticContextScenario>('prepared');
  if (!__DEV__) return null;

  async function load(next: SyntheticContextScenario) {
    setBusy(true);
    setError(null);
    // A failed refresh or correction must never leave older note passages on screen.
    setPacket(null);
    setScenario(next);
    try {
      setPacket(await readSyntheticContext(next));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The synthetic example could not be loaded.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.group}>
      <View style={rule.light} />
      <SectionHeading title="Synthetic evidence example" />
      <Text style={typography.note}>
        Development only. Example laboratory, activity and notes data from your server; no AI interpretation.
      </Text>
      <ActionButton
        label={busy ? 'Loading example…' : packet ? 'Reload example' : 'Load synthetic example'}
        disabled={busy}
        variant="secondary"
        onPress={() => void load(scenario)}
      />
      {packet ? (
        <>
          <Text style={typography.context}>
            {scenario === 'corrected-notes'
              ? 'Corrected notes example'
              : scenario === 'deleted-notes'
                ? 'Deleted notes example'
                : scenario === 'prepared'
                  ? 'Original notes example'
                  : 'Missing or changed evidence example'}
          </Text>
          <ContextPacketEvidence packet={packet} />
          <Text style={typography.note}>Replay a source correction or deletion with prepared example revisions.</Text>
          <ActionButton
            label="Show corrected notes"
            disabled={busy}
            variant="secondary"
            onPress={() => void load('corrected-notes')}
          />
          <ActionButton
            label="Show deleted notes"
            disabled={busy}
            variant="secondary"
            onPress={() => void load('deleted-notes')}
          />
          {scenario !== 'prepared' ? (
            <ActionButton
              label="Reset example"
              disabled={busy}
              variant="secondary"
              onPress={() => void load('prepared')}
            />
          ) : null}
        </>
      ) : null}
      <ActionButton
        label={showGaps ? 'Hide missing-source examples' : 'Inspect missing-source examples'}
        variant="secondary"
        onPress={() => setShowGaps(!showGaps)}
      />
      {showGaps
        ? (
            [
              ['notes-unavailable', 'Show unavailable notes'],
              ['stale-notes', 'Show changed notes during loading'],
              ['activity-unavailable', 'Show unavailable activity'],
              ['ambiguous-dates', 'Show ambiguous collection dates']
            ] as const
          ).map(([value, label]) => (
            <ActionButton
              key={value}
              label={label}
              disabled={busy}
              variant="secondary"
              onPress={() => void load(value)}
            />
          ))
        : null}
      {error ? (
        <Text role="alert" style={typography.alert}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({ group: { gap: 16 } });
