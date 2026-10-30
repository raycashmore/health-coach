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
import { TopBar } from './top-bar';

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

function button(name: string) {
  return root.container.queryAll(
    (node) =>
      node.type === 'Pressable' &&
      node.props.accessibilityRole === 'button' &&
      (node.props.accessibilityLabel ?? text(node)) === name
  )[0];
}

it('reveals sign out from the account menu', async () => {
  const signOut = vi.fn();
  await act(async () => {
    root.render(<TopBar onSignOut={signOut} />);
  });
  expect(button('Sign out')).toBeUndefined();
  await act(async () => button('Account menu')?.props.onPress());
  await act(async () => button('Sign out')?.props.onPress());
  expect(signOut).toHaveBeenCalledOnce();
});

it('offers no account menu before sign-in', async () => {
  await act(async () => {
    root.render(<TopBar />);
  });
  expect(button('Account menu')).toBeUndefined();
});
