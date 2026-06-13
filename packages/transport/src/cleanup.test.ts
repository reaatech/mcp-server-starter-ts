import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupExpiredSessions, clearAllSessions, handleStreamableHTTPDelete } from './core.js';
import { clearAllSSESessions, mountSSE } from './sse.js';

function serverFactory(): McpServer {
  return new McpServer({ name: 'cleanup-test', version: '1.0.0' }, { capabilities: { tools: {} } });
}

async function startCoreSession(serverFactoryOverride?: () => McpServer) {
  const app = express();
  app.use(express.json());
  const { mountStreamableHTTP } = await import('./streamable-http.js');
  mountStreamableHTTP(app, serverFactoryOverride ?? serverFactory);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const res = await fetch(`${baseUrl}/mcp`, {
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
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      },
    }),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  const sessionId = res.headers.get('mcp-session-id');

  return { baseUrl, server, sessionId, json, status: res.status };
}

describe('cleanup functions', () => {
  afterEach(() => {
    clearAllSessions();
    clearAllSSESessions();
    vi.restoreAllMocks();
  });

  it('handleStreamableHTTPDelete returns 404 for unknown session', () => {
    const result = handleStreamableHTTPDelete('nonexistent-id');
    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: 'Session not found',
      message: 'No active session with the provided ID',
    });
  });

  it('handleStreamableHTTPDelete returns 200 and closes session', async () => {
    const { sessionId, server } = await startCoreSession();
    expect(sessionId).toBeTruthy();

    const result = handleStreamableHTTPDelete(sessionId ?? '');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true });

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('handleStreamableHTTPDelete with request context', () => {
    const result = handleStreamableHTTPDelete(undefined, { requestId: 'test-req-id' });
    expect(result.status).toBe(404);
  });

  it('cleanupExpiredSessions retains sessions within the timeout', async () => {
    const { sessionId, server } = await startCoreSession();
    expect(sessionId).toBeTruthy();

    // Generous timeout: the freshly-created session is not expired.
    cleanupExpiredSessions(60_000);

    // Still present -> DELETE succeeds.
    const result = handleStreamableHTTPDelete(sessionId ?? '');
    expect(result.status).toBe(200);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('cleanupExpiredSessions evicts sessions past the timeout', async () => {
    const { sessionId, server } = await startCoreSession();
    expect(sessionId).toBeTruthy();

    // Negative timeout: every session is older than the threshold -> evicted.
    cleanupExpiredSessions(-1);

    // Gone -> DELETE reports 404.
    const result = handleStreamableHTTPDelete(sessionId ?? '');
    expect(result.status).toBe(404);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('handleStreamableHTTPRequest with request context errors', async () => {
    const app = express();
    app.use(express.json());
    const { mountStreamableHTTP } = await import('./streamable-http.js');
    mountStreamableHTTP(app, () => {
      const srv = new McpServer(
        { name: 'ctx-error-test', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );
      vi.spyOn(srv, 'connect').mockRejectedValue(new Error('connection error'));
      return srv;
    });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: null, method: 'initialize', params: {} }),
    });
    expect(res.status).toBe(500);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /mcp/sse with request context header on error', async () => {
    const app = express();
    app.use((req: express.Request & { requestContext?: { requestId: string } }, _res, next) => {
      req.requestContext = { requestId: 'test-id' };
      next();
    });
    mountSSE(app, () => {
      throw new Error('startup error');
    });
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const res = await fetch(`${baseUrl}/mcp/sse`);
    expect(res.status).toBe(500);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
