/**
 * Unit tests for server module
 */

import { createMcpServer, getServerVersion, getServerName, SERVER_INFO } from '../../src/server.js';
import { z } from 'zod';
import { defineTool } from '../../src/tools/index.js';
import { textContent } from '../../src/types/domain.js';

const originalEnv = process.env;

describe('server', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('createMcpServer', () => {
    it('should create server with no tools', () => {
      const server = createMcpServer([]);
      expect(server).toBeDefined();
    });

    it('should create server with tools', () => {
      const tool = defineTool({
        name: 'test-tool',
        description: 'A test tool',
        inputSchema: z.object({
          value: z.string(),
        }),
        handler: async (args: Record<string, unknown>) => {
          return { content: [textContent(args.value as string)] };
        },
      });

      const server = createMcpServer([tool]);
      expect(server).toBeDefined();
    });

    it('should create server with multiple tools', () => {
      const tool1 = defineTool({
        name: 'tool-1',
        description: 'First tool',
        inputSchema: z.object({}),
        handler: async () => ({ content: [textContent('1')] }),
      });

      const tool2 = defineTool({
        name: 'tool-2',
        description: 'Second tool',
        inputSchema: z.object({}),
        handler: async () => ({ content: [textContent('2')] }),
      });

      const server = createMcpServer([tool1, tool2]);
      expect(server).toBeDefined();
    });
  });

  describe('getServerVersion', () => {
    it('should return version from SERVER_INFO', () => {
      expect(getServerVersion()).toBe(SERVER_INFO.version);
    });
  });

  describe('getServerName', () => {
    it('should return name from SERVER_INFO', () => {
      expect(getServerName()).toBe(SERVER_INFO.name);
    });
  });
});
