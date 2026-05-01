import { textContent } from '@reaatech/mcp-server-core';
import { clearTools, defineTool, registerTool } from '@reaatech/mcp-server-tools';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMcpServer, getServerName, getServerVersion } from './index.js';

describe('server', () => {
  beforeEach(() => {
    clearTools();
  });

  it('creates an MCP server with tools', () => {
    const tool = defineTool({
      name: 'test',
      description: 'test',
      inputSchema: z.object({}),
      handler: async () => ({ content: [textContent('ok')] }),
    });
    registerTool(tool);

    const server = createMcpServer([tool]);
    expect(server).toBeDefined();
  });

  it('returns version and name', () => {
    expect(getServerVersion()).toBe('1.0.0');
    expect(getServerName()).toBe('mcp-server-starter-ts');
  });
});
