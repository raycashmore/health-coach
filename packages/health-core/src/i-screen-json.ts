import { z } from 'zod';

const iScreenExportSchema = z.array(
  z.object({
    collectedDate: z.string(),
    result: z.object({
      segments: z.array(
        z.object({
          observations: z.array(
            z.object({
              label: z.string().min(1),
              range: z
                .object({ min: z.number().nullable().optional(), max: z.number().nullable().optional() })
                .optional(),
              units: z.string().nullable().optional(),
              value: z.string()
            })
          )
        })
      )
    })
  })
);

export type IScreenJsonLabResult = {
  recordedAt: string;
  referenceRange?: string;
  testName: string;
  unit: string;
  value: number;
};

export type IScreenJsonImport = {
  ignoredObservationCount: number;
  observations: IScreenJsonLabResult[];
};

function parseRecordedAt(collectionDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(collectionDate)) {
    throw new Error('The I-Screen JSON does not contain a valid collection date.');
  }

  const recordedAt = new Date(collectionDate);

  if (Number.isNaN(recordedAt.getTime())) {
    throw new Error('The I-Screen JSON does not contain a valid collection date.');
  }

  return recordedAt.toISOString();
}

function formatReferenceRange(range: { max?: number | null; min?: number | null } | undefined): string | undefined {
  if (range?.min == null && range?.max == null) {
    return undefined;
  }

  if (range.min == null) {
    return `≤ ${range.max}`;
  }

  if (range.max == null) {
    return `≥ ${range.min}`;
  }

  return `${range.min} - ${range.max}`;
}

export function parseIScreenJson(value: unknown): IScreenJsonImport {
  const reports = iScreenExportSchema.safeParse(value);

  if (!reports.success || reports.data.length === 0) {
    throw new Error('The file is not a supported I-Screen JSON export.');
  }

  let ignoredObservationCount = 0;
  const observations = reports.data.flatMap((report) => {
    const recordedAt = parseRecordedAt(report.collectedDate);

    return report.result.segments.flatMap((segment) =>
      segment.observations.flatMap((observation): IScreenJsonLabResult[] => {
        const valueText = observation.value.trim();
        const value = Number(valueText);
        const unit = observation.units?.trim();

        if (!valueText || !Number.isFinite(value) || !unit) {
          ignoredObservationCount += 1;
          return [];
        }

        const referenceRange = formatReferenceRange(observation.range);

        return [
          {
            ...(referenceRange ? { referenceRange } : {}),
            recordedAt,
            testName: observation.label.trim(),
            unit,
            value
          }
        ];
      })
    );
  });

  if (observations.length === 0) {
    throw new Error('The I-Screen JSON does not contain supported lab results.');
  }

  return { ignoredObservationCount, observations };
}
