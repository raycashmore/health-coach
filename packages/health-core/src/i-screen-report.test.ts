import { describe, expect, it } from 'vitest';

import { parseIScreenReport } from './i-screen-report.js';

const reportItems = [
  { page: 1, text: 'Sample date: 23/08/2026', x: 48, y: 600 },
  { page: 7, text: 'Test name', x: 48, y: 672 },
  { page: 7, text: 'Reference range', x: 366, y: 672 },
  { page: 7, text: 'Result', x: 469, y: 672 },
  { page: 7, text: 'Example marker*', x: 48, y: 660 },
  { page: 7, text: '4.0 - 8.0', x: 366, y: 660 },
  { page: 7, text: '5.2 mmol/L', x: 469, y: 660 },
  { page: 7, text: 'Another marker', x: 48, y: 648 },
  { page: 7, text: '10 - 20', x: 366, y: 648 },
  { page: 7, text: '14 mg/dL', x: 469, y: 648 }
];

describe('parseIScreenReport', () => {
  it('normalizes tabular lab results with their collection date and reference range', () => {
    expect(parseIScreenReport(reportItems)).toEqual([
      {
        recordedAt: '2026-08-23T00:00:00.000Z',
        referenceRange: '4.0 - 8.0',
        testName: 'Example marker',
        unit: 'mmol/L',
        value: 5.2
      },
      {
        recordedAt: '2026-08-23T00:00:00.000Z',
        referenceRange: '10 - 20',
        testName: 'Another marker',
        unit: 'mg/dL',
        value: 14
      }
    ]);
  });

  it('rejects reports that do not contain a collection date or supported results', () => {
    expect(() => parseIScreenReport([])).toThrow('collection date');
    expect(() => parseIScreenReport([{ page: 1, text: 'Sample date: 23/08/2026', x: 48, y: 600 }])).toThrow(
      'supported lab results'
    );
  });

  it('accepts year-first collection dates', () => {
    expect(
      parseIScreenReport([
        { page: 1, text: 'Sample date: 2026/08/03', x: 48, y: 600 },
        { page: 7, text: 'Example marker', x: 48, y: 660 },
        { page: 7, text: '4.0 - 8.0', x: 366, y: 660 },
        { page: 7, text: '5.2 mmol/L', x: 469, y: 660 }
      ])
    ).toMatchObject([{ recordedAt: '2026-08-03T00:00:00.000Z' }]);
  });

  it('accepts month-first collection dates when the day is unambiguous', () => {
    expect(
      parseIScreenReport([
        { page: 1, text: 'Collection date: 08/23/2026', x: 48, y: 600 },
        { page: 7, text: 'Example marker', x: 48, y: 660 },
        { page: 7, text: '4.0 - 8.0', x: 366, y: 660 },
        { page: 7, text: '5.2 mmol/L', x: 469, y: 660 }
      ])
    ).toMatchObject([{ recordedAt: '2026-08-23T00:00:00.000Z' }]);
  });

  it('accepts written English collection dates', () => {
    expect(
      parseIScreenReport([
        { page: 1, text: 'Collection date: 14 Feb 2025', x: 48, y: 600 },
        { page: 7, text: 'Example marker', x: 48, y: 660 },
        { page: 7, text: '4.0 - 8.0', x: 366, y: 660 },
        { page: 7, text: '5.2 mmol/L', x: 469, y: 660 }
      ])
    ).toMatchObject([{ recordedAt: '2025-02-14T00:00:00.000Z' }]);
  });
});
