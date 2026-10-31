import { afterEach, describe, expect, it, vi } from 'vitest';

const health = vi.hoisted(() => ({
  initialize: vi.fn(),
  getGrantedPermissions: vi.fn(),
  requestPermission: vi.fn(),
  aggregateRecord: vi.fn()
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('react-native-health-connect', () => health);
import { HealthConnectPermissionError, readWearableSnapshot } from './read-wearable-snapshot';

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
  it('preserves missing origins as missing data and converts native sleep seconds to minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T03:00:00Z'));
    health.initialize.mockResolvedValue(true);
    health.getGrantedPermissions.mockResolvedValue([]);
    health.requestPermission.mockResolvedValue([
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'SleepSession' }
    ]);
    health.aggregateRecord.mockImplementation(async ({ recordType }: { recordType: string }) =>
      recordType === 'Steps'
        ? { COUNT_TOTAL: 0, dataOrigins: [] }
        : { SLEEP_DURATION_TOTAL: 25200, dataOrigins: ['example.source'] }
    );
    const { snapshot } = await readWearableSnapshot();
    expect(snapshot.days.every((day) => day.steps === null)).toBe(true);
    expect(snapshot.days.every((day) => day.sleepMinutes?.value === 420)).toBe(true);
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
