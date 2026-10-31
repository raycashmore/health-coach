import { act } from 'react';
import { createRoot } from 'test-renderer';
import type { Root, TestInstance } from 'test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dateInZone, shiftDate } from '@health-coach/health-core/wearable-review';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  session: vi.fn(),
  fetch: vi.fn(),
  openSettings: vi.fn(),
  PermissionError: class extends Error {}
}));
vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  Keyboard: { addListener: () => ({ remove: () => undefined }), isVisible: () => false },
  Pressable: 'Pressable',
  RefreshControl: 'RefreshControl',
  ScrollView: 'ScrollView',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  TextInput: 'TextInput',
  View: 'View'
}));
vi.mock('./read-wearable-snapshot', () => ({
  HealthConnectPermissionError: mocks.PermissionError,
  openHealthConnectSettings: mocks.openSettings,
  readWearableSnapshot: mocks.read
}));
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

/** A current read with steady steps and no sleep records; blocked metrics have no read access. */
function stepsOnlyRead(blocked: string[] = []) {
  const now = new Date();
  const completedBefore = dateInZone(now, 'UTC');
  return {
    blocked,
    snapshot: {
      timeZone: 'UTC',
      completedBefore,
      syncedAt: now.toISOString(),
      days: Array.from({ length: 21 }, (_, index) => ({
        date: shiftDate(completedBefore, index - 21),
        steps: { value: 5000, origins: ['example.source'] },
        sleepMinutes: null
      }))
    }
  };
}

function texts(): string[] {
  return root.container.queryAll((node) => node.type === 'Text').map(text);
}

it('shows a rejected explanation beside its action and leaves the calculated evidence available', async () => {
  mocks.read.mockResolvedValue(stepsOnlyRead());
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'test-only' } } });
  const error = 'The model service is unavailable. Your comparison is still available.';
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error }), { status: 503 }));
  await act(async () => {
    root.render(<DailyGuidanceScreen />);
  });
  await press('Explain with AI');
  const labels = root.container
    .queryAll((node) => (node.type === 'Text' && node.parent?.type !== 'Pressable') || buttonLabel(node) !== null)
    .map(text);
  const action = labels.indexOf('Explain with AI');
  expect(action).toBeGreaterThan(-1);
  expect(labels.slice(action - 1, action + 2)).toContain(error);
  expect(root.container.queryAll((node) => node.props.role === 'alert').map(text)).toEqual([error]);
  const headers = root.container.queryAll((node) => node.props.accessibilityRole === 'header').map(text);
  expect(headers).toContain('No large change from your baseline.');
  expect(headers).toContain('Steps');
  expect(labels).toContain('5,000 → 5,000 a day');
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(mocks.fetch).toHaveBeenCalledOnce();
});

it('shows a concise explanation without requiring a caveat or follow-up question', async () => {
  mocks.read.mockResolvedValue(stepsOnlyRead());
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'test-only' } } });
  mocks.fetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        kind: 'ai',
        reviewId: 'example-review',
        explanation: {
          observation: 'Recorded steps were steady.',
          evidenceIds: ['steps'],
          uncertainty: null,
          contextQuestion: null
        }
      })
    )
  );
  await act(async () => root.render(<DailyGuidanceScreen />));
  await press('Explain with AI');
  expect(texts()).toContain('Recorded steps were steady.');
  expect(root.container.queryAll((node) => node.props.role === 'alert')).toHaveLength(0);
});

it('keeps coverage detail one step away behind the sources disclosure', async () => {
  mocks.read.mockResolvedValue(stepsOnlyRead());
  await act(async () => {
    root.render(<DailyGuidanceScreen />);
  });
  const coverage = () => root.container.queryAll((node) => node.type === 'Text' && text(node).startsWith('Steps · '));
  expect(coverage()).toHaveLength(0);
  await press('Sources →');
  expect(coverage().map(text)[0]).toBe('Steps · 21 of 21 days · example.source');
  await press('Hide sources');
  expect(coverage()).toHaveLength(0);
});

it('reads automatically and offers Health Connect when access is off', async () => {
  mocks.read.mockRejectedValue(new mocks.PermissionError('Steps and sleep access is off.'));
  await act(async () => {
    root.render(<DailyGuidanceScreen />);
  });
  const headers = root.container.queryAll((node) => node.props.accessibilityRole === 'header').map(text);
  expect(headers).toContain('Steps and sleep access is off.');
  await press('Open Health Connect');
  expect(mocks.openSettings).toHaveBeenCalledOnce();
});

it('says when a metric has no read access instead of reporting missing days', async () => {
  mocks.read.mockResolvedValue(stepsOnlyRead(['sleepMinutes']));
  await act(async () => {
    root.render(<DailyGuidanceScreen />);
  });
  expect(texts()).toContain('Sleep access is off.');
  expect(texts().some((value) => value.startsWith('Sleep: '))).toBe(false);
  await press('Open Health Connect');
  expect(mocks.openSettings).toHaveBeenCalledOnce();
});

it('keeps the last review when a refresh fails and offers a retry', async () => {
  mocks.read.mockResolvedValueOnce(stepsOnlyRead()).mockRejectedValueOnce(new Error('Health Connect is unavailable.'));
  await act(async () => {
    root.render(<DailyGuidanceScreen />);
  });
  const [scrollView] = root.container.queryAll((node) => node.type === 'ScrollView');
  const onRefresh: unknown = scrollView?.props.refreshControl.props.onRefresh;
  if (typeof onRefresh !== 'function') throw new Error('Expected pull to refresh.');
  await act(async () => {
    onRefresh();
  });
  expect(root.container.queryAll((node) => node.props.role === 'alert').map(text)).toEqual(['Couldn’t update.']);
  expect(texts()).toContain('5,000 → 5,000 a day');
  mocks.read.mockResolvedValueOnce(stepsOnlyRead());
  await press('Try again');
  expect(root.container.queryAll((node) => node.props.role === 'alert')).toHaveLength(0);
});
