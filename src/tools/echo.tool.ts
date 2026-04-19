/**
 * Echo tool — returns the input message back to the caller.
 *
 * This is the canonical example tool demonstrating the tool pattern.
 * See skills/echo.md for the skill definition.
 */

import { z } from 'zod';
import { defineTool } from './index.js';
import { textContent } from '../types/domain.js';

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
