/**
 * Unit tests for tool discovery (tools/index.ts)
 */

import {
  defineTool,
  registerTool,
  getTools,
  getTool,
  clearTools,
  discoverTools,
} from '../../../src/tools/index.js';
import { z } from 'zod';
import { textContent } from '../../../src/types/domain.js';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

describe('tools/index', () => {
  const originalCwd = process.cwd();

  beforeEach(() => {
    clearTools();
  });

  afterEach(() => {
    process.chdir(originalCwd);
  });

  describe('defineTool', () => {
    it('should create a tool definition', () => {
      const tool = defineTool({
        name: 'my-tool',
        description: 'My tool description',
        inputSchema: z.object({
          param: z.string().describe('A parameter'),
        }),
        handler: async (args: Record<string, unknown>) => {
          return { content: [textContent(args.param as string)] };
        },
      });

      expect(tool.name).toBe('my-tool');
      expect(tool.description).toBe('My tool description');
      expect(tool.inputSchema).toBeInstanceOf(z.ZodObject);
      expect(typeof tool.handler).toBe('function');
    });

    it('should preserve tool properties', () => {
      const tool = defineTool({
        name: 'test',
        description: 'test desc',
        inputSchema: z.object({}),
        handler: async () => ({ content: [] }),
      });

      expect(tool.name).toBe('test');
      expect(tool.description).toBe('test desc');
    });
  });

  describe('registerTool', () => {
    it('should register a tool', () => {
      const tool = defineTool({
        name: 'registered-tool',
        description: 'A registered tool',
        inputSchema: z.object({}),
        handler: async () => ({ content: [] }),
      });

      registerTool(tool);
      const tools = getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe('registered-tool');
    });

    it('should throw when registering duplicate tool', () => {
      const tool = defineTool({
        name: 'duplicate',
        description: 'Dup',
        inputSchema: z.object({}),
        handler: async () => ({ content: [] }),
      });

      registerTool(tool);
      expect(() => registerTool(tool)).toThrow('already registered');
    });

    it('should register multiple tools', () => {
      const tool1 = defineTool({
        name: 'tool-a',
        description: 'A',
        inputSchema: z.object({}),
        handler: async () => ({ content: [] }),
      });
      const tool2 = defineTool({
        name: 'tool-b',
        description: 'B',
        inputSchema: z.object({}),
        handler: async () => ({ content: [] }),
      });

      registerTool(tool1);
      registerTool(tool2);

      expect(getTools()).toHaveLength(2);
    });
  });

  describe('getTools', () => {
    it('should return empty array when no tools registered', () => {
      expect(getTools()).toHaveLength(0);
    });

    it('should return a copy of tools', () => {
      const tool = defineTool({
        name: 'copy-test',
        description: 'Test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [] }),
      });
      registerTool(tool);

      const tools1 = getTools();
      const tools2 = getTools();
      expect(tools1).not.toBe(tools2);
      expect(tools1).toEqual(tools2);
    });
  });

  describe('getTool', () => {
    it('should return undefined for unknown tool', () => {
      expect(getTool('unknown')).toBeUndefined();
    });

    it('should return tool by name', () => {
      const tool = defineTool({
        name: 'lookup-test',
        description: 'Lookup',
        inputSchema: z.object({}),
        handler: async () => ({ content: [] }),
      });
      registerTool(tool);

      const found = getTool('lookup-test');
      expect(found).toBeDefined();
      expect(found?.name).toBe('lookup-test');
    });
  });

  describe('clearTools', () => {
    it('should clear all registered tools', () => {
      registerTool(
        defineTool({
          name: 'clear-test',
          description: 'Test',
          inputSchema: z.object({}),
          handler: async () => ({ content: [] }),
        })
      );

      expect(getTools()).toHaveLength(1);
      clearTools();
      expect(getTools()).toHaveLength(0);
    });

    it('should allow re-registration after clear', () => {
      registerTool(
        defineTool({
          name: 're-register',
          description: 'Test',
          inputSchema: z.object({}),
          handler: async () => ({ content: [] }),
        })
      );

      clearTools();

      registerTool(
        defineTool({
          name: 're-register',
          description: 'Test again',
          inputSchema: z.object({}),
          handler: async () => ({ content: [] }),
        })
      );

      expect(getTools()).toHaveLength(1);
    });
  });

  describe('discoverTools', () => {
    it('should discover compiled tools from dist/src/tools', async () => {
      const tempDir = await mkdtemp(path.join(originalCwd, '.tmp-tools-'));

      try {
        const toolsDir = path.join(tempDir, 'dist/src/tools');
        await mkdir(toolsDir, { recursive: true });
        await writeFile(
          path.join(toolsDir, 'compiled.tool.js'),
          `
            module.exports = {
              name: 'compiled-tool',
              description: 'Tool loaded from compiled output',
              inputSchema: { shape: {} },
              handler: async () => ({ content: [{ type: 'text', text: 'compiled' }] }),
            };
          `,
          'utf8'
        );

        process.chdir(tempDir);

        const tools = await discoverTools();

        expect(tools).toHaveLength(1);
        expect(tools[0]?.name).toBe('compiled-tool');
      } finally {
        process.chdir(originalCwd);
        await rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
