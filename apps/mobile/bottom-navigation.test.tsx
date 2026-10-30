import { act } from 'react';
import { createRoot } from 'test-renderer';
import type { Root, TestInstance } from 'test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  Pressable: 'Pressable',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: 'Text',
  View: 'View'
}));
vi.mock('@expo/vector-icons/MaterialIcons', () => ({ default: 'Icon' }));
import { BottomNavigation } from './bottom-navigation';

let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  root = createRoot();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

function text(node: TestInstance): string {
  return node.children.map((child) => (typeof child === 'string' ? child : text(child))).join('');
}

it('marks the current destination and navigates to the other', async () => {
  const navigate = vi.fn();
  await act(async () => {
    root.render(<BottomNavigation current="coach" onNavigate={navigate} />);
  });
  const tabs = root.container.queryAll((node) => node.props.accessibilityRole === 'tab');
  expect(tabs.map((tab) => [text(tab), tab.props.accessibilityState.selected])).toEqual([
    ['Coach', true],
    ['Record', false]
  ]);
  await act(async () => tabs[1]?.props.onPress());
  expect(navigate).toHaveBeenCalledWith('record');
});
