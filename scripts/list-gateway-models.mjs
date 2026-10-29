import { isMain } from './development-environment.mjs';

export function latestOpenAIModels(data) {
  return data
    .filter((model) => typeof model.id === 'string' && model.id.startsWith('openai/') && model.type === 'language')
    .sort((a, b) => (b.released ?? b.created ?? 0) - (a.released ?? a.created ?? 0))
    .slice(0, 8)
    .map((model) => ({
      id: model.id,
      released: model.released,
      inputPerMillion: model.pricing?.input ? Number(model.pricing.input) * 1_000_000 : null,
      outputPerMillion: model.pricing?.output ? Number(model.pricing.output) * 1_000_000 : null,
      reasoningEfforts: model.reasoning_options?.find((option) => option.type === 'effort')?.values
    }));
}

if (isMain(import.meta.url)) {
  try {
    const response = await fetch('https://ai-gateway.vercel.sh/v1/models', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Catalog unavailable');
    const { data } = await response.json();
    console.log(JSON.stringify(latestOpenAIModels(data), null, 2));
  } catch {
    console.error('The public Gateway model catalog could not be read. No model request was made.');
    process.exitCode = 1;
  }
}
