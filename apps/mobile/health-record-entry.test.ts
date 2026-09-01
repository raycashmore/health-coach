import { describe, expect, it } from 'vitest';

import { buildBloodPressureReading, buildSupplementRegimen } from './health-record-entry';

describe('health record entry', () => {
  it('builds a source-backed owner blood-pressure reading', () => {
    expect(
      buildBloodPressureReading({
        date: '2026-09-01',
        diastolicMmhg: '80',
        pulseBpm: '65',
        systolicMmhg: '120'
      })
    ).toMatchObject({
      diastolicMmhg: 80,
      pulseBpm: 65,
      source: { kind: 'owner-entry', sourceIdentifier: 'android-blood-pressure' },
      systolicMmhg: 120
    });
  });

  it('rejects an invalid blood-pressure entry before persistence', () => {
    expect(
      buildBloodPressureReading({ date: 'invalid', diastolicMmhg: '0', pulseBpm: 'invalid', systolicMmhg: '120' })
    ).toBeNull();
    expect(
      buildBloodPressureReading({ date: '2026-02-30', diastolicMmhg: '80', pulseBpm: '', systolicMmhg: '120' })
    ).toBeNull();
  });

  it('builds a source-backed active Supplement Regimen', () => {
    expect(
      buildSupplementRegimen({
        activeFrom: '2026-09-01',
        dose: '200 mg',
        form: 'tablet',
        frequency: 'daily',
        ingredient: 'Example nutrient'
      })
    ).toMatchObject({
      ingredient: 'Example nutrient',
      source: { kind: 'owner-entry', sourceIdentifier: 'android-supplement-regimens' }
    });
  });
});
