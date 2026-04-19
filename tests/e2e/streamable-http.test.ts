/**
 * E2E tests for StreamableHTTP transport
 */

import { createTestApp } from './test-utils.js';
import type { Express } from 'express';
import { clearAllSessions } from '../../src/transports/streamable-http.js';
import { clearRateLimitStore } from '../../src/middleware/rate-limit.js';
import { clearIdempotencyCache } from '../../src/middleware/idempotency.js';
import echoTool from '../../src/tools/echo.tool.js';
import healthCheckTool from '../../src/tools/health-check.tool.js';

describe('StreamableHTTP E2E', () => {
  let app: Express;
  let server: import('http').Server;
  const PORT = 8989;
  const BASE_URL = `http://localhost:${PORT}`;

  const originalEnv = process.env;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = PORT.toString();
    delete process.env.API_KEY;

    app = await createTestApp([echoTool, healthCheckTool], 'streamable-http');
    server = app.listen(PORT);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    clearAllSessions();
    clearRateLimitStore();
    clearIdempotencyCache();
    process.env = originalEnv;
  });

  describe('Health endpoints', () => {
    it('should return health status', async () => {
      const response = await fetch(`${BASE_URL}/health`);
      expect(response.status).toBe(200);

      const data = (await response.json()) as Record<string, unknown>;
      expect(data.status).toBe('healthy');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('uptime');
    });

    it('should return ready status', async () => {
      const response = await fetch(`${BASE_URL}/ready`);
      expect(response.status).toBe(200);

      const data = (await response.json()) as Record<string, unknown>;
      expect(data.status).toBe('ready');
    });

    it('should return live status', async () => {
      const response = await fetch(`${BASE_URL}/live`);
      expect(response.status).toBe(200);

      const data = (await response.json()) as Record<string, unknown>;
      expect(data.status).toBe('alive');
    });
  });

  describe('MCP endpoints', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await fetch(`${BASE_URL}/nonexistent`);
      expect(response.status).toBe(404);
    });

    it('should accept POST to /mcp', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.jsonrpc).toBe('2.0');
      expect(data.id).toBe(1);
    });
  });

  describe('Tool invocation via MCP', () => {
    let sessionId: string | undefined;

    it('should initialize session and get session ID', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        }),
      });

      expect(response.status).toBe(200);
      sessionId = response.headers.get('Mcp-Session-Id') ?? undefined;
      expect(sessionId).toBeTruthy();
    });

    it('should call echo tool', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(sessionId && { 'Mcp-Session-Id': sessionId }),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'Hello E2E Test!' },
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        result: { content: { text: string }[] };
      };
      expect(data.result).toBeDefined();
      expect(data.result.content[0]?.text).toBe('Hello E2E Test!');
    });

    it('should call health-check tool', async () => {
      const response = await fetch(`${BASE_URL}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...(sessionId && { 'Mcp-Session-Id': sessionId }),
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'health-check',
            arguments: {},
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as {
        result: { content: { text: string }[] };
      };
      expect(data.result.content[0]?.text).toContain('"status":"healthy"');
    });
  });
});
