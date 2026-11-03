const shared = {
  inputTokens: 40000,
  outputTokens: 1000,
  contextWindow: 1_047_576,
  endpoint: 'https://ai-gateway.vercel.sh/v4/ai/language-model',
  api: 'gateway',
  model: 'openai/gpt-4.1-mini',
  provider: 'openai',
  inputNanoUsd: 400,
  outputNanoUsd: 1600
};
export const modelProfiles = Object.freeze({
  original: Object.freeze({
    ...shared,
    id: 'original',
    requests: 40,
    allowanceNanoUsd: 1_000_000_000,
    agentOnly: false
  }),
  'mini-corrected': Object.freeze({
    ...shared,
    id: 'mini-corrected',
    outputTokens: 2000,
    requests: 35,
    allowanceNanoUsd: 700_000_000,
    agentOnly: true
  }),
  'sonnet-5.5-low': Object.freeze({
    ...shared,
    id: 'sonnet-5.5-low',
    outputTokens: 2000,
    api: 'anthropic',
    endpoint: 'https://ai-gateway.vercel.sh/v1/messages',
    model: 'anthropic/claude-sonnet-5.5',
    provider: 'anthropic',
    reasoning: 'low',
    contextWindow: 1_000_000,
    requests: 35,
    // Includes the 5-minute cache-write premium even though caching is disabled.
    inputNanoUsd: 2500,
    outputNanoUsd: 10000,
    allowanceNanoUsd: 4_300_000_000,
    agentOnly: true
  })
});
export function selectModelProfile(id = 'original') {
  const profile = Object.hasOwn(modelProfiles, id) ? modelProfiles[id] : undefined;
  if (!profile) throw new Error('Unknown model comparison profile');
  return profile;
}
export const modelComparisonIds = Object.freeze(['mini-corrected', 'sonnet-5.5-low']);
export function comparisonReservation() {
  return modelComparisonIds.reduce((sum, id) => {
    const p = selectModelProfile(id);
    return sum + p.requests * (p.inputTokens * p.inputNanoUsd + p.outputTokens * p.outputNanoUsd);
  }, 0);
}
