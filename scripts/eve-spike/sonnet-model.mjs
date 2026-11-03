import { createHash } from 'node:crypto';
import { createAnthropic } from '@ai-sdk/anthropic';
import { wrapLanguageModel, simulateStreamingMiddleware } from 'ai';
import { liveEnvelope, modelPrompt, boundRun, reserveRequest, finishRequest } from './live-budget.mjs';

const countEndpoint = 'https://ai-gateway.vercel.sh/v1/messages/count_tokens';
function terminal() {
  return Object.assign(new Error('incomplete: sonnet-request-stopped'), { statusCode: 400, isRetryable: false });
}
function withoutCacheControl(value) {
  if (Array.isArray(value)) return value.map(withoutCacheControl);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'cache_control')
        .map(([key, item]) => [key, withoutCacheControl(item)])
    );
  return value;
}
export function sonnetFetch({ ledgerFile, transport = fetch }) {
  return async (url, init) => {
    let index;
    let observed = {};
    let generationSent = false;
    try {
      if (
        liveEnvelope.api !== 'anthropic' ||
        String(url) !== liveEnvelope.endpoint ||
        init.method !== 'POST' ||
        typeof init.body !== 'string'
      )
        throw new Error('invalid-request');
      const original = JSON.parse(init.body);
      if (
        original.model !== 'claude-sonnet-5-5' ||
        original.stream ||
        original.max_tokens !== liveEnvelope.outputTokens ||
        original.output_config?.effort !== 'low' ||
        !['adaptive', 'between_tools'].includes(original.thinking?.type)
      )
        throw new Error('invalid-model-settings');
      const body = {
        ...withoutCacheControl(original),
        model: liveEnvelope.model,
        providerOptions: { gateway: { only: ['anthropic'] } }
      };
      if (body.messages.length > 32 || Buffer.byteLength(JSON.stringify(body)) > 35904)
        throw new Error('context-byte-limit');
      const names = (body.tools ?? []).map((tool) => tool.name);
      if (
        names.length > 3 ||
        names.some((name) => !['search', 'read_section', 'follow_reference'].includes(name)) ||
        (body.tools ?? []).some((tool) => tool.type && tool.type !== 'custom')
      )
        throw new Error('invalid-tools');
      const headers = new Headers(init.headers);
      const run = boundRun(headers, body.messages);
      if (run.mode !== 'agent') throw new Error('agent-only-profile');
      headers.delete('x-hc-spike-run');
      index = await reserveRequest(ledgerFile, {
        ...run,
        fingerprint: createHash('sha256').update(JSON.stringify(body)).digest('hex')
      });
      const options = {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(30000)])
      };
      // Count precisely the same native model/system/messages/tools/thinking settings.
      // Remove generation-only fields; Gateway supports this free Claude endpoint.
      const generationFields = new Set([
        'max_tokens',
        'stream',
        'temperature',
        'top_p',
        'top_k',
        'stop_sequences',
        'providerOptions'
      ]);
      const countBody = Object.fromEntries(Object.entries(body).filter(([key]) => !generationFields.has(key)));
      const counted = await transport(countEndpoint, { ...options, body: JSON.stringify(countBody) });
      if (!counted.ok) throw new Error('token-count-failed');
      const count = (await counted.json()).input_tokens;
      if (!Number.isInteger(count) || count < 0 || count + 1024 > liveEnvelope.inputTokens)
        throw new Error('token-count-limit');
      observed = { preflightInputTokens: count, preflightAllowanceTokens: 1024 };
      generationSent = true;
      const response = await transport(url, { ...options, body: JSON.stringify(body) });
      const data = await response
        .clone()
        .json()
        .catch(() => null);
      const usage = data?.usage;
      const parts = [
        usage?.input_tokens,
        usage?.cache_creation_input_tokens ?? 0,
        usage?.cache_read_input_tokens ?? 0,
        usage?.output_tokens
      ];
      if (parts.every((n) => Number.isInteger(n) && n >= 0)) {
        const [input, write, read, output] = parts;
        const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
        if (!Number.isInteger(oneHour) || oneHour < 0 || oneHour > write) throw new Error('provider-usage-limit');
        observed = {
          ...observed,
          inputTokens: input + write + read,
          outputTokens: output,
          cacheWriteTokens: write,
          oneHourCacheWriteTokens: oneHour,
          cacheReadTokens: read,
          tokenCostNanoUsd: input * 2000 + (write - oneHour) * 2500 + oneHour * 4000 + read * 100 + output * 10000
        };
      }
      if (!response.ok) throw new Error('provider-failure');
      if (
        observed.inputTokens === undefined ||
        observed.oneHourCacheWriteTokens > 0 ||
        observed.inputTokens > liveEnvelope.inputTokens ||
        observed.inputTokens > count + 1024 ||
        observed.outputTokens > liveEnvelope.outputTokens
      )
        throw new Error('provider-usage-limit');
      if (
        data.stop_reason === 'max_tokens' ||
        !Array.isArray(data.content) ||
        !data.content.some((part) => part.type === 'tool_use' || (part.type === 'text' && part.text.trim()))
      )
        throw new Error('incomplete-provider-output');
      await finishRequest(ledgerFile, index, {
        ...observed,
        generationSent,
        status: 'completed',
        finishReason: data.stop_reason,
        content: data.content,
        providerMetadata: data.providerMetadata
      });
      return response;
    } catch (error) {
      const reason =
        error instanceof Error &&
        [
          'token-count-failed',
          'token-count-limit',
          'provider-failure',
          'provider-usage-limit',
          'incomplete-provider-output'
        ].includes(error.message)
          ? error.message
          : 'request-stopped';
      if (index !== undefined)
        await finishRequest(ledgerFile, index, {
          ...observed,
          generationSent,
          ...(!generationSent ? { tokenCostNanoUsd: 0 } : {}),
          status: 'incomplete',
          reason
        }).catch(() => {});
      throw terminal();
    }
  };
}
export async function sonnetFixtureTransport(url, init) {
  if (String(url) === countEndpoint) return Response.json({ input_tokens: 250 });
  const body = JSON.parse(init.body);
  const toolResults = body.messages.flatMap((message) =>
    Array.isArray(message.content) ? message.content.filter((part) => part.type === 'tool_result') : []
  );
  let content;
  if (!body.tools?.length || body.tool_choice?.type === 'none' || toolResults.length >= 2)
    content = [{ type: 'text', text: 'OFFLINE Sonnet transport fixture.' }];
  else if (!toolResults.length)
    content = [{ type: 'tool_use', id: 'fixture-search', name: 'search', input: { query: 'LP-42 ribbon' } }];
  else {
    const first = toolResults[0].content;
    const text = typeof first === 'string' ? first : first.find((part) => part.type === 'text').text;
    content = [
      {
        type: 'tool_use',
        id: 'fixture-read',
        name: 'read_section',
        input: { handle: JSON.parse(text).sources[0].handle }
      }
    ];
  }
  return Response.json({
    id: 'fixture-message',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content,
    stop_reason: content[0].type === 'tool_use' ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 250, output_tokens: 30 }
  });
}
export function anthropicModel({ ledgerFile, apiKey, transport, toolsAvailable }) {
  const provider = createAnthropic({
    baseURL: 'https://ai-gateway.vercel.sh/v1',
    apiKey,
    fetch: sonnetFetch({
      ledgerFile,
      transport: process.env.HC_SPIKE_DRY_RUN === '1' ? sonnetFixtureTransport : transport
    })
  });
  return wrapLanguageModel({
    model: provider('claude-sonnet-5-5'),
    modelId: liveEnvelope.model,
    middleware: [
      {
        specificationVersion: 'v4',
        transformParams({ params }) {
          const prepared = modelPrompt(params.prompt);
          return {
            ...params,
            prompt: prepared.prompt,
            headers: { ...params.headers, 'x-hc-spike-run': prepared.run.key },
            maxOutputTokens: liveEnvelope.outputTokens,
            reasoning: 'low',
            providerOptions: {},
            ...(!toolsAvailable ? { tools: [], toolChoice: { type: 'none' } } : {})
          };
        },
        async wrapGenerate({ doGenerate }) {
          try {
            return await doGenerate();
          } catch {
            throw terminal();
          }
        },
        async wrapStream({ doStream }) {
          try {
            return await doStream();
          } catch {
            throw terminal();
          }
        }
      },
      simulateStreamingMiddleware()
    ]
  });
}
