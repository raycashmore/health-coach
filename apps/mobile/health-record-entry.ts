import {
  bloodPressureReadingSchema,
  supplementRegimenSchema,
  type BloodPressureReading,
  type SupplementRegimen
} from '@health-coach/health-core';

export type BloodPressureDraft = {
  date: string;
  diastolicMmhg: string;
  pulseBpm: string;
  systolicMmhg: string;
};

export type SupplementRegimenDraft = {
  activeFrom: string;
  dose: string;
  form: string;
  frequency: string;
  ingredient: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function dateToIso(value: string): string | null {
  if (!datePattern.test(value)) {
    return null;
  }

  const date = new Date(`${value}T12:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(value.slice(0, 4)) ||
    date.getUTCMonth() !== Number(value.slice(5, 7)) - 1 ||
    date.getUTCDate() !== Number(value.slice(8, 10))
  ) {
    return null;
  }

  return date.toISOString();
}

function positiveInteger(value: string): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function ownerEntrySource(sourceIdentifier: string, observedAt: string) {
  return {
    importedAt: new Date().toISOString(),
    kind: 'owner-entry' as const,
    observedAt,
    provider: 'Owner entry',
    sourceIdentifier,
    verificationState: 'verified' as const
  };
}

export function buildBloodPressureReading(draft: BloodPressureDraft): BloodPressureReading | null {
  const recordedAt = dateToIso(draft.date);
  const systolicMmhg = positiveInteger(draft.systolicMmhg);
  const diastolicMmhg = positiveInteger(draft.diastolicMmhg);
  const pulseBpm = draft.pulseBpm ? positiveInteger(draft.pulseBpm) : undefined;

  if (!recordedAt || !systolicMmhg || !diastolicMmhg || (draft.pulseBpm && !pulseBpm)) {
    return null;
  }

  const result = bloodPressureReadingSchema.safeParse({
    diastolicMmhg,
    pulseBpm,
    recordedAt,
    source: ownerEntrySource('android-blood-pressure', recordedAt),
    systolicMmhg
  });

  return result.success ? result.data : null;
}

export function buildSupplementRegimen(draft: SupplementRegimenDraft): SupplementRegimen | null {
  const activeFrom = dateToIso(draft.activeFrom);

  if (!activeFrom) {
    return null;
  }

  const result = supplementRegimenSchema.safeParse({
    activeFrom,
    dose: draft.dose.trim(),
    form: draft.form.trim(),
    frequency: draft.frequency.trim(),
    ingredient: draft.ingredient.trim(),
    source: ownerEntrySource('android-supplement-regimens', activeFrom)
  });

  return result.success ? result.data : null;
}
