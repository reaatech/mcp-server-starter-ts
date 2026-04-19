/**
 * E2E tests for SSE transport
 */

import { createTestApp } from './test-utils.js';
import type { Express } from 'express';
import { clearAllSSESessions } from '../../src/transports/sse.js';
import { clearRateLimitStore } from '../../src/middleware/rate-limit.js';
import { clearIdempotencyCache } from '../../src/middleware/idempotency.js';
import echoTool from '../../src/tools/echo.tool.js';
import healthCheckTool from '../../src/tools/health-check.tool.js';

describe('SSE E2E', () => {
  let app: Express;
  let server: import('http').Server;
  const PORT = 8990;
  const BASE_URL = `http://localhost:${PORT}`;

  const originalEnv = process.env;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.PORT = PORT.toString();
    delete process.env.API_KEY;

    app = await createTestApp([echoTool, healthCheckTool], 'sse');
    server = app.listen(PORT);
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
    clearAllSSESessions();
    clearRateLimitStore();
    clearIdempotencyCache();
    process.env = originalEnv;
  });

  describe('SSE connection', () => {
    it('should establish SSE connection', async () => {
      const response = await fetch(`${BASE_URL}/mcp/sse`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      response.body?.cancel();
    });

    it('should receive endpoint event on SSE connection', async () => {
      const response = await fetch(`${BASE_URL}/mcp/sse`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      expect(response.status).toBe(200);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        const { value } = await reader.read();
        const event = decoder.decode(value);
        expect(event).toContain('endpoint');

        await reader.cancel();
      }
    });
  });

  describe('SSE message handling', () => {
    let _sessionId: string | undefined;

    beforeAll(async () => {
      const response = await fetch(`${BASE_URL}/mcp/sse`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
        },
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        const { value } = await reader.read();
        const event = decoder.decode(value);
        const match = event.match(/sessionId=([^&"]+)/);
        if (match) {
          _sessionId = match[1];
        }

        await reader.cancel();
      }
    });

    it('should reject messages without sessionId', async () => {
      const response = await fetch(`${BASE_URL}/mcp/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'test' },
          },
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should use sessionId from beforeAll', async () => {
      expect(_sessionId).toBeDefined();
    });

    it('should reject messages with invalid sessionId', async () => {
      const response = await fetch(`${BASE_URL}/mcp/messages?sessionId=invalid-id`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'echo',
            arguments: { message: 'test' },
          },
        }),
      });

      expect(response.status).toBe(404);
    });
  });
});
