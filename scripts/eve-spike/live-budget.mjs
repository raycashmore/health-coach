import { createHash } from 'node:crypto';
import { open, readFile, rename, unlink } from 'node:fs/promises';
import { demoCases } from './fixtures.mjs';

export const liveEnvelope = Object.freeze({
  model: 'openai/gpt-4.1-mini',
  endpoint: 'https://ai-gateway.vercel.sh/v4/ai/language-model',
  inputTokens: 40000,
  outputTokens: 1000,
  requests: 40,
  inputNanoUsd: 400,
  outputNanoUsd: 1600,
  allowanceNanoUsd: 1_000_000_000
});
export const requestReservation =
  liveEnvelope.inputTokens * liveEnvelope.inputNanoUsd + liveEnvelope.outputTokens * liveEnvelope.outputNanoUsd;

export function runMarker(mode, id) {
  const item = demoCases.find((item) => item.id === id);
  if (!item || !['agent', 'fixed'].includes(mode)) throw new Error('Unknown synthetic run');
  return `SPIKE_RUN ${mode} ${id}\n${item.query}`;
}
export function identifyRun(prompt) {
  const markers = prompt
    .filter((message) => message.role === 'user')
    .flatMap((message) =>
      typeof message.content === 'string'
        ? [message.content]
        : message.content.filter((part) => part.type === 'text').map((part) => part.text)
    )
    .filter((text) => text.startsWith('SPIKE_RUN '));
  if (markers.length !== 1) throw new Error('Expected one synthetic run marker');
  const match = /^SPIKE_RUN (agent|fixed) ([a-z]+)\n/.exec(markers[0]);
  if (!match || !markers[0].startsWith(runMarker(match[1], match[2]))) throw new Error('Unknown synthetic question');
  return { key: `${match[1]}:${match[2]}`, mode: match[1], caseId: match[2] };
}

export function modelPrompt(prompt) {
  const run = identifyRun(prompt);
  return {
    run,
    prompt: prompt.map((message) =>
      message.role !== 'user'
        ? message
        : {
            ...message,
            content:
              typeof message.content === 'string'
                ? message.content.replace(/^SPIKE_RUN [^\n]+\n/, '')
                : message.content.map((part) =>
                    part.type !== 'text' ? part : { ...part, text: part.text.replace(/^SPIKE_RUN [^\n]+\n/, '') }
                  )
          }
    )
  };
}
function boundRun(headers, prompt) {
  const match = /^(agent|fixed):([a-z]+)$/.exec(headers.get('x-hc-spike-run') ?? '');
  const item = match && demoCases.find((item) => item.id === match[2]);
  if (!item) throw new Error('Unknown bound run');
  const texts = prompt
    .filter((message) => message.role === 'user')
    .flatMap((message) =>
      typeof message.content === 'string'
        ? [message.content]
        : message.content.filter((part) => part.type === 'text').map((part) => part.text)
    );
  if (!texts.some((text) => text.startsWith(item.query)) || JSON.stringify(prompt).includes('SPIKE_RUN '))
    throw new Error('Run metadata leaked or question missing');
  return { key: `${match[1]}:${item.id}`, mode: match[1], caseId: item.id };
}

export function validateRequest(url, init) {
  const headers = new Headers(init.headers);
  if (
    String(url) !== liveEnvelope.endpoint ||
    init.method !== 'POST' ||
    headers.get('ai-language-model-id') !== liveEnvelope.model ||
    headers.get('ai-language-model-streaming') !== 'false'
  )
    throw new Error('Request destination/model not allowed');
  if (typeof init.body !== 'string') throw new Error('Expected JSON body');
  const body = JSON.parse(init.body);
  if (!Array.isArray(body.prompt) || body.prompt.length > 32) throw new Error('Prompt message limit');
  // GPT-4.1 uses byte-level tokens. Count the complete serialized request bytes,
  // including schemas/escaping, plus a conservative 4,096-token framing allowance.
  // Restrict message/tool counts; reject before sending, then check actual usage.
  const inputBound = Buffer.byteLength(init.body) + 4096;
  if (inputBound > liveEnvelope.inputTokens || body.maxOutputTokens !== liveEnvelope.outputTokens)
    throw new Error('Input/output limit');
  const gateway = body.providerOptions?.gateway;
  if (JSON.stringify(gateway) !== JSON.stringify({ only: ['openai'] })) throw new Error('Provider routing not allowed');
  const names = (body.tools ?? []).map((tool) => tool.name).sort();
  if (
    names.some((name) => !['search', 'read_section', 'follow_reference'].includes(name)) ||
    names.length > 3 ||
    (body.tools ?? []).some((tool) => tool.type !== 'function')
  )
    throw new Error('Tool capability not allowed');
  const run = boundRun(headers, body.prompt);
  if (run.mode === 'fixed' && names.length) throw new Error('Fixed control must have no model tools');
  return { ...run, inputBound, fingerprint: createHash('sha256').update(init.body).digest('hex') };
}
export async function createLedger(filename) {
  const file = await open(filename, 'wx', 0o600);
  try {
    await file.writeFile(
      JSON.stringify({
        version: 1,
        authority: 'Owner-approved RAY-266 US$1 synthetic generation comparison',
        reservedNanoUsd: liveEnvelope.requests * requestReservation,
        requests: [],
        blockedRuns: []
      })
    );
  } finally {
    await file.close();
  }
}
export async function updateLedger(filename, change) {
  const lock = await open(`${filename}.lock`, 'wx', 0o600);
  let promoted = false;
  try {
    const ledger = JSON.parse(await readFile(filename, 'utf8'));
    const result = change(ledger);
    await lock.writeFile(JSON.stringify(ledger));
    await lock.sync();
    await rename(`${filename}.lock`, filename);
    promoted = true;
    return result;
  } finally {
    await lock.close();
    if (!promoted)
      await unlink(`${filename}.lock`).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
  }
}
export async function reserveRequest(filename, request) {
  return updateLedger(filename, (ledger) => {
    if (
      ledger.stoppedReason ||
      ledger.version !== 1 ||
      ledger.reservedNanoUsd > liveEnvelope.allowanceNanoUsd ||
      ledger.reservedNanoUsd !== liveEnvelope.requests * requestReservation
    )
      throw new Error('Generation reservation unavailable');
    const previous = ledger.requests.filter((row) => row.key === request.key);
    if (ledger.blockedRuns.includes(request.key) || previous.some((row) => row.fingerprint === request.fingerprint))
      throw new Error('Retry/replay blocked');
    if (ledger.requests.length >= liveEnvelope.requests || previous.length >= (request.mode === 'agent' ? 7 : 1))
      throw new Error('Provider request limit');
    const index = ledger.requests.length;
    ledger.requests.push({
      ...request,
      index,
      status: 'reserved',
      reservationNanoUsd: requestReservation,
      startedAt: Date.now()
    });
    return index;
  });
}
export async function finishRequest(filename, index, result) {
  return updateLedger(filename, (ledger) => {
    const row = ledger.requests[index];
    if (!row || row.status !== 'reserved') throw new Error('Unexpected request settlement');
    Object.assign(row, result, { elapsedMs: Date.now() - row.startedAt });
    if (result.status !== 'completed') ledger.blockedRuns.push(row.key);
    if (result.reason === 'provider-usage-limit') ledger.stoppedReason = result.reason;
  });
}
