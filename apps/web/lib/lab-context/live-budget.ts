import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const ledgerSchema = z.object({
  reservedMicroUsd: z.number().int().nonnegative(),
  calls: z.array(
    z.object({
      state: z.enum(['reserved', 'settled', 'unknown']),
      inputTokens: z.number().int().nonnegative().optional(),
      outputTokens: z.number().int().nonnegative().optional()
    })
  )
});
const reservationMicroUsd = 100_000;
export async function withLiveBudget<
  T extends { usage: { inputTokens: { total?: number }; outputTokens: { total?: number } } }
>(directory: string, allowanceUsd: number, call: () => PromiseLike<T>) {
  if (!Number.isFinite(allowanceUsd) || allowanceUsd <= 0 || allowanceUsd > 5)
    throw new Error('invalid-live-allowance');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, 'budget.lock'),
    filename = path.join(directory, 'budget.json');
  await mkdir(lock); // A crash leaves the lock for explicit recovery; never silently resume.
  try {
    let ledger: z.infer<typeof ledgerSchema> = { reservedMicroUsd: 0, calls: [] };
    try {
      ledger = ledgerSchema.parse(JSON.parse(await readFile(filename, 'utf8')));
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        throw new Error('invalid-budget-ledger');
    }
    if (ledger.calls.some((row) => row.state !== 'settled')) throw new Error('unsettled-paid-outcome');
    if (ledger.reservedMicroUsd + reservationMicroUsd > Math.floor(allowanceUsd * 1_000_000))
      throw new Error('live-budget-exhausted');
    const save = async () => {
      await writeFile(filename + '.tmp', JSON.stringify(ledger), { mode: 0o600 });
      await rename(filename + '.tmp', filename);
    };
    const row: z.infer<typeof ledgerSchema>['calls'][number] = { state: 'reserved' };
    ledger.reservedMicroUsd += reservationMicroUsd;
    ledger.calls.push(row);
    await save(); // Reserve durably before dispatch; retain the full amount on every outcome.
    try {
      const result = await call();
      const input = result.usage.inputTokens.total,
        output = result.usage.outputTokens.total;
      if (
        !Number.isSafeInteger(input) ||
        !Number.isSafeInteger(output) ||
        input! < 0 ||
        output! < 0 ||
        input! > 12000 ||
        output! > 6000
      )
        throw new Error('unexpected-provider-usage');
      row.inputTokens = input;
      row.outputTokens = output;
      row.state = 'settled';
      await save();
      return result;
    } catch {
      row.state = 'unknown';
      await save();
      throw new Error('paid-outcome-needs-review');
    }
  } finally {
    await rm(lock, { recursive: true });
  }
}
