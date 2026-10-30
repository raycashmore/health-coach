import { act } from 'react';
import { createRoot } from 'test-renderer';
import type { Root, TestInstance } from 'test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dateInZone, shiftDate } from '@health-coach/health-core/wearable-review';

const mocks = vi.hoisted(() => ({ read: vi.fn(), session: vi.fn(), fetch: vi.fn() }));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View'
}));
vi.mock('./read-wearable-snapshot', () => ({ readWearableSnapshot: mocks.read }));
vi.mock('./supabase-client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { DailyGuidanceScreen } from './daily-guidance-screen';

let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubEnv('EXPO_PUBLIC_HEALTH_COACH_API_URL', 'http://example.invalid');
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

function buttonLabel(node: TestInstance): string | null {
  return node.type === 'Pressable' && node.props.accessibilityRole === 'button' ? text(node) : null;
}

async function press(title: string) {
  const button = root.container.queryAll((node) => buttonLabel(node) === title)[0];
  const onPress: unknown = button?.props.onPress;
  if (typeof onPress !== 'function') throw new Error('Expected an available action.');
  await act(async () => {
    onPress();
  });
}

it('shows a rejected explanation beside its action and leaves the calculated evidence available', async () => {
  const now = new Date();
  const completedBefore = dateInZone(now, 'UTC');
  mocks.read.mockResolvedValue({
    timeZone: 'UTC',
    completedBefore,
    syncedAt: now.toISOString(),
    days: Array.from({ length: 21 }, (_, index) => ({
      date: shiftDate(completedBefore, index - 21),
      steps: { value: 5000, origins: ['example.source'] },
      sleepMinutes: null
    }))
  });
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'test-only' } } });
  const error = 'The model service is unavailable. Your comparison is still available.';
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error }), { status: 503 }));
  await act(async () => {
    root.render(<DailyGuidanceScreen />);
  });
  await press('Read wearable data');
  await press('Explain these changes with AI');
  const labels = root.container
    .queryAll((node) => (node.type === 'Text' && node.parent?.type !== 'Pressable') || buttonLabel(node) !== null)
    .map(text);
  const action = labels.indexOf('Explain these changes with AI');
  expect(action).toBeGreaterThan(-1);
  expect(labels.slice(action - 1, action + 2)).toContain(error);
  expect(root.container.queryAll((node) => node.props.role === 'alert').map(text)).toEqual([error]);
  const headers = root.container.queryAll((node) => node.props.accessibilityRole === 'header').map(text);
  expect(headers).toContain('No display threshold crossed in the comparable signals.');
  expect(headers).toContain('Steps');
  expect(labels.some((label) => label.startsWith('5000 → 5000 steps/day average'))).toBe(true);
  expect(mocks.fetch).toHaveBeenCalledOnce();
});

it('keeps coverage detail one step away behind the sources disclosure', async () => {
  const now = new Date();
  const completedBefore = dateInZone(now, 'UTC');
  mocks.read.mockResolvedValue({
    timeZone: 'UTC',
    completedBefore,
    syncedAt: now.toISOString(),
    days: Array.from({ length: 21 }, (_, index) => ({
      date: shiftDate(completedBefore, index - 21),
      steps: { value: 5000, origins: ['example.source'] },
      sleepMinutes: null
    }))
  });
  await act(async () => {
    root.render(<DailyGuidanceScreen />);
  });
  await press('Read wearable data');
  const coverage = () => root.container.queryAll((node) => node.type === 'Text' && text(node).startsWith('Steps: '));
  expect(coverage()).toHaveLength(0);
  await press('Sources →');
  expect(coverage().map(text)[0]).toContain('Sources: example.source');
  await press('Hide sources');
  expect(coverage()).toHaveLength(0);
});
