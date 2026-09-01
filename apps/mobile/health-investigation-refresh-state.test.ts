import { describe, expect, it } from 'vitest';
import { beginRefresh, failRefresh } from './health-investigation-refresh-state';

describe('Health Investigation refresh state', () => {
  const loadedReview = {
    evidenceSources: [{ id: 'source-1' }],
    investigation: { id: 'investigation-1' },
    isRefreshing: false,
    refreshError: 'An earlier refresh failed.',
    sourceCount: 1
  };

  it('shows loading without discarding the loaded review', () => {
    expect(beginRefresh(loadedReview)).toEqual({
      ...loadedReview,
      isRefreshing: true,
      refreshError: null
    });
  });

  it('keeps the loaded review visible when refreshing fails', () => {
    expect(failRefresh(beginRefresh(loadedReview), 'Your Health Investigation could not be loaded.')).toEqual({
      ...loadedReview,
      refreshError: 'Your Health Investigation could not be loaded.'
    });
  });
});
