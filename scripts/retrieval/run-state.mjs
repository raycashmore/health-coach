import { mkdir, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export async function withExclusiveRun(directory, run) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = path.join(directory, 'run.lock');
  await mkdir(lock); // A stale lock requires inspecting the recovery journal.
  try {
    return await run();
  } finally {
    await rm(lock, { recursive: true });
  }
}

export async function saveRunJournal(filename, state) {
  await writeFile(`${filename}.tmp`, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(`${filename}.tmp`, filename);
}
