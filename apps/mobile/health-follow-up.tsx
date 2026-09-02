import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { HealthInvestigationSummary } from '@health-coach/health-core/iron-regulation-panel';
import { createFollowUpDraft } from './health-follow-up-state';
import { supabase } from './supabase-client';

type HealthFollowUp = {
  completedAt: string | null;
  completionNote: string | null;
  completionSourceId: string | null;
  dueEnd: string;
  dueStart: string;
  id: string;
  investigationId: string;
  purpose: string;
  rationale: string;
  state: 'active' | 'snoozed' | 'completed' | 'dismissed' | 'superseded';
};

type CompletionSource = {
  id: string;
  label: string;
};

type HealthFollowUpUpdate =
  | { completed_at: string; completed_source_id: string; state: 'completed' }
  | { completed_at: string; completion_note: string; state: 'completed' }
  | { due_end: string; due_start: string; state: 'snoozed' }
  | { state: 'dismissed' };

const followUpFields =
  'completed_at, completion_note, completed_source_id, due_end, due_start, id, investigation_id, purpose, rationale, state';

export function HealthFollowUpSection({
  investigation,
  ownerId
}: {
  investigation: HealthInvestigationSummary;
  ownerId: string;
}) {
  const [completionNote, setCompletionNote] = useState('');
  const [completionSources, setCompletionSources] = useState<CompletionSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<HealthFollowUp[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const draft = createFollowUpDraft(investigation);

  useEffect(() => {
    let isCurrent = true;

    async function loadFollowUps(): Promise<void> {
      if (!supabase) {
        return;
      }

      const { data, error: loadError } = await supabase
        .from('health_follow_ups')
        .select(followUpFields)
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false });

      if (!isCurrent) {
        return;
      }

      if (loadError) {
        setError('Your Health Follow-ups could not be loaded.');
        return;
      }

      setFollowUps((data ?? []).map(mapFollowUp));

      const { data: labResults, error: labResultsError } = await supabase
        .from('lab_results')
        .select('recorded_at, source_id, test_name')
        .eq('owner_id', ownerId)
        .order('recorded_at', { ascending: false })
        .limit(5);

      if (labResultsError) {
        setError('Your source-backed results could not be loaded.');
        return;
      }

      setCompletionSources(
        (labResults ?? []).map((result) => ({
          id: result.source_id,
          label: `${result.test_name} recorded ${result.recorded_at.slice(0, 10)}`
        }))
      );
    }

    void loadFollowUps();
    return () => {
      isCurrent = false;
    };
  }, [ownerId]);

  const currentFollowUp = followUps.find((followUp) => followUp.investigationId === investigation.id);
  const supersededFollowUps = followUps.filter((followUp) => followUp.state === 'superseded');

  async function createFollowUp(): Promise<void> {
    if (!supabase || !draft) {
      return;
    }

    setIsSaving(true);
    setError(null);
    const { data, error: createError } = await supabase
      .from('health_follow_ups')
      .insert({
        due_end: draft.dueEnd,
        due_start: draft.dueStart,
        investigation_id: investigation.id,
        owner_id: ownerId,
        purpose: draft.purpose,
        rationale: draft.rationale
      })
      .select(followUpFields)
      .single();

    if (createError || !data) {
      setError('Your Health Follow-up could not be created.');
    } else {
      setFollowUps((current) => [mapFollowUp(data), ...current]);
    }
    setIsSaving(false);
  }

  async function updateFollowUp(followUp: HealthFollowUp, update: HealthFollowUpUpdate): Promise<void> {
    if (!supabase) {
      return;
    }

    setIsSaving(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('health_follow_ups')
      .update(update)
      .eq('id', followUp.id)
      .eq('owner_id', ownerId)
      .select(followUpFields)
      .single();

    if (updateError || !data) {
      setError('Your Health Follow-up could not be updated.');
    } else {
      setFollowUps((current) => current.map((item) => (item.id === followUp.id ? mapFollowUp(data) : item)));
      setCompletionNote('');
    }
    setIsSaving(false);
  }

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Health Follow-up</Text>
      {currentFollowUp ? (
        <FollowUpCard
          completionNote={completionNote}
          disabled={isSaving}
          followUp={currentFollowUp}
          onChangeCompletionNote={setCompletionNote}
          onComplete={() => {
            if (!completionNote.trim()) {
              setError('Add a brief owner report before completing this Health Follow-up.');
              return;
            }
            void updateFollowUp(currentFollowUp, {
              completed_at: new Date().toISOString(),
              completion_note: completionNote.trim(),
              state: 'completed'
            });
          }}
          onCompleteFromSource={(sourceId) =>
            void updateFollowUp(currentFollowUp, {
              completed_at: new Date().toISOString(),
              completed_source_id: sourceId,
              state: 'completed'
            })
          }
          completionSources={completionSources}
          onDismiss={() => void updateFollowUp(currentFollowUp, { state: 'dismissed' })}
          onSnooze={() =>
            void updateFollowUp(currentFollowUp, {
              due_end: addDays(currentFollowUp.dueEnd, 14),
              due_start: addDays(currentFollowUp.dueStart, 14),
              state: 'snoozed'
            })
          }
        />
      ) : draft ? (
        <View style={styles.card}>
          <Text style={styles.purpose}>{draft.purpose}</Text>
          <Text style={styles.detail}>{draft.rationale}</Text>
          <Text style={styles.due}>
            Due {formatDate(draft.dueStart)}–{formatDate(draft.dueEnd)}
          </Text>
          <ActionButton disabled={isSaving} label="Create Health Follow-up" onPress={() => void createFollowUp()} />
        </View>
      ) : (
        <Text style={styles.detail}>This conclusion does not need a Health Follow-up right now.</Text>
      )}
      {supersededFollowUps.map((followUp) => (
        <Text key={followUp.id} style={styles.superseded}>
          Superseded Health Follow-up: {followUp.purpose}
        </Text>
      ))}
      {isSaving ? <ActivityIndicator color="#39734f" style={styles.indicator} /> : null}
      {error ? (
        <Text role="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function FollowUpCard({
  completionNote,
  completionSources,
  disabled,
  followUp,
  onChangeCompletionNote,
  onComplete,
  onCompleteFromSource,
  onDismiss,
  onSnooze
}: {
  completionNote: string;
  completionSources: CompletionSource[];
  disabled: boolean;
  followUp: HealthFollowUp;
  onChangeCompletionNote: (value: string) => void;
  onComplete: () => void;
  onCompleteFromSource: (sourceId: string) => void;
  onDismiss: () => void;
  onSnooze: () => void;
}) {
  const isOpen = followUp.state === 'active' || followUp.state === 'snoozed';
  return (
    <View style={styles.card}>
      <Text style={styles.purpose}>{followUp.purpose}</Text>
      <Text style={styles.detail}>{followUp.rationale}</Text>
      <Text style={styles.due}>
        Due {formatDate(followUp.dueStart)}–{formatDate(followUp.dueEnd)} · {followUp.state}
      </Text>
      {isOpen ? (
        <>
          <TextInput
            accessibilityLabel="Owner completion report"
            multiline
            onChangeText={onChangeCompletionNote}
            placeholder="Briefly record what you completed"
            style={styles.input}
            value={completionNote}
          />
          <ActionButton disabled={disabled} label="Complete with owner report" onPress={onComplete} />
          {completionSources.map((source) => (
            <ActionButton
              key={source.id}
              disabled={disabled}
              label={`Complete with ${source.label}`}
              onPress={() => onCompleteFromSource(source.id)}
              secondary
            />
          ))}
          <View style={styles.row}>
            <ActionButton disabled={disabled} label="Snooze 14 days" onPress={onSnooze} secondary />
            <ActionButton disabled={disabled} label="Dismiss" onPress={onDismiss} secondary />
          </View>
        </>
      ) : followUp.completionNote ? (
        <Text style={styles.detail}>Owner report: {followUp.completionNote}</Text>
      ) : null}
    </View>
  );
}

function mapFollowUp(followUp: {
  completed_at: string | null;
  completion_note: string | null;
  completed_source_id: string | null;
  due_end: string;
  due_start: string;
  id: string;
  investigation_id: string;
  purpose: string;
  rationale: string;
  state: HealthFollowUp['state'];
}): HealthFollowUp {
  return {
    completedAt: followUp.completed_at,
    completionNote: followUp.completion_note,
    completionSourceId: followUp.completed_source_id,
    dueEnd: followUp.due_end,
    dueStart: followUp.due_start,
    id: followUp.id,
    investigationId: followUp.investigation_id,
    purpose: followUp.purpose,
    rationale: followUp.rationale,
    state: followUp.state
  };
}

function addDays(value: string, days: number): string {
  const date = new Date(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function formatDate(value: string): string {
  return value.slice(0, 10);
}

function ActionButton({
  disabled,
  label,
  onPress,
  secondary = false
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={secondary ? styles.secondaryButton : styles.button}
    >
      <Text style={secondary ? styles.secondaryButtonText : styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: '#39734f', borderRadius: 8, marginTop: 12, padding: 12 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: '#f2f2ef', borderRadius: 12, marginTop: 12, padding: 18 },
  detail: { color: '#55555a', fontSize: 15, lineHeight: 22, marginTop: 8 },
  due: { color: '#39734f', fontSize: 14, fontWeight: '600', marginTop: 12 },
  error: { color: '#9d1c1c', fontSize: 15, marginTop: 12 },
  heading: { color: '#1d1d20', fontSize: 22, fontWeight: '700', marginTop: 28 },
  indicator: { marginTop: 12 },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#b4b4b4',
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
    marginTop: 12,
    minHeight: 80,
    padding: 12
  },
  purpose: { color: '#1d1d20', fontSize: 16, fontWeight: '700', lineHeight: 22 },
  row: { flexDirection: 'row', gap: 8 },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#39734f',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginTop: 12,
    padding: 12
  },
  secondaryButtonText: { color: '#39734f', fontSize: 14, fontWeight: '700' },
  section: { marginTop: 4 },
  superseded: { color: '#55555a', fontSize: 14, fontStyle: 'italic', lineHeight: 20, marginTop: 12 }
});
