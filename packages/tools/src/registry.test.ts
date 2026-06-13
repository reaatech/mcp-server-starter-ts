import { textContent } from '@reaatech/mcp-server-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  clearTools,
  defineTool,
  discoverTools,
  getTool,
  getTools,
  registerTool,
} from './registry.js';

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

describe('getTool', () => {
  beforeEach(() => {
    clearTools();
  });

  it('returns undefined for unknown tool', () => {
    expect(getTool('nonexistent')).toBeUndefined();
  });

  it('returns a registered tool by name', () => {
    const tool = defineTool({
      name: 'find-me',
      description: 'Find this tool',
      inputSchema: z.object({}),
      handler: async () => ({ content: [textContent('found')] }),
    });
    registerTool(tool);
    expect(getTool('find-me')).toBe(tool);
  });
});

describe('clearTools', () => {
  beforeEach(() => {
    clearTools();
  });

  it('clears all registered tools', () => {
    const tool = defineTool({
      name: 'temp',
      description: 'Temporary',
      inputSchema: z.object({}),
      handler: async () => ({ content: [textContent('temp')] }),
    });
    registerTool(tool);
    expect(getTools()).toHaveLength(1);
    clearTools();
    expect(getTools()).toHaveLength(0);
  });
});

describe('discoverTools', () => {
  beforeEach(() => {
    clearTools();
  });

  it('discovers built-in echo and health-check tools', async () => {
    const tools = await discoverTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('echo');
    expect(names).toContain('health-check');
  });

  it('registers tools via discoverTools', async () => {
    const tools = await discoverTools();
    expect(getTools()).toHaveLength(tools.length);
  });

  it('returns tool definitions with valid handlers', async () => {
    const tools = await discoverTools();
    for (const tool of tools) {
      expect(typeof tool.handler).toBe('function');
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
    }
  });
});
