import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { answerSchema } from './contracts';
import { contextInstructions } from './evidence';
import type { EvidencePacket } from './evidence';

export const defaultContextModel = 'openai/gpt-6.1-terra';
export const contextReasoning = 'medium';
export async function generateContextAnswer(evidence: EvidencePacket, model: LanguageModel) {
  const result = await generateText({
    model,
    reasoning: contextReasoning,
    system: contextInstructions,
    prompt: evidence.prompt,
    output: Output.object({ schema: answerSchema }),
    maxOutputTokens: 6000,
    maxRetries: 0,
    timeout: 30_000,
    providerOptions: { gateway: { disallowPromptTraining: true }, openai: { store: false, reasoningSummary: null } },
    experimental_telemetry: { isEnabled: false }
  });
  if (result.finishReason !== 'stop') throw new Error('incomplete-generation');
  const answer = answerSchema.parse(result.output);
  if (answer.findings.some((finding) => finding.evidenceIds.some((id) => !evidence.evidenceIds.includes(id))))
    throw new Error('invalid-citation');
  return { answer, inputTokens: result.usage.inputTokens ?? null, outputTokens: result.usage.outputTokens ?? null };
}
