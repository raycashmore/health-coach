import { defineState } from 'eve/context';

export const modelCallLimit = 6;
export const modelCalls = defineState('synthetic-spike.model-calls', () => 0);
