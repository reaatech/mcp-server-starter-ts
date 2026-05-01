import { textContent } from '@reaatech/mcp-server-core';
import { z } from 'zod';
import { defineTool } from './registry.js';

export default defineTool({
  name: 'echo',
  description:
    'Echo the input message back to the caller. Useful for testing MCP connectivity and as a template for building new tools.',
  inputSchema: z.object({
    message: z.string().describe('The message to echo back'),
  }),
  handler: async ({ message }) => {
    return {
      content: [textContent(String(message))],
    };
  },
});
