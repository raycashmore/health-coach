import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const health = vi.hoisted(() => ({
  initialize: vi.fn(),
  getGrantedPermissions: vi.fn(),
  requestPermission: vi.fn(),
  readRecords: vi.fn(),
  aggregateRecord: vi.fn()
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('react-native-health-connect', () => health);
import { HealthConnectPermissionError, readWearableSnapshot } from './read-wearable-snapshot';

beforeEach(() => {
  health.readRecords.mockResolvedValue({ records: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe('foreground wearable read', () => {
  it('handles denied permissions without reading measurements', async () => {
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([]);
    health.requestPermission.mockResolvedValue([]);
    await expect(readWearableSnapshot()).rejects.toThrow(HealthConnectPermissionError);
    expect(health.aggregateRecord).not.toHaveBeenCalled();
  });
  it('reads without prompting once access is granted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T03:00:00Z'));
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'SleepSession' }
    ]);
    health.aggregateRecord.mockResolvedValue({ COUNT_TOTAL: 5000, SLEEP_DURATION_TOTAL: 0, dataOrigins: [] });
    const { blocked } = await readWearableSnapshot();
    expect(health.requestPermission).not.toHaveBeenCalled();
    expect(blocked).toEqual([]);
  });
  it('keeps a partial grant without prompting again and reports the blocked metric', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T03:00:00Z'));
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    health.aggregateRecord.mockResolvedValue({ COUNT_TOTAL: 5000, dataOrigins: ['example.source'] });
    const { blocked, snapshot } = await readWearableSnapshot();
    expect(health.requestPermission).not.toHaveBeenCalled();
    expect(blocked).toEqual(['sleepMinutes']);
    expect(snapshot.days.every((day) => day.sleepMinutes === null)).toBe(true);
  });
  it('preserves missing origins as missing data and assigns complete sleep sessions to the day they end', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T03:00:00Z'));
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([]);
    health.requestPermission.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'SleepSession' }
    ]);
    health.readRecords.mockResolvedValue({
      records: [{ startTime: '2026-10-25T23:00:00Z', endTime: '2026-10-26T06:00:00Z' }]
    });
    health.aggregateRecord.mockImplementation(async ({ recordType }: { recordType: string }) =>
      recordType === 'Steps'
        ? { COUNT_TOTAL: 0, dataOrigins: [] }
        : { SLEEP_DURATION_TOTAL: 25200, dataOrigins: ['example.source'] }
    );
    const { snapshot } = await readWearableSnapshot();
    expect(snapshot.days.every((day) => day.steps === null)).toBe(true);
    expect(snapshot.days.find((day) => day.date === '2026-10-25')?.sleepMinutes?.value).toBe(420);
    expect(snapshot.days.find((day) => day.date === '2026-10-26')?.sleepMinutes).toBeNull();
    expect(snapshot.days.at(-1)?.date).not.toBe(snapshot.completedBefore);
  });
  it('prefers Fit steps and falls back to the merged total when Fit has no records', async () => {
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    let day = 0;
    health.aggregateRecord.mockImplementation(async (request: { dataOriginFilter?: string[] }) => {
      if (request.dataOriginFilter) {
        day += 1;
        return day === 1
          ? { COUNT_TOTAL: 4000, dataOrigins: ['com.google.android.apps.fitness'] }
          : { COUNT_TOTAL: 0, dataOrigins: [] };
      }
      return { COUNT_TOTAL: 5000, dataOrigins: ['example.other'] };
    });
    const { snapshot } = await readWearableSnapshot();
    expect(snapshot.days[0]?.steps).toEqual({ value: 4000, origins: ['com.google.android.apps.fitness'] });
    expect(snapshot.days[1]?.steps).toEqual({ value: 5000, origins: ['example.other'] });
  });
  it('deduplicates overlapping sessions, groups naps by wake day and reads every page', async () => {
    vi.stubEnv('TZ', 'UTC');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'SleepSession' }]);
    health.readRecords
      .mockResolvedValueOnce({
        records: [
          { startTime: '2026-10-25T23:00:00Z', endTime: '2026-10-26T06:30:00Z' },
          { startTime: '2026-10-25T23:15:00Z', endTime: '2026-10-25T23:55:00Z' }
        ],
        pageToken: 'next'
      })
      .mockResolvedValueOnce({
        records: [
          { startTime: '2026-10-25T23:30:00Z', endTime: '2026-10-26T06:30:00Z' },
          { startTime: '2026-10-26T13:00:00Z', endTime: '2026-10-26T14:00:00Z' },
          { startTime: '2026-10-27T23:00:00Z', endTime: '2026-10-28T06:00:00Z' }
        ]
      });
    health.aggregateRecord
      .mockResolvedValueOnce({ SLEEP_DURATION_TOTAL: 25200, dataOrigins: ['example.watch'] })
      .mockResolvedValueOnce({ SLEEP_DURATION_TOTAL: 3600, dataOrigins: ['example.nap'] })
      .mockResolvedValueOnce({ SLEEP_DURATION_TOTAL: 25200, dataOrigins: ['example.watch'] });
    const { snapshot } = await readWearableSnapshot();
    expect(snapshot.days.find((day) => day.date === '2026-10-25')?.sleepMinutes).toEqual({
      value: 480,
      origins: ['example.nap', 'example.watch']
    });
    expect(health.readRecords).toHaveBeenCalledTimes(2);
    expect(snapshot.days.at(-1)?.sleepMinutes?.value).toBe(420);
    expect(health.aggregateRecord).toHaveBeenCalledTimes(3);
    expect(health.aggregateRecord.mock.calls[0]?.[0].timeRangeFilter).toMatchObject({
      startTime: '2026-10-25T23:00:00.000Z',
      endTime: '2026-10-26T06:30:00.000Z'
    });
  });
  it('leaves both wake days missing if overlapping sources disagree about the day', async () => {
    vi.stubEnv('TZ', 'UTC');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'SleepSession' }]);
    health.readRecords.mockResolvedValue({
      records: [
        { startTime: '2026-10-25T22:00:00Z', endTime: '2026-10-25T23:50:00Z' },
        { startTime: '2026-10-25T22:10:00Z', endTime: '2026-10-26T00:10:00Z' },
        { startTime: '2026-10-26T13:00:00Z', endTime: '2026-10-26T14:00:00Z' },
        { startTime: '2026-10-26T23:00:00Z', endTime: '2026-10-27T06:30:00Z' },
        { startTime: '2026-10-26T23:15:00Z', endTime: '2026-10-26T23:55:00Z' }
      ]
    });
    health.aggregateRecord.mockResolvedValue({ SLEEP_DURATION_TOTAL: 25200, dataOrigins: ['example.watch'] });
    const { snapshot } = await readWearableSnapshot();
    expect(snapshot.days.find((day) => day.date === '2026-10-24')?.sleepMinutes).toBeNull();
    expect(snapshot.days.find((day) => day.date === '2026-10-25')?.sleepMinutes).toBeNull();
    expect(snapshot.days.find((day) => day.date === '2026-10-26')?.sleepMinutes?.value).toBe(420);
    expect(health.aggregateRecord).toHaveBeenCalledTimes(1);
  });
  it('stops when Health Connect repeats a sleep page token', async () => {
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([{ accessType: 'read', recordType: 'SleepSession' }]);
    health.readRecords.mockResolvedValue({ records: [], pageToken: 'repeated' });
    await expect(readWearableSnapshot()).rejects.toThrow('repeated a sleep data page');
  });
  it('uses calendar-day boundaries across a daylight-saving transition', async () => {
    vi.stubEnv('TZ', 'Australia/Sydney');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T03:00:00Z'));
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([]);
    health.requestPermission.mockResolvedValue([{ accessType: 'read', recordType: 'Steps' }]);
    health.aggregateRecord.mockResolvedValue({ COUNT_TOTAL: 5000, dataOrigins: ['example.source'] });
    await readWearableSnapshot();
    const intervals = health.aggregateRecord.mock.calls.map(
      ([request]) => request.timeRangeFilter as { startTime: string; endTime: string }
    );
    expect(
      intervals.some((value) => Date.parse(value.endTime) - Date.parse(value.startTime) === 23 * 60 * 60 * 1000)
    ).toBe(true);
  });
});
