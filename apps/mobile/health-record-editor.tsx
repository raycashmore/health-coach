import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import type { SourceMetadata } from '@health-coach/health-core';
import {
  buildBloodPressureReading,
  buildSupplementRegimen,
  type BloodPressureDraft,
  type SupplementRegimenDraft
} from './health-record-entry';
import { ActionButton } from './action-button';
import { removeById, upsertById } from './health-record-editor-state';
import { SectionHeading } from './section-heading';
import { supabase } from './supabase-client';
import { colors, field, typography } from './theme';

type BloodPressureReading = {
  diastolicMmhg: number;
  id: string;
  pulseBpm: number | null;
  recordedAt: string;
  systolicMmhg: number;
};

type SupplementRegimen = {
  activeFrom: string;
  dose: string;
  form: string;
  frequency: string;
  id: string;
  ingredient: string;
};

const emptyBloodPressureDraft: BloodPressureDraft = { date: '', diastolicMmhg: '', pulseBpm: '', systolicMmhg: '' };
const emptySupplementDraft: SupplementRegimenDraft = {
  activeFrom: '',
  dose: '',
  form: '',
  frequency: '',
  ingredient: ''
};

export function HealthRecordEditor({ ownerId }: { ownerId: string }) {
  const [bloodPressureDraft, setBloodPressureDraft] = useState<BloodPressureDraft>(emptyBloodPressureDraft);
  const [bloodPressureReadings, setBloodPressureReadings] = useState<BloodPressureReading[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [regimens, setRegimens] = useState<SupplementRegimen[]>([]);
  const [selectedRegimenId, setSelectedRegimenId] = useState<string | null>(null);
  const [supplementDraft, setSupplementDraft] = useState<SupplementRegimenDraft>(emptySupplementDraft);

  useEffect(() => {
    let isCurrent = true;

    async function loadEntries(): Promise<void> {
      if (!supabase) {
        return;
      }

      const [{ data: readings, error: readingsError }, { data: activeRegimens, error: regimensError }] =
        await Promise.all([
          supabase
            .from('blood_pressure_readings')
            .select('diastolic_mmhg, id, pulse_bpm, recorded_at, systolic_mmhg')
            .eq('owner_id', ownerId)
            .order('recorded_at', { ascending: false }),
          supabase
            .from('supplement_regimens')
            .select('active_from, dose, form, frequency, id, ingredient')
            .eq('owner_id', ownerId)
            .is('active_until', null)
            .order('active_from', { ascending: false })
        ]);

      if (!isCurrent) {
        return;
      }

      if (readingsError || regimensError) {
        setError('Your owner-entered health record could not be loaded.');
        return;
      }

      setBloodPressureReadings(
        (readings ?? []).map((reading) => ({
          diastolicMmhg: reading.diastolic_mmhg,
          id: reading.id,
          pulseBpm: reading.pulse_bpm,
          recordedAt: reading.recorded_at,
          systolicMmhg: reading.systolic_mmhg
        }))
      );
      setRegimens(
        (activeRegimens ?? []).map((regimen) => ({
          activeFrom: regimen.active_from,
          dose: regimen.dose,
          form: regimen.form,
          frequency: regimen.frequency,
          id: regimen.id,
          ingredient: regimen.ingredient
        }))
      );
    }

    void loadEntries();
    return () => {
      isCurrent = false;
    };
  }, [ownerId]);

  async function ensureOwnerSource(source: SourceMetadata): Promise<string | null> {
    if (!supabase) {
      return null;
    }

    const { data, error: sourceError } = await supabase
      .from('health_sources')
      .upsert(
        {
          imported_at: source.importedAt,
          kind: source.kind,
          observed_at: source.observedAt,
          owner_id: ownerId,
          provider: source.provider,
          source_identifier: source.sourceIdentifier,
          verification_state: source.verificationState
        },
        { onConflict: 'owner_id,provider,source_identifier' }
      )
      .select('id')
      .single();

    return sourceError || !data ? null : data.id;
  }

  async function saveBloodPressure(): Promise<void> {
    const entry = buildBloodPressureReading(bloodPressureDraft);
    if (!entry || !supabase) {
      setError('Enter a valid date, systolic and diastolic readings, and an optional positive pulse.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const sourceId = await ensureOwnerSource(entry.source);
    if (!sourceId) {
      setError('Your blood-pressure reading could not be saved.');
      setIsSaving(false);
      return;
    }

    const { data, error: saveError } = await supabase
      .from('blood_pressure_readings')
      .upsert(
        {
          diastolic_mmhg: entry.diastolicMmhg,
          owner_id: ownerId,
          pulse_bpm: entry.pulseBpm ?? null,
          recorded_at: entry.recordedAt,
          source_id: sourceId,
          systolic_mmhg: entry.systolicMmhg
        },
        { onConflict: 'source_id,recorded_at' }
      )
      .select('diastolic_mmhg, id, pulse_bpm, recorded_at, systolic_mmhg')
      .single();

    if (saveError || !data) {
      setError('Your blood-pressure reading could not be saved.');
    } else {
      setBloodPressureReadings((current) =>
        upsertById(current, {
          diastolicMmhg: data.diastolic_mmhg,
          id: data.id,
          pulseBpm: data.pulse_bpm,
          recordedAt: data.recorded_at,
          systolicMmhg: data.systolic_mmhg
        })
      );
      setBloodPressureDraft(emptyBloodPressureDraft);
    }
    setIsSaving(false);
  }

  async function saveSupplementRegimen(): Promise<void> {
    const entry = buildSupplementRegimen(supplementDraft);
    if (!entry || !supabase) {
      setError('Enter an ingredient, form, dose, frequency, and valid start date.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const sourceId = await ensureOwnerSource(entry.source);
    if (!sourceId) {
      setError('Your Supplement Regimen could not be saved.');
      setIsSaving(false);
      return;
    }

    const regimen = {
      active_from: entry.activeFrom,
      dose: entry.dose,
      form: entry.form,
      frequency: entry.frequency,
      ingredient: entry.ingredient,
      owner_id: ownerId,
      source_id: sourceId
    };
    const query = selectedRegimenId
      ? supabase.from('supplement_regimens').update(regimen).eq('id', selectedRegimenId).eq('owner_id', ownerId)
      : supabase.from('supplement_regimens').insert(regimen);
    const { data, error: saveError } = await query
      .select('active_from, dose, form, frequency, id, ingredient')
      .single();

    if (saveError || !data) {
      setError('Your Supplement Regimen could not be saved.');
    } else {
      const saved = {
        activeFrom: data.active_from,
        dose: data.dose,
        form: data.form,
        frequency: data.frequency,
        id: data.id,
        ingredient: data.ingredient
      };
      setRegimens((current) => upsertById(current, saved));
      setSelectedRegimenId(null);
      setSupplementDraft(emptySupplementDraft);
    }
    setIsSaving(false);
  }

  async function endRegimen(id: string): Promise<void> {
    if (!supabase) {
      return;
    }

    setIsSaving(true);
    const { error: endError } = await supabase
      .from('supplement_regimens')
      .update({ active_until: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', ownerId);
    if (endError) {
      setError('Your Supplement Regimen could not be ended.');
    } else {
      setRegimens((current) => removeById(current, id));
      if (selectedRegimenId === id) {
        setSelectedRegimenId(null);
        setSupplementDraft(emptySupplementDraft);
      }
    }
    setIsSaving(false);
  }

  function editRegimen(regimen: SupplementRegimen): void {
    setSelectedRegimenId(regimen.id);
    setSupplementDraft({
      activeFrom: regimen.activeFrom.slice(0, 10),
      dose: regimen.dose,
      form: regimen.form,
      frequency: regimen.frequency,
      ingredient: regimen.ingredient
    });
  }

  return (
    <View style={styles.section}>
      <SectionHeading title="Your entries" />
      <Text style={typography.note}>
        Owner-entered readings and regimens stay source-backed in your private record.
      </Text>
      <Text accessibilityRole="header" style={styles.subheading}>
        Blood pressure
      </Text>
      <Field
        label="Date (YYYY-MM-DD)"
        value={bloodPressureDraft.date}
        onChangeText={(date) => setBloodPressureDraft((draft) => ({ ...draft, date }))}
      />
      <Field
        label="Systolic (mmHg)"
        keyboardType="number-pad"
        value={bloodPressureDraft.systolicMmhg}
        onChangeText={(systolicMmhg) => setBloodPressureDraft((draft) => ({ ...draft, systolicMmhg }))}
      />
      <Field
        label="Diastolic (mmHg)"
        keyboardType="number-pad"
        value={bloodPressureDraft.diastolicMmhg}
        onChangeText={(diastolicMmhg) => setBloodPressureDraft((draft) => ({ ...draft, diastolicMmhg }))}
      />
      <Field
        label="Pulse (optional)"
        keyboardType="number-pad"
        value={bloodPressureDraft.pulseBpm}
        onChangeText={(pulseBpm) => setBloodPressureDraft((draft) => ({ ...draft, pulseBpm }))}
      />
      <ActionButton disabled={isSaving} label="Save reading" onPress={saveBloodPressure} />
      {bloodPressureReadings.map((reading) => (
        <Text key={reading.id} style={styles.item}>
          {reading.recordedAt.slice(0, 10)} · {reading.systolicMmhg}/{reading.diastolicMmhg} mmHg
          {reading.pulseBpm ? ` · pulse ${reading.pulseBpm}` : ''}
        </Text>
      ))}
      <Text accessibilityRole="header" style={styles.subheading}>
        Active Supplement Regimens
      </Text>
      <Field
        label="Ingredient"
        value={supplementDraft.ingredient}
        onChangeText={(ingredient) => setSupplementDraft((draft) => ({ ...draft, ingredient }))}
      />
      <Field
        label="Form"
        value={supplementDraft.form}
        onChangeText={(form) => setSupplementDraft((draft) => ({ ...draft, form }))}
      />
      <Field
        label="Dose"
        value={supplementDraft.dose}
        onChangeText={(dose) => setSupplementDraft((draft) => ({ ...draft, dose }))}
      />
      <Field
        label="Frequency"
        value={supplementDraft.frequency}
        onChangeText={(frequency) => setSupplementDraft((draft) => ({ ...draft, frequency }))}
      />
      <Field
        label="Active from (YYYY-MM-DD)"
        value={supplementDraft.activeFrom}
        onChangeText={(activeFrom) => setSupplementDraft((draft) => ({ ...draft, activeFrom }))}
      />
      <ActionButton
        disabled={isSaving}
        label={selectedRegimenId ? 'Save changes' : 'Add Supplement Regimen'}
        onPress={saveSupplementRegimen}
      />
      {regimens.map((regimen) => (
        <View key={regimen.id} style={styles.regimen}>
          <Text style={styles.item}>
            {regimen.ingredient} · {regimen.dose} {regimen.form} · {regimen.frequency}
          </Text>
          <Text style={typography.meta}>Active since {regimen.activeFrom.slice(0, 10)}</Text>
          <View style={styles.row}>
            <ActionButton disabled={isSaving} label="Edit" onPress={() => editRegimen(regimen)} variant="secondary" />
            <ActionButton
              disabled={isSaving}
              label="End regimen"
              onPress={() => endRegimen(regimen.id)}
              variant="secondary"
            />
          </View>
        </View>
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

function Field({
  label,
  onChangeText,
  value,
  keyboardType = 'default'
}: {
  keyboardType?: 'default' | 'number-pad';
  label: string;
  onChangeText: (value: string) => void;
  value: string;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      keyboardType={keyboardType}
      onChangeText={onChangeText}
      placeholder={label}
      placeholderTextColor={colors.secondary}
      style={field.input}
      value={value}
    />
  );
}

const styles = StyleSheet.create({
  indicator: { marginTop: 12 },
  item: { ...typography.signal, lineHeight: 20 },
  regimen: { borderTopColor: colors.rule, borderTopWidth: 1, gap: 8, paddingTop: 12 },
  row: { flexDirection: 'row', gap: 8 },
  section: { gap: 12 },
  subheading: { ...typography.title, fontSize: 18, marginTop: 16 }
});
