import { describe, expect, it } from 'vitest';

import { removeById, upsertById } from './health-record-editor-state';

describe('health record editor state', () => {
  it('shows a newly saved entry first and replaces it after an edit', () => {
    const existing = [{ id: 'existing', ingredient: 'Example nutrient' }];
    const added = upsertById(existing, { id: 'new', ingredient: 'Example ingredient' });

    expect(added).toEqual([
      { id: 'new', ingredient: 'Example ingredient' },
      { id: 'existing', ingredient: 'Example nutrient' }
    ]);
    expect(upsertById(added, { id: 'new', ingredient: 'Updated ingredient' })).toEqual([
      { id: 'new', ingredient: 'Updated ingredient' },
      { id: 'existing', ingredient: 'Example nutrient' }
    ]);
  });

  it('removes an ended regimen from the active list', () => {
    expect(removeById([{ id: 'active' }, { id: 'other' }], 'active')).toEqual([{ id: 'other' }]);
  });
});
