import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { withLiveBudget } from './live-budget';

describe('live call budget', () => {
  it('reserves before dispatch and prevents spending above the approved total', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'budget-'));
    let calls = 0;
    const call = async () => {
      const ledger = JSON.parse(await readFile(path.join(directory, 'budget.json'), 'utf8'));
      expect(ledger.reservedMicroUsd).toBe(100000);
      expect(ledger.calls[0].state).toBe('reserved');
      calls++;
      return { usage: { inputTokens: { total: 100 }, outputTokens: { total: 20 } } };
    };
    try {
      await withLiveBudget(directory, 0.15, call);
      await expect(withLiveBudget(directory, 0.15, call)).rejects.toThrow('live-budget-exhausted');
      expect(calls).toBe(1);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
  it('retains uncertain reservations and refuses another call', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'budget-'));
    try {
      await expect(
        withLiveBudget(directory, 5, async () => {
          throw new Error('remote failure with private body');
        })
      ).rejects.toThrow('paid-outcome-needs-review');
      let called = false;
      await expect(
        withLiveBudget(directory, 5, async () => {
          called = true;
          return { usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } } };
        })
      ).rejects.toThrow('unsettled-paid-outcome');
      expect(called).toBe(false);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
