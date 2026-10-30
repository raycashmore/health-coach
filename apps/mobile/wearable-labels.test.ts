import { expect, it } from 'vitest';
import { sourceName } from './wearable-labels';

it('names known sources and falls back to the package', () => {
  expect(sourceName('com.google.android.apps.fitness')).toBe('Google Fit');
  expect(sourceName('com.android.healthconnect.phone.example')).toBe('This phone');
  expect(sourceName('example.source')).toBe('example.source');
});
