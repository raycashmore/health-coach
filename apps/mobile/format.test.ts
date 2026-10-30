import { expect, it } from 'vitest';
import { formatChange, formatDate, formatDateRange, formatMetric, formatTime } from './format';

it('formats calendar dates as is and timestamps by their local day', () => {
  expect(formatDate('2026-10-27', 2026)).toBe('27 Oct');
  expect(formatDate(new Date(2025, 0, 3, 0, 30).toISOString(), 2026)).toBe('3 Jan 2025');
});

it('formats date ranges compactly', () => {
  expect(formatDateRange('2026-10-27', '2026-10-29', 2026)).toBe('27–29 Oct');
  expect(formatDateRange('2026-10-30', '2026-11-02', 2026)).toBe('30 Oct – 2 Nov');
  expect(formatDateRange('2026-12-29', '2027-01-02', 2027)).toBe('29 Dec 2026 – 2 Jan');
});

it('formats a read time on a twelve-hour clock', () => {
  expect(formatTime(new Date(2026, 9, 30, 18, 4))).toBe('6:04 pm');
  expect(formatTime(new Date(2026, 9, 30, 0, 30))).toBe('12:30 am');
});

it('formats steps with grouping and sleep as hours and minutes', () => {
  expect(formatMetric('steps', 6274.9)).toBe('6,275');
  expect(formatMetric('sleepMinutes', 479.3)).toBe('7h 59m');
  expect(formatMetric('sleepMinutes', 480)).toBe('8h');
  expect(formatMetric('sleepMinutes', 45)).toBe('45m');
});

it('derives signed changes from the displayed values', () => {
  expect(formatChange('steps', 6274.9, 8337)).toBe('+2,062');
  expect(formatChange('steps', 8000, 6796)).toBe('−1,204');
  expect(formatChange('sleepMinutes', 401.7, 479.3)).toBe('+1h 17m');
  expect(formatChange('sleepMinutes', 450, 425)).toBe('−25m');
  expect(formatChange('steps', 5000, 5000.2)).toBe('0');
});
