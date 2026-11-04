import { readFile } from 'node:fs/promises';
import { parseEnv, promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gateway, wrapLanguageModel } from 'ai';
import { defaultContextModel } from '../lib/lab-context/generate';
import { langfuseRecorder } from '../lib/lab-context/telemetry';
import { withLiveBudget } from '../lib/lab-context/live-budget';
import type { ContextTrace } from '../lib/lab-context/run';
import { z } from 'zod';

const exec = promisify(execFile);
export async function prepareLiveContext() {
  const keysFile = process.env.HC_LANGFUSE_KEYS_FILE,
    projectId = process.env.HC_LANGFUSE_PROJECT_ID;
  const allowanceUsd = Number(process.env.HC_LAB_CONTEXT_ALLOWANCE_USD);
  if (!keysFile || !projectId || !Number.isFinite(allowanceUsd) || allowanceUsd <= 0 || allowanceUsd > 5)
    throw new Error('live-configuration-required');
  const text = await readFile(keysFile, 'utf8');
  const publicKeys = text.match(/\bpk-lf-[a-zA-Z0-9-]+/g) ?? [],
    secretKeys = text.match(/\bsk-lf-[a-zA-Z0-9-]+/g) ?? [];
  if (new Set(publicKeys).size !== 1 || new Set(secretKeys).size !== 1) throw new Error('langfuse-key-pair-required');
  const baseUrl = 'https://us.cloud.langfuse.com';
  const config = { baseUrl, publicKey: publicKeys[0]!, secretKey: secretKeys[0]! };
  let projectMatches = false;
  try {
    const { stdout } = await exec('npx', ['--yes', 'langfuse-cli', 'api', 'projects', 'list', '--json'], {
      env: {
        ...process.env,
        LANGFUSE_BASE_URL: baseUrl,
        LANGFUSE_HOST: baseUrl,
        LANGFUSE_PUBLIC_KEY: config.publicKey,
        LANGFUSE_SECRET_KEY: config.secretKey
      },
      timeout: 30_000
    });
    const envelope = z.object({ body: z.unknown().optional() }).passthrough().parse(JSON.parse(stdout));
    const body = typeof envelope.body === 'string' ? JSON.parse(envelope.body) : (envelope.body ?? envelope);
    const response = z.object({ data: z.array(z.object({ id: z.string() })) }).parse(body);
    projectMatches = response.data?.some((project) => project.id === projectId) ?? false;
  } catch {
    throw new Error('langfuse-project-check-failed');
  }
  if (!projectMatches) throw new Error('langfuse-project-mismatch');
  const localEnv = parseEnv(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
  if (!localEnv.AI_GATEWAY_API_KEY) throw new Error('gateway-key-required');
  process.env.AI_GATEWAY_API_KEY = localEnv.AI_GATEWAY_API_KEY;
  const response = await fetch('https://ai-gateway.vercel.sh/v1/models', {
    redirect: 'error',
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error('catalog-unavailable');
  const catalog = (await response.json()) as {
    data: { id: string; pricing: { input: string; output: string; input_cache_write: string } }[];
  };
  const selected = catalog.data.find((entry) => entry.id === defaultContextModel);
  if (
    !selected ||
    Number(selected.pricing.input) !== 0.000001 ||
    Number(selected.pricing.output) !== 0.000005 ||
    Number(selected.pricing.input_cache_write) !== 0.00000125
  )
    throw new Error('catalog-contract-changed');
  let dispatched = false;
  const directory = fileURLToPath(new URL('../../../private-data/lab-context-live/', import.meta.url));
  const model = wrapLanguageModel({
    model: gateway(defaultContextModel),
    middleware: {
      specificationVersion: 'v4',
      transformParams: async ({ params }) => ({
        ...params,
        providerOptions: {
          ...params.providerOptions,
          gateway: { ...params.providerOptions?.gateway, only: ['openai'] },
          openai: { ...params.providerOptions?.openai, serviceTier: 'default' }
        }
      }),
      wrapGenerate: async ({ doGenerate }) => {
        if (dispatched) throw new Error('one-live-call-only');
        dispatched = true;
        return withLiveBudget(directory, allowanceUsd, doGenerate);
      }
    }
  });
  const recorder = langfuseRecorder(config);
  let observation: { traceId: string; spanId: string } | undefined;
  return {
    model,
    modelId: defaultContextModel,
    record: async (trace: ContextTrace) => {
      observation = await recorder.record(trace);
    },
    async scores(scores: {
      requiredPassageRecall: number | null;
      irrelevantSections: number;
      citationValidity: number;
    }) {
      if (!observation) throw new Error('trace-recording-unavailable');
      await recorder.scores(observation.traceId, observation.spanId, scores);
    },
    receipt: () => ({ projectId, baseUrl, observation, allowanceUsd }),
    shutdown: recorder.shutdown
  };
}
