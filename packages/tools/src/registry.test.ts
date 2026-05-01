import { textContent } from '@reaatech/mcp-server-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { clearTools, defineTool, getTools, registerTool } from './registry.js';

describe('tools', () => {
  beforeEach(() => {
    clearTools();
  });

  it('registers and retrieves tools', () => {
    const tool = defineTool({
      name: 'test-tool',
      description: 'A test tool',
      inputSchema: z.object({}),
      handler: async () => ({ content: [textContent('ok')] }),
    });

    registerTool(tool);
    expect(getTools()).toHaveLength(1);
    expect(getTools()[0].name).toBe('test-tool');
  });

  it('throws on duplicate tool name', () => {
    const tool = defineTool({
      name: 'dup',
      description: 'Duplicate',
      inputSchema: z.object({}),
      handler: async () => ({ content: [textContent('ok')] }),
    });

    registerTool(tool);
    expect(() => registerTool(tool)).toThrow('already registered');
  });
});
