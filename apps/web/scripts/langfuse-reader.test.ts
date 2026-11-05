import { describe, expect, it } from 'vitest';
import { langfuseReader } from './langfuse-reader';

const access = {
  baseUrl: 'https://us.cloud.langfuse.com',
  publicKey: 'public-placeholder',
  secretKey: 'secret-placeholder'
};
const traceId = 'a'.repeat(32);
describe('read-only Langfuse CLI boundary', () => {
  it('unwraps object/string CLI bodies and follows a cursor after an empty page', async () => {
    const commands: string[][] = [];
    const reader = langfuseReader(access, async (args) => {
      commands.push(args);
      if (args[0] === 'projects') return JSON.stringify({ status: 200, body: { data: [{ id: 'project-example' }] } });
      if (!args.includes('--cursor'))
        return JSON.stringify({ status: 200, body: JSON.stringify({ data: [], meta: { cursor: 'next-page' } }) });
      return JSON.stringify({ data: [{ id: 'observation-example' }], meta: { cursor: null } });
    });
    await reader.verifyProject('project-example');
    expect(await reader.observations(traceId)).toEqual([{ id: 'observation-example' }]);
    expect(commands.at(-1)).toContain('next-page');
    expect(commands.every((args) => args[1] === 'list')).toBe(true);
  });
  it('rejects error envelopes and suppresses transport output containing secrets', async () => {
    for (const runner of [
      async () => JSON.stringify({ status: 403, body: { data: [] } }),
      async () => {
        throw new Error('PRIVATE-SECRET-SENTINEL');
      },
      async () => 'PRIVATE-INVALID-JSON-SENTINEL'
    ]) {
      await expect(langfuseReader(access, runner).scores(traceId)).rejects.toThrow('langfuse-read-failed');
    }
  });
  it('fails closed on a repeated cursor instead of reporting an empty result', async () => {
    const reader = langfuseReader(access, async () => JSON.stringify({ data: [], meta: { cursor: 'same-page' } }));
    await expect(reader.observations(traceId)).rejects.toThrow('langfuse-cursor-repeated');
  });
  it('fails project identity verification before a caller can audit another destination', async () => {
    const reader = langfuseReader(access, async () => JSON.stringify({ data: [{ id: 'another-project' }] }));
    await expect(reader.verifyProject('project-example')).rejects.toThrow('langfuse-project-mismatch');
  });
});
