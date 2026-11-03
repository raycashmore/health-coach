import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createGateway, wrapLanguageModel, simulateStreamingMiddleware } from 'ai';
import { fixtureTransport } from './fixture-transport.mjs';
import { liveEnvelope, validateRequest, reserveRequest, finishRequest } from './live-budget.mjs';

function terminal(reason) {
  // No cause containing a retryable Gateway error: Eve treats HTTP 400 as terminal.
  return Object.assign(new Error(`incomplete: ${reason}`), { statusCode: 400, isRetryable: false });
}
export function boundedFetch({ ledgerFile, transport = fetch }) {
  return async (url, init) => {
    let index;
    let observed = {};
    try {
      const request = validateRequest(url, init);
      index = await reserveRequest(ledgerFile, request);
      const response = await transport(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(30000)])
      });
      const data = await response
        .clone()
        .json()
        .catch(() => null);
      const input = data?.usage?.inputTokens?.total;
      const output = data?.usage?.outputTokens?.total;
      if (Number.isInteger(input) && Number.isInteger(output) && input >= 0 && output >= 0) {
        observed = {
          inputTokens: input,
          outputTokens: output,
          tokenCostNanoUsd: input * liveEnvelope.inputNanoUsd + output * liveEnvelope.outputNanoUsd,
          finishReason: data.finishReason,
          providerMetadata: data.providerMetadata
        };
      }
      if (!response.ok) throw new Error('provider-failure');
      if (
        !Number.isInteger(input) ||
        !Number.isInteger(output) ||
        input < 0 ||
        output < 0 ||
        input > liveEnvelope.inputTokens ||
        output > liveEnvelope.outputTokens
      )
        throw new Error('provider-usage-limit');
      if (data.finishReason?.unified === 'length' || !Array.isArray(data.content) || !data.content.length)
        throw new Error('incomplete-provider-output');
      await finishRequest(ledgerFile, index, {
        status: 'completed',
        inputTokens: input,
        outputTokens: output,
        tokenCostNanoUsd: input * liveEnvelope.inputNanoUsd + output * liveEnvelope.outputNanoUsd,
        finishReason: data.finishReason,
        content: data.content,
        providerMetadata: data.providerMetadata
      });
      return response;
    } catch (error) {
      const reason =
        error instanceof Error &&
        ['provider-failure', 'provider-usage-limit', 'incomplete-provider-output'].includes(error.message)
          ? error.message
          : 'request-stopped';
      if (index !== undefined)
        await finishRequest(ledgerFile, index, { ...observed, status: 'incomplete', reason }).catch(() => {});
      throw terminal('request-stopped');
    }
  };
}
export async function liveModel({
  ledgerFile = process.env.HC_SPIKE_LEDGER,
  credentialsFile = process.env.HC_SPIKE_CREDENTIALS,
  transport = fetch,
  toolsAvailable = true
} = {}) {
  if (!ledgerFile || !credentialsFile) throw terminal('explicit-live-configuration-required');
  const values = parseEnv(await readFile(credentialsFile, 'utf8'));
  const apiKey = values.AI_GATEWAY_API_KEY?.trim();
  if (!apiKey) throw terminal('gateway-credential-unavailable');
  const provider = createGateway({
    apiKey,
    fetch: boundedFetch({ ledgerFile, transport: process.env.HC_SPIKE_DRY_RUN === '1' ? fixtureTransport : transport })
  });
  return wrapLanguageModel({
    model: provider(liveEnvelope.model),
    middleware: [
      {
        specificationVersion: 'v4',
        transformParams({ params }) {
          return {
            ...params,
            maxOutputTokens: liveEnvelope.outputTokens,
            providerOptions: { gateway: { only: ['openai'] } },
            ...(!toolsAvailable ? { tools: [], toolChoice: { type: 'none' } } : {})
          };
        },
        async wrapStream({ doStream }) {
          try {
            return await doStream();
          } catch {
            throw terminal('provider-stopped');
          }
        },
        async wrapGenerate({ doGenerate }) {
          try {
            return await doGenerate();
          } catch {
            throw terminal('provider-stopped');
          }
        }
      },
      simulateStreamingMiddleware()
    ]
  });
}
