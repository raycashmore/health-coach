import { act } from 'react';
import { createRoot } from 'test-renderer';
import type { Root, TestInstance } from 'test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { syntheticContextScenarioSchema } from '@health-coach/health-core/lab-context';
import type { ContextPacket, SyntheticContextScenario } from '@health-coach/health-core/lab-context';

// Exercise real server assembly without adding Node-only server types to the Android compilation.
const { loadSyntheticContextPacket } = await vi.importActual<{
  loadSyntheticContextPacket: (ownerId: string, scenario: SyntheticContextScenario) => Promise<ContextPacket>;
}>('../web/lib/lab-context/synthetic-packet');

const mocks = vi.hoisted(() => ({ session: vi.fn(), fetch: vi.fn() }));
vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}));
vi.mock('./supabase-client', () => ({ supabase: { auth: { getSession: mocks.session } } }));
import { SyntheticContextExample } from './synthetic-context-example';

let root: Root;
const ownerId = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('__DEV__', true);
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubEnv('EXPO_PUBLIC_HEALTH_COACH_API_URL', 'http://example.invalid');
  mocks.session.mockResolvedValue({ data: { session: { access_token: 'test-only' } } });
  mocks.fetch.mockImplementation(async (url: string) => {
    const scenario = syntheticContextScenarioSchema.parse(new URL(url).searchParams.get('scenario'));
    return Response.json(await loadSyntheticContextPacket(ownerId, scenario));
  });
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
function texts() {
  return root.container.queryAll((node) => node.type === 'Text').map(text);
}
async function press(label: string) {
  const button = root.container.queryAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'button' && text(node) === label
  )[0];
  const onPress: unknown = button?.props.onPress;
  if (typeof onPress !== 'function') throw new Error(`Expected action: ${label}`);
  await act(async () => {
    onPress();
  });
}

it('loads opt-in server evidence with the verified session and renders values, coverage, provenance and limitations', async () => {
  await act(async () => root.render(<SyntheticContextExample />));
  expect(mocks.fetch).not.toHaveBeenCalled();
  await press('Load synthetic example');
  expect(mocks.fetch).toHaveBeenCalledWith(
    'http://example.invalid/api/lab-context/synthetic?scenario=prepared',
    expect.objectContaining({ headers: { Authorization: 'Bearer test-only' }, cache: 'no-store' })
  );
  const content = texts().join('\n');
  for (const value of [
    'Synthetic evidence example',
    'Collected 2026-01-20',
    'synthetic-laboratory',
    'Example marker 1: 12 example units',
    'Source range: 8–10',
    '1 laboratory results omitted',
    'Before collection: 2026-01-06 – 2026-01-19',
    'Before this request: 2026-01-09 – 2026-01-22',
    'Australia/Sydney · Steps 1/14 days · Sleep 0/14 days',
    'Steps: 4,200 · Sleep: unknown',
    'Steps: unknown · Sleep: 7h 10m',
    'Steps: 5,100 · Sleep: 7h 30m',
    'Revision checked current when this packet was loaded.',
    '00000000-0000-4000-8000-000000000285',
    'Published: 2026-01-21T00:00:00Z',
    'synthetic-notes · synthetic-section · Lines 3–4',
    'Authored: unknown; chronology unverified',
    'does not establish a cause',
    'A separate example log says the routine stayed unchanged.',
    'synthetic-routine-log · synthetic-conflicting-section',
    '1 matching note passages omitted',
    'Missing activity days are unknown, not zero.'
  ])
    expect(content).toContain(value);
  expect(content).not.toContain('99999');
});
it('replaces original notes with the corrected revision and then clears deleted passages', async () => {
  await act(async () => root.render(<SyntheticContextExample />));
  await press('Load synthetic example');
  await press('Show corrected notes');
  expect(texts().join('\n')).toContain('Correction: the example routine was unchanged.');
  expect(texts().join('\n')).not.toContain('routine may have changed');
  expect(texts().join('\n')).toContain('00000000-0000-4000-8000-000000000286');
  await press('Show deleted notes');
  expect(texts()).toContain('No matching passages in this revision.');
  expect(texts().join('\n')).toContain('00000000-0000-4000-8000-000000000287');
  expect(texts().join('\n')).not.toContain('Correction:');
  expect(texts().join('\n')).not.toContain('routine may have changed');
  await press('Reset example');
  expect(texts().join('\n')).toContain('routine may have changed');
});
it('removes the old packet immediately on reload and keeps it hidden when the request fails', async () => {
  await act(async () => root.render(<SyntheticContextExample />));
  await press('Load synthetic example');
  let reject: (error: Error) => void = () => {
    throw new Error('Expected pending request');
  };
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      })
  );
  await press('Reload example');
  expect(texts().join('\n')).not.toContain('routine may have changed');
  expect(texts().join('\n')).not.toContain('Example marker 1:');
  await act(async () => reject(new Error('Example source unavailable.')));
  expect(root.container.queryAll((node) => node.props.role === 'alert').map(text)).toEqual([
    'Example source unavailable.'
  ]);
  expect(texts().join('\n')).not.toContain('routine may have changed');
});
it('shows explicit partial-source and ambiguous-date states with the remaining evidence', async () => {
  await act(async () => root.render(<SyntheticContextExample />));
  await press('Inspect missing-source examples');
  for (const [scenario, label, expected] of [
    ['notes-unavailable', 'Show unavailable notes', 'Notes unavailable. No passages were used.'],
    ['stale-notes', 'Show changed notes during loading', 'Notes changed or were deleted. Previous passages withheld.'],
    [
      'activity-unavailable',
      'Show unavailable activity',
      'Activity source unavailable. No values or coverage were used.'
    ],
    [
      'ambiguous-dates',
      'Show ambiguous collection dates',
      'Collection dates are ambiguous. No latest panel was selected.'
    ]
  ] as const) {
    await press(label);
    expect(mocks.fetch).toHaveBeenLastCalledWith(expect.stringContaining(`scenario=${scenario}`), expect.anything());
    expect(texts()).toContain(expected);
    if (scenario === 'ambiguous-dates') expect(texts().join('\n')).toContain('Collection date: unknown');
  }
});
it('rejects malformed server evidence and leaves old notes hidden', async () => {
  await act(async () => root.render(<SyntheticContextExample />));
  mocks.fetch.mockResolvedValueOnce(
    Response.json({ kind: 'synthetic-context', notes: { sections: [{ text: 'unverified passage' }] } })
  );
  await press('Load synthetic example');
  expect(texts()).toContain('The synthetic evidence response could not be verified.');
  expect(texts().join('\n')).not.toContain('unverified passage');
});
it('does not offer the synthetic example in release builds or send requests without a session', async () => {
  vi.stubGlobal('__DEV__', false);
  await act(async () => root.render(<SyntheticContextExample />));
  expect(texts()).toEqual([]);
  expect(mocks.fetch).not.toHaveBeenCalled();
  vi.stubGlobal('__DEV__', true);
  mocks.session.mockResolvedValue({ data: { session: null } });
  await act(async () => root.render(<SyntheticContextExample />));
  await press('Load synthetic example');
  expect(texts()).toContain('Sign in again before loading the synthetic example.');
  expect(mocks.fetch).not.toHaveBeenCalled();
});
