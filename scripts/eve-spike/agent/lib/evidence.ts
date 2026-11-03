import { defineState } from 'eve/context';
import { evidenceCall, initialEvidenceState } from '../../evidence.mjs';

export const budget = defineState('synthetic-spike.evidence', initialEvidenceState);

export function runEvidence(name: string, input: Record<string, string>) {
  const state = structuredClone(budget.get());
  const result = evidenceCall(state, name, input);
  budget.update(() => state);
  return result;
}
