import { defineTool } from 'eve/tools';
import { z } from 'zod';
import { runEvidence } from '../lib/evidence';

export default defineTool({
  description:
    'Follow an exact explicit Markdown reference from a current source to an allowlisted synthetic note heading.',
  inputSchema: z.object({ source_handle: z.string().min(1).max(300), reference: z.string().min(1).max(300) }),
  execute(input) {
    return runEvidence('follow_reference', input);
  },
  endsTurn: (output) => output.status === 'incomplete'
});
