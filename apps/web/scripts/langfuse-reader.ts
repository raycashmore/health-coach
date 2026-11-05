import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const exec = promisify(execFile);
export type LangfuseAccess = { baseUrl: string; publicKey: string; secretKey: string };
type CliRunner = (args: string[], env: NodeJS.ProcessEnv) => Promise<string>;
const runCli: CliRunner = async (args, env) => {
  const result = await exec('npx', ['--yes', 'langfuse-cli', 'api', ...args, '--json'], {
    env,
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024
  });
  return result.stdout;
};
export async function readLangfuseAccess(
  keysFile: string,
  baseUrl = 'https://us.cloud.langfuse.com'
): Promise<LangfuseAccess> {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
    throw new Error('invalid-langfuse-destination');
  const text = await readFile(keysFile, 'utf8');
  const publicKeys = [...new Set(text.match(/\bpk-lf-[a-zA-Z0-9-]+/g) ?? [])];
  const secretKeys = [...new Set(text.match(/\bsk-lf-[a-zA-Z0-9-]+/g) ?? [])];
  if (publicKeys.length !== 1 || secretKeys.length !== 1) throw new Error('langfuse-key-pair-required');
  return { baseUrl, publicKey: publicKeys[0]!, secretKey: secretKeys[0]! };
}
function bodyFromEnvelope(text: string): unknown {
  const envelope = z
    .object({ status: z.number().optional(), body: z.unknown().optional() })
    .passthrough()
    .parse(JSON.parse(text));
  if (envelope.status !== undefined && (envelope.status < 200 || envelope.status >= 300))
    throw new Error('langfuse-read-failed');
  return typeof envelope.body === 'string' ? JSON.parse(envelope.body) : (envelope.body ?? envelope);
}
const pageSchema = z.object({
  data: z.array(z.unknown()),
  meta: z.object({ cursor: z.string().nullable().optional() }).optional()
});
export function langfuseReader(config: LangfuseAccess, runner: CliRunner = runCli) {
  const env = {
    ...process.env,
    LANGFUSE_BASE_URL: config.baseUrl,
    LANGFUSE_HOST: config.baseUrl,
    LANGFUSE_PUBLIC_KEY: config.publicKey,
    LANGFUSE_SECRET_KEY: config.secretKey
  };
  async function request(args: string[]) {
    try {
      return bodyFromEnvelope(await runner(args, env));
    } catch {
      throw new Error('langfuse-read-failed');
    }
  }
  async function list(resource: 'observations' | 'scores', traceId: string, fields: string) {
    z.string()
      .regex(/^[a-f0-9]{32}$/)
      .parse(traceId);
    const data: unknown[] = [],
      seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const args = [resource, 'list', '--trace-id', traceId, '--fields', fields, '--limit', '100'];
      if (cursor) args.push('--cursor', cursor);
      const parsed = pageSchema.safeParse(await request(args));
      if (!parsed.success) throw new Error('langfuse-read-failed');
      const result = parsed.data;
      data.push(...result.data);
      if (data.length > 1000) throw new Error('langfuse-audit-limit');
      const next = result.meta?.cursor;
      if (!next) return data;
      if (seen.has(next)) throw new Error('langfuse-cursor-repeated');
      seen.add(next);
      cursor = next;
    }
    throw new Error('langfuse-audit-limit');
  }
  return {
    async verifyProject(projectId: string) {
      const parsed = z
        .object({ data: z.array(z.object({ id: z.string() })) })
        .safeParse(await request(['projects', 'list']));
      if (!parsed.success) throw new Error('langfuse-read-failed');
      const projects = parsed.data;
      if (!projects.data.some((project) => project.id === projectId)) throw new Error('langfuse-project-mismatch');
    },
    observations: (traceId: string, content = true) =>
      list(
        'observations',
        traceId,
        content ? 'core,basic,io,metadata,model,usage,metrics,trace_context' : 'core,basic'
      ),
    scores: (traceId: string) => list('scores', traceId, 'details,subject')
  };
}
export type LangfuseReader = ReturnType<typeof langfuseReader>;
