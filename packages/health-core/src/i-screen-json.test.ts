import { describe, expect, it } from 'vitest';

import { parseIScreenJson } from './i-screen-json.js';

describe('parseIScreenJson', () => {
  it('imports only normalized numeric observations and ignores unrelated personal data', () => {
    expect(
      parseIScreenJson([
        {
          collectedDate: '2025-02-14T00:00:00.000Z',
          result: {
            recommendations: [{ title: 'Ignored' }],
            segments: [
              {
                observations: [
                  { label: 'Example marker', range: { max: 8, min: 4 }, units: 'mmol/L', value: '5.2' },
                  { label: 'Unmeasured marker', range: { max: null, min: null }, units: 'mg/dL', value: ' ' }
                ]
              }
            ]
          },
          user: { email: 'owner@example.invalid' }
        }
      ])
    ).toEqual({
      ignoredObservationCount: 1,
      observations: [
        {
          recordedAt: '2025-02-14T00:00:00.000Z',
          referenceRange: '4 - 8',
          testName: 'Example marker',
          unit: 'mmol/L',
          value: 5.2
        }
      ]
    });
  });

  it('rejects invalid exports without exposing their contents', () => {
    expect(() => parseIScreenJson([])).toThrow('not a supported');
  });
});
