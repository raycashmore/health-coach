import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { runEvidence } from '../lib/evidence';

export default defineTool({
  description:
    'Read an exact synthetic revision handle; return citation lines and bounded text. Stale handles are unavailable.',
  inputSchema: z.object({ handle: z.string().min(1).max(300) }),
  execute(input) {
    return runEvidence('read_section', input);
  },
  endsTurn: (output) => output.status === 'incomplete'
});
