import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type { HealthInvestigationSummary } from '@health-coach/health-core/iron-regulation-panel';
import { ActionButton } from './action-button';
import { formatDate, formatDateRange } from './format';
import { createFollowUpDraft } from './health-follow-up-state';
import { SectionHeading } from './section-heading';
import { supabase } from './supabase-client';
import { colors, field, fonts, typography } from './theme';

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
          label: `${result.test_name} recorded ${formatDate(result.recorded_at)}`
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
      <SectionHeading title="Follow-up" />
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
          <Text style={typography.note}>{draft.rationale}</Text>
          <Text style={styles.due}>Due {formatDateRange(draft.dueStart, draft.dueEnd)}</Text>
          <ActionButton disabled={isSaving} label="Create Health Follow-up" onPress={() => void createFollowUp()} />
        </View>
      ) : (
        <Text style={typography.note}>This conclusion does not need a Health Follow-up right now.</Text>
      )}
      {supersededFollowUps.map((followUp) => (
        <Text key={followUp.id} style={styles.superseded}>
          Superseded Health Follow-up: {followUp.purpose}
        </Text>
      ))}
      {isSaving ? <ActivityIndicator color={colors.ink} style={styles.indicator} /> : null}
      {error ? (
        <Text role="alert" style={typography.alert}>
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
      <Text style={typography.note}>{followUp.rationale}</Text>
      <Text style={styles.due}>
        Due {formatDateRange(followUp.dueStart, followUp.dueEnd)} · {followUp.state}
      </Text>
      {isOpen ? (
        <>
          <TextInput
            accessibilityLabel="Owner completion report"
            multiline
            onChangeText={onChangeCompletionNote}
            placeholder="Briefly record what you completed"
            placeholderTextColor={colors.secondary}
            style={field.input}
            value={completionNote}
          />
          <ActionButton disabled={disabled} label="Complete with owner report" onPress={onComplete} />
          {completionSources.map((source) => (
            <ActionButton
              key={source.id}
              disabled={disabled}
              label={`Complete with ${source.label}`}
              onPress={() => onCompleteFromSource(source.id)}
              variant="secondary"
            />
          ))}
          <View style={styles.row}>
            <ActionButton disabled={disabled} label="Snooze 14 days" onPress={onSnooze} variant="secondary" />
            <ActionButton disabled={disabled} label="Dismiss" onPress={onDismiss} variant="secondary" />
          </View>
        </>
      ) : followUp.completionNote ? (
        <Text style={typography.note}>Owner report: {followUp.completionNote}</Text>
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

const styles = StyleSheet.create({
  card: { gap: 12 },
  due: { ...typography.meta, color: colors.ink, fontFamily: fonts.semibold },
  indicator: { marginTop: 12 },
  purpose: { ...typography.signal, fontSize: 16, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 8 },
  section: { gap: 12 },
  superseded: { ...typography.meta, fontStyle: 'italic' }
});
