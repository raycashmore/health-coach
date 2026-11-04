import { z } from 'zod';
import { answerSchema } from './answer.mjs';
import { toolInputs } from './evidence.mjs';

export const gatewayModel = 'anthropic/claude-sonnet-5.5';
const endpoint = 'https://ai-gateway.vercel.sh/v1/messages';
const reservation = 30000; // micro-USD: includes the five-minute cache-write premium.
const runLimit = 160000;
const comparisonLimit = 1280000;
const integer = (n) => Number.isSafeInteger(n) && n >= 0;

export async function verifyGatewayCatalog(transport = fetch) {
  const response = await transport('https://ai-gateway.vercel.sh/v1/models', {
    signal: AbortSignal.timeout(15000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error('catalog-unavailable');
  const model = (await response.json()).data?.find((item) => item.id === gatewayModel);
  if (
    !model?.tags?.includes('tool-use') ||
    !model.reasoning_options?.some((r) => r.type === 'effort' && r.values.includes('low')) ||
    Number(model.pricing?.input) !== 0.000002 ||
    Number(model.pricing?.output) !== 0.00001 ||
    Number(model.pricing?.input_cache_write) !== 0.0000025 ||
    Number(model.pricing?.input_cache_read) !== 0.0000001
  )
    throw new Error('catalog-contract-changed');
}

// record must durably persist each event before resolving. Uncertain paid outcomes
// retain the full reservation and stop the comparison rather than retrying.
export function createGatewayComparison({ apiKey, allowanceUsd, record, transport = fetch }) {
  const allowanceMicroUsd = Math.round(allowanceUsd * 1e6);
  if (
    !apiKey ||
    !Number.isFinite(allowanceUsd) ||
    allowanceUsd <= 0 ||
    allowanceUsd > 1.28 ||
    typeof record !== 'function'
  )
    throw new Error('paid-opt-in-required');
  const runs = new Map();
  let total = 0;
  let stopped = false;
  function requestFor(key) {
    if (!/^(agent|fixed):(source|missing|different-words|no-change)$/.test(key) || runs.has(key))
      throw new Error('run-already-bound');
    const run = { spent: 0, requests: 0, rows: [] };
    runs.set(key, run);
    const request = async (context, { signal }) => {
      if (
        stopped ||
        signal.aborted ||
        run.requests >= 6 ||
        run.spent + reservation > runLimit ||
        total + reservation > Math.min(comparisonLimit, allowanceMicroUsd)
      )
        throw new Error('generation-budget-unavailable');
      const tools = context.toolsAllowed
        ? Object.entries(toolInputs).map(([name, schema]) => ({
            name,
            description: `Read synthetic evidence using ${name}.`,
            input_schema: z.toJSONSchema(schema)
          }))
        : [];
      tools.push({
        name: 'finish_investigation',
        description: 'Return the supported final answer. Call exactly one tool per request.',
        input_schema: z.toJSONSchema(answerSchema)
      });
      const { instructions, answerSchema: ignoredSchema, toolsAllowed: ignoredTools, ...data } = context;
      const body = {
        model: gatewayModel,
        system: `${instructions} Call exactly one tool. Use finish_investigation for the final answer.`,
        messages: [{ role: 'user', content: JSON.stringify(data) }],
        tools,
        tool_choice: { type: 'auto', disable_parallel_tool_use: true },
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' },
        max_tokens: 1000,
        stream: false,
        providerOptions: { gateway: { only: ['anthropic'] } }
      };
      const {
        max_tokens: ignoredMax,
        stream: ignoredStream,
        providerOptions: ignoredOptions,
        output_config: ignoredOutput,
        ...countBody
      } = body;
      const options = {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        redirect: 'error',
        signal
      };
      let reserved = false;
      let settled = false;
      const abort = () => {
        stopped = true;
      };
      signal.addEventListener('abort', abort, { once: true });
      try {
        const counted = await transport(`${endpoint}/count_tokens`, { ...options, body: JSON.stringify(countBody) });
        const count = counted.ok ? (await counted.json()).input_tokens : null;
        if (!integer(count) || signal.aborted) throw new Error('token-count-unavailable');
        if (count + 1024 > 8000) throw new Error('input-limit');
        run.requests++;
        run.spent += reservation;
        total += reservation;
        reserved = true;
        const index = run.rows.length;
        const row = { key, index, reservationMicroUsd: reservation, status: 'reserved', preflightInputTokens: count };
        run.rows.push(row);
        await record(structuredClone(row));
        if (signal.aborted) throw new Error('request-aborted');
        const started = Date.now();
        const response = await transport(endpoint, { ...options, body: JSON.stringify(body) });
        const result = await response.json();
        const usage = result.usage;
        const parts = [
          usage?.input_tokens,
          usage?.cache_creation_input_tokens ?? 0,
          usage?.cache_read_input_tokens ?? 0,
          usage?.output_tokens
        ];
        if (
          !response.ok ||
          !parts.every(integer) ||
          !usage ||
          (usage.cache_creation?.ephemeral_1h_input_tokens ?? 0) !== 0
        )
          throw new Error('provider-usage-unavailable');
        const [input, write, read, output] = parts;
        const cost = input * 2 + write * 2.5 + read * 0.1 + output * 10;
        if (input + write + read > 8000 || input + write + read > count + 1024 || output > 1000 || cost > reservation)
          throw new Error('provider-usage-limit');
        const completed = {
          ...row,
          status: 'completed',
          inputTokens: input + write + read,
          outputTokens: output,
          costMicroUsd: cost,
          elapsedMs: Date.now() - started,
          generationId: result.id ?? null,
          finishReason: result.stop_reason ?? null,
          toolNames: Array.isArray(result.content)
            ? result.content.filter((part) => part.type === 'tool_use').map((part) => part.name)
            : []
        };
        await record(structuredClone(completed));
        Object.assign(row, completed);
        run.spent += cost - reservation;
        total += cost - reservation;
        settled = true;
        const calls = result.content?.filter((part) => part.type === 'tool_use');
        if (!['tool_use', 'end_turn'].includes(result.stop_reason)) throw new Error('output-limit');
        // Measured format failures get the runner's one repair, without exposing raw prose.
        if (result.stop_reason !== 'tool_use' || calls?.length !== 1) return { action: 'invalid' };
        const call = calls[0];
        return call.name === 'finish_investigation'
          ? { action: 'answer', answer: call.input }
          : { action: 'tool', name: call.name, input: call.input };
      } catch (error) {
        // A fully settled model stop ends this run; it is not an uncertain bill.
        if (
          error instanceof Error &&
          ((settled && error.message === 'output-limit') || (!reserved && error.message === 'input-limit'))
        )
          throw error;
        stopped = true;
        if (reserved && !settled) await record({ key, status: 'uncertain', heldMicroUsd: reservation }).catch(() => {});
        throw new Error('gateway-request-stopped');
      } finally {
        signal.removeEventListener('abort', abort);
      }
    };
    return {
      request,
      metrics: () => ({
        execution: 'gateway',
        model: gatewayModel,
        requests: run.requests,
        costUsd: run.rows.every((r) => r.status === 'completed') ? run.spent / 1e6 : null,
        heldOrMeasuredUsd: run.spent / 1e6,
        usage: structuredClone(run.rows)
      })
    };
  }
  return {
    requestFor,
    get stopped() {
      return stopped;
    }
  };
}
