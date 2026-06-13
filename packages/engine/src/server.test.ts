import type { ToolDefinition } from '@reaatech/mcp-server-tools';
import { clearTools, registerTool } from '@reaatech/mcp-server-tools';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createMcpServer, getServerName, getServerVersion } from './server.js';

const { capturedHandlers } = vi.hoisted(() => {
  const capturedHandlers = new Map<string, (...args: unknown[]) => unknown>();
  return { capturedHandlers };
});

vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: vi.fn(() => ({
    tool: vi.fn(
      (name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) => {
        capturedHandlers.set(name, handler);
      },
    ),
  })),
}));

describe('server', () => {
  beforeEach(() => {
    clearTools();
    capturedHandlers.clear();
  });

  describe('createMcpServer', () => {
    it('creates an MCP server with tools', () => {
      const tool: ToolDefinition = {
        name: 'test',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      };
      registerTool(tool);
      const server = createMcpServer([tool]);
      expect(server).toBeDefined();
    });

    it('handles text content type', async () => {
      const tool: ToolDefinition = {
        name: 'text-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [{ type: 'text', text: 'hello world' }] }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('text-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({ content: [{ type: 'text', text: 'hello world' }] });
    });

    it('handles image content type', async () => {
      const tool: ToolDefinition = {
        name: 'image-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({
          content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
        }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('image-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({
        content: [{ type: 'image', data: 'base64data', mimeType: 'image/png' }],
      });
    });

    it('handles resource content with blob', async () => {
      const tool: ToolDefinition = {
        name: 'resource-blob-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({
          content: [
            {
              type: 'resource',
              uri: 'file:///test.bin',
              blob: 'binary',
              mimeType: 'application/octet-stream',
            },
          ],
        }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('resource-blob-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'file:///test.bin',
              blob: 'binary',
              mimeType: 'application/octet-stream',
            },
          },
        ],
      });
    });

    it('handles resource content with text', async () => {
      const tool: ToolDefinition = {
        name: 'resource-text-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({
          content: [
            {
              type: 'resource',
              uri: 'file:///test.txt',
              text: 'file content',
              mimeType: 'text/plain',
            },
          ],
        }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('resource-text-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({
        content: [
          {
            type: 'resource',
            resource: { uri: 'file:///test.txt', text: 'file content', mimeType: 'text/plain' },
          },
        ],
      });
    });

    it('handles resource content with blob and no mimeType', async () => {
      const tool: ToolDefinition = {
        name: 'blob-no-mime',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({
          content: [{ type: 'resource', uri: 'file:///test.bin', blob: 'data' }],
        }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('blob-no-mime') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({
        content: [{ type: 'resource', resource: { uri: 'file:///test.bin', blob: 'data' } }],
      });
    });

    it('handles resource content with text and no mimeType', async () => {
      const tool: ToolDefinition = {
        name: 'text-no-mime',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({
          content: [{ type: 'resource', uri: 'file:///test.txt', text: 'hello' }],
        }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('text-no-mime') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({
        content: [{ type: 'resource', resource: { uri: 'file:///test.txt', text: 'hello' } }],
      });
    });

    it('handles resource content with resource key directly', async () => {
      const tool: ToolDefinition = {
        name: 'direct-resource-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({
          content: [{ type: 'resource', resource: { uri: 'file:///test.txt', text: 'direct' } }],
        }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('direct-resource-tool') as (
        ...args: unknown[]
      ) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({
        content: [{ type: 'resource', resource: { uri: 'file:///test.txt', text: 'direct' } }],
      });
    });

    it('handles unknown content type via fallthrough cast', async () => {
      const tool: ToolDefinition = {
        name: 'unknown-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [{ type: 'unknown' as const, custom: 'data' }] }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('unknown-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({ content: [{ type: 'unknown', custom: 'data' }] });
    });

    it('handles isError true response', async () => {
      const tool: ToolDefinition = {
        name: 'error-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [{ type: 'text', text: 'error' }], isError: true }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('error-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as {
        content: unknown[];
        isError?: boolean;
      };
      expect(result).toEqual({ content: [{ type: 'text', text: 'error' }], isError: true });
    });

    it('handles isError false (omits isError)', async () => {
      const tool: ToolDefinition = {
        name: 'ok-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [{ type: 'text', text: 'ok' }], isError: false }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('ok-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { isError?: boolean };
      expect(result.isError).toBeUndefined();
    });

    it('handles tool handler throwing an Error', async () => {
      const tool: ToolDefinition = {
        name: 'throw-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => {
          throw new Error('something broke');
        },
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('throw-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as {
        content: { text: string }[];
        isError: boolean;
      };
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: something broke' }],
        isError: true,
      });
    });

    it('handles non-Error throws', async () => {
      const tool: ToolDefinition = {
        name: 'string-throw',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => {
          throw 'string error';
        },
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('string-throw') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as {
        content: { text: string }[];
        isError: boolean;
      };
      expect(result).toEqual({
        content: [{ type: 'text', text: 'Error: Unknown error' }],
        isError: true,
      });
    });

    it('uses unknown as default requestId when not provided', async () => {
      const tool: ToolDefinition = {
        name: 'no-reqid',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('no-reqid') as (...args: unknown[]) => unknown;
      const result = (await handler({}, {})) as { content: unknown[] };
      expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    });

    it('handles resource content with uri and no text field', async () => {
      const tool: ToolDefinition = {
        name: 'resource-no-text',
        description: 'test',
        inputSchema: z.object({}),
        handler: async () => ({ content: [{ type: 'resource', uri: 'file:///test.txt' }] }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('resource-no-text') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1' })) as { content: unknown[] };
      expect(result).toEqual({
        content: [{ type: 'resource', resource: { uri: 'file:///test.txt', text: '' } }],
      });
    });

    it('sets sessionId when present in extra', async () => {
      const tool: ToolDefinition = {
        name: 'session-tool',
        description: 'test',
        inputSchema: z.object({}),
        handler: async (_args, context) => ({
          content: [{ type: 'text', text: context.request.sessionId ?? 'none' }],
        }),
      };
      createMcpServer([tool]);
      const handler = capturedHandlers.get('session-tool') as (...args: unknown[]) => unknown;
      const result = (await handler({}, { requestId: 'req-1', sessionId: 'sess-1' })) as {
        content: { text: string }[];
      };
      expect(result).toEqual({ content: [{ type: 'text', text: 'sess-1' }] });
    });

    it('handles empty tools array', () => {
      const server = createMcpServer([]);
      expect(server).toBeDefined();
    });
  });

  describe('getServerVersion', () => {
    it('returns version', () => {
      expect(getServerVersion()).toBe('1.0.0');
    });
  });

  describe('getServerName', () => {
    it('returns name', () => {
      expect(getServerName()).toBe('mcp-server-starter-ts');
    });
  });
});
