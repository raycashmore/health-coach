import { act } from 'react';
import { createRoot } from 'test-renderer';
import type { Root, TestInstance } from 'test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dateInZone, shiftDate } from '@health-coach/health-core/wearable-review';

const mocks = vi.hoisted(() => ({ read: vi.fn(), session: vi.fn(), fetch: vi.fn() }));
vi.mock('react-native', () => ({
  Button: 'Button',
  ScrollView: 'ScrollView',
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

async function press(title: string) {
  const button = root.container.queryAll((node) => node.type === 'Button' && node.props.title === title)[0];
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
    .queryAll((node) => node.type === 'Text' || node.type === 'Button')
    .map((node) => (node.type === 'Button' ? String(node.props.title) : text(node)));
  const action = labels.indexOf('Explain these changes with AI');
  expect(action).toBeGreaterThan(-1);
  expect(labels.slice(action - 1, action + 2)).toContain(error);
  expect(root.container.queryAll((node) => node.props.role === 'alert').map(text)).toEqual([error]);
  expect(labels.some((label) => label.startsWith('Recent: 5000'))).toBe(true);
  expect(mocks.fetch).toHaveBeenCalledOnce();
});
