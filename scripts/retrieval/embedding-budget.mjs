import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export const embeddingModel = 'openai/text-embedding-3-small';
export const pricePerMillion = 0.02; // OpenAI and Vercel model pricing verified 3 Nov 2026.
export const budgetUsd = 1;

export function reserveCost(inputs) {
  if (
    !Array.isArray(inputs) ||
    !inputs.length ||
    inputs.some((s) => typeof s !== 'string' || !s.length || Buffer.byteLength(s) > 8000)
  )
    throw new Error('Invalid bounded embedding inputs');
  // UTF-8 bytes upper-bound byte-pair tokens; add overhead and 2x price margin.
  return (inputs.reduce((sum, s) => sum + Buffer.byteLength(s) + 16, 0) * pricePerMillion * 2) / 1e6;
}

export async function withEmbeddingBudget(directory, inputs, call) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, 'embedding-budget.lock');
  await mkdir(lock); // Fail closed on concurrent or interrupted writers.
  try {
    const ledgerPath = path.join(directory, 'embedding-budget.json');
    let ledger = { reservedUsd: 0, measuredTokens: 0, successfulCalls: 0 };
    try {
      ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (!Number.isFinite(ledger.reservedUsd) || ledger.reservedUsd < 0 || !Number.isFinite(ledger.measuredTokens))
      throw new Error('Invalid budget ledger');
    const reserve = reserveCost(inputs);
    if (ledger.reservedUsd + reserve > budgetUsd) throw new Error('Embedding budget exhausted');
    ledger.reservedUsd += reserve;
    const save = async () => {
      await writeFile(`${ledgerPath}.tmp`, JSON.stringify(ledger, null, 2), { mode: 0o600 });
      await rename(`${ledgerPath}.tmp`, ledgerPath);
    };
    await save(); // Keep reservation even if remote success is unknown after failure.
    const result = await call();
    if (!Number.isInteger(result.usage?.total_tokens) || result.usage.total_tokens < 0)
      throw new Error('Missing embedding usage');
    ledger.measuredTokens += result.usage.total_tokens;
    ledger.successfulCalls++;
    await save();
    return result;
  } finally {
    await rm(lock, { recursive: true });
  }
}
