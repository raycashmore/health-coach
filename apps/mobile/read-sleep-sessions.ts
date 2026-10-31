import { dateInZone } from '@health-coach/health-core/wearable-review';
import type { WearableSnapshot } from '@health-coach/health-core/wearable-review';

type HealthConnect = typeof import('react-native-health-connect');
type Interval = { start: number; end: number };
type SleepGroup = Interval & { endDays: Set<string>; records: Interval[] };
type SleepMeasurement = NonNullable<WearableSnapshot['days'][number]['sleepMinutes']>;

export async function readSleepByWakeDay(
  health: HealthConnect,
  midnight: Date,
  now: Date,
  timeZone: string
): Promise<Map<string, SleepMeasurement>> {
  const start = new Date(midnight);
  start.setDate(start.getDate() - 22);
  const timeRangeFilter = {
    operator: 'between',
    startTime: start.toISOString(),
    endTime: now.toISOString()
  } as const;
  const intervals: Interval[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  do {
    const result = await health.readRecords('SleepSession', { timeRangeFilter, pageToken });
    for (const record of result.records) {
      const begin = Date.parse(record.startTime);
      const end = Date.parse(record.endTime);
      if (Number.isFinite(begin) && Number.isFinite(end) && begin < end && end <= now.getTime()) {
        intervals.push({ start: begin, end });
      }
    }
    pageToken = result.pageToken || undefined;
    if (pageToken && seenTokens.has(pageToken)) throw new Error('Health Connect repeated a sleep data page.');
    if (pageToken) seenTokens.add(pageToken);
  } while (pageToken);

  // Aggregate each overlapping group once so Health Connect applies the owner's source priority.
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);
  const groups: SleepGroup[] = [];
  for (const interval of intervals) {
    const previous = groups.at(-1);
    const endDay = dateInZone(new Date(interval.end), timeZone);
    if (previous && interval.start < previous.end) {
      previous.end = Math.max(previous.end, interval.end);
      previous.endDays.add(endDay);
      previous.records.push(interval);
    } else groups.push({ ...interval, endDays: new Set([endDay]), records: [interval] });
  }
  // A whole session can contain another source's partial records; use that session's end.
  // Other cross-day overlaps have no unambiguous wake day, so omit both days.
  const ambiguousDays = new Set(
    groups
      .filter(
        (group) =>
          group.endDays.size > 1 &&
          !group.records.some((record) => record.start === group.start && record.end === group.end)
      )
      .flatMap((group) => [...group.endDays])
  );
  const days = new Map<string, SleepMeasurement>();
  for (const group of groups) {
    const date = dateInZone(new Date(group.end), timeZone);
    if (ambiguousDays.has(date)) continue;
    const result = await health.aggregateRecord({
      recordType: 'SleepSession',
      timeRangeFilter: {
        operator: 'between',
        startTime: new Date(group.start).toISOString(),
        endTime: new Date(group.end).toISOString()
      }
    });
    if (!result.dataOrigins.length) continue;
    const previous = days.get(date);
    days.set(date, {
      value: (previous?.value ?? 0) + result.SLEEP_DURATION_TOTAL / 60,
      origins: [...new Set([...(previous?.origins ?? []), ...result.dataOrigins])].sort()
    });
  }
  return days;
}
