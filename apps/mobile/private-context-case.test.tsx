import { act } from 'react';
import { createRoot } from 'test-renderer';
import type { Root, TestInstance } from 'test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WearableSnapshot } from '@health-coach/health-core/wearable-review';
import { shiftDate } from '@health-coach/health-core/wearable-review';
import type { ContextPacket } from '@health-coach/health-core/lab-context';
const { loadSyntheticContextPacket } = await vi.importActual<{
  loadSyntheticContextPacket: (ownerId: string, scenario: 'prepared') => Promise<ContextPacket>;
}>('../web/lib/lab-context/synthetic-packet');
const mocks = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn(), wearable: vi.fn() }));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}));
vi.mock('./supabase-client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
vi.mock('./read-wearable-snapshot', () => ({ readWearableSnapshot: mocks.wearable }));
import { PrivateContextCase } from './private-context-case';
import { privateCaseActivity } from './read-private-context';

let root: Root;
const snapshot: WearableSnapshot = {
  timeZone: 'Australia/Sydney',
  completedBefore: '2026-01-23',
  syncedAt: '2026-01-23T00:00:00Z',
  sleepGrouping: 'next-wake-day',
  days: Array.from({ length: 21 }, (_, index) => ({
    date: shiftDate('2026-01-23', index - 21),
    steps:
      index === 7 ? { value: 0, origins: ['generic-source'] } : { value: index * 100, origins: ['generic-source'] },
    sleepMinutes: { value: 400 + index, origins: ['generic-source'] }
  }))
};
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubEnv('EXPO_PUBLIC_HEALTH_COACH_API_URL', 'http://example.invalid');
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'test-only' } } });
  mocks.wearable.mockResolvedValue({ snapshot, blocked: [] });
  const packet = await loadSyntheticContextPacket('00000000-0000-4000-8000-000000000001', 'prepared');
  packet.kind = 'private-context';
  packet.limitations = ['Prepared private evidence only. No AI interpretation or health recommendation.'];
  mocks.fetch.mockImplementation(async () => Response.json(packet));
  root = createRoot();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
function text(node: TestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');
}
function content() {
  return root.container
    .queryAll((node) => node.type === 'Text')
    .map(text)
    .join('\n');
}
async function press(label: string) {
  const button = root.container.queryAll((node) => node.type === 'Pressable' && text(node) === label)[0];
  const onPress: unknown = button?.props.onPress;
  if (typeof onPress !== 'function') throw new Error(`Expected action: ${label}`);
  await act(async () => {
    onPress();
  });
}

it('keeps steps on their activity date and next-wake sleep on its wake date, excluding today', () => {
  const activity = privateCaseActivity(snapshot);
  expect(activity.timeZone).toBe(snapshot.timeZone);
  expect(activity.days).toHaveLength(14);
  expect(activity.days[0]).toEqual({ date: '2026-01-09', steps: 0, sleepMinutes: 406 });
  expect(activity.days.at(-1)).toEqual({ date: '2026-01-22', steps: 2000, sleepMinutes: 419 });
  expect(activity.days.some((day) => day.date === snapshot.completedBefore)).toBe(false);
  const legacy = privateCaseActivity({ ...snapshot, sleepGrouping: undefined });
  expect(legacy.days[0]?.sleepMinutes).toBe(407);
});
it('loads only on request and sends exactly the recent bounded values with the verified session', async () => {
  await act(async () => root.render(<PrivateContextCase />));
  expect(mocks.fetch).not.toHaveBeenCalled();
  await press('Load private case');
  expect(mocks.wearable).toHaveBeenCalledOnce();
  expect(mocks.fetch).toHaveBeenCalledWith(
    'http://example.invalid/api/lab-context/private',
    expect.objectContaining({
      method: 'POST',
      headers: { Authorization: 'Bearer test-only', 'Content-Type': 'application/json' },
      body: JSON.stringify({ activity: privateCaseActivity(snapshot) }),
      cache: 'no-store'
    })
  );
  expect(content()).toContain('Prepared private case');
  expect(content()).toContain('Limits of this packet');
  expect(content()).toContain('synthetic-result-1');
});
it('submits unavailable activity when the native read fails and still loads prepared sources', async () => {
  mocks.wearable.mockRejectedValueOnce(new Error('native unavailable'));
  const packet = await loadSyntheticContextPacket('00000000-0000-4000-8000-000000000001', 'prepared');
  mocks.fetch.mockResolvedValueOnce(
    Response.json({ ...packet, kind: 'private-context', activityStatus: 'unavailable', windows: [] })
  );
  await act(async () => root.render(<PrivateContextCase />));
  await press('Load private case');
  expect(mocks.fetch).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ body: '{"activity":null}' }));
  expect(content()).toContain('Example marker 1:');
  expect(content()).toContain('Activity source unavailable. No values or coverage were used.');
});
it('clears prior evidence immediately on reload and keeps it hidden after a failed source check', async () => {
  await act(async () => root.render(<PrivateContextCase />));
  await press('Load private case');
  let reject: (error: Error) => void = () => {
    throw new Error('Expected pending fetch');
  };
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  await press('Reload private case');
  expect(content()).not.toContain('Example marker 1:');
  await act(async () => reject(new Error('Source verification failed.')));
  expect(content()).toContain('Source verification failed.');
  expect(content()).not.toContain('routine may have changed');
});
it('hides release controls and avoids native/file requests before sign-in; rejects unverified responses', async () => {
  vi.stubGlobal('__DEV__', false);
  await act(async () => root.render(<PrivateContextCase />));
  expect(content()).toBe('');
  vi.stubGlobal('__DEV__', true);
  mocks.session.mockResolvedValueOnce({ data: { session: null } });
  await act(async () => root.render(<PrivateContextCase />));
  await press('Load private case');
  expect(mocks.wearable).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.fetch.mockResolvedValueOnce(
    Response.json({ kind: 'private-context', notes: { sections: [{ text: 'unverified passage' }] } })
  );
  await press('Load private case');
  expect(content()).toContain('The private evidence response could not be verified.');
  expect(content()).not.toContain('unverified passage');
});
