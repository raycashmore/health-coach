import { defineInstructions } from 'eve/instructions';
import { answerInstructions } from '../../prompt.mjs';

export default defineInstructions({ content: answerInstructions });
