import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupExpiredSSESessions, clearAllSSESessions, mountSSE } from './sse.js';

function serverFactory(): McpServer {
  return new McpServer({ name: 'sse-test', version: '1.0.0' }, { capabilities: { tools: {} } });
}

describe('mountSSE', () => {
  let server: ReturnType<(typeof express)['application']['listen']>;
  let baseUrl: string;

  afterEach(() => {
    clearAllSSESessions();
    vi.restoreAllMocks();
    server?.closeAllConnections?.();
    server?.close();
  });

  async function startApp(factory: () => McpServer = serverFactory) {
    const app = express();
    app.use(express.json());
    mountSSE(app, factory);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  it('returns 400 when POST /mcp/messages is called without sessionId', async () => {
    await startApp();
    const res = await fetch(`${baseUrl}/mcp/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Bad Request',
      message: 'sessionId query parameter is required',
    });
  });

  it('returns 404 when POST /mcp/messages is called with unknown sessionId', async () => {
    await startApp();
    const res = await fetch(`${baseUrl}/mcp/messages?sessionId=nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      error: 'Session not found',
      message: 'No active SSE session with the provided ID',
    });
  });

  it('returns 500 when GET /mcp/sse server factory throws', async () => {
    const app = express();
    mountSSE(app, () => {
      throw new Error('factory error');
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    const res = await fetch(`${baseUrl}/mcp/sse`);
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toBe('Failed to establish SSE connection');
  });

  it('returns 500 when GET /mcp/sse server connect fails', async () => {
    const app = express();
    mountSSE(app, () => {
      const srv = new McpServer(
        { name: 'sse-connect-error', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );
      vi.spyOn(srv, 'connect').mockRejectedValue(new Error('connect failed'));
      return srv;
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    const res = await fetch(`${baseUrl}/mcp/sse`);
    expect(res.status).toBe(500);
  });

  it('establishes an SSE session and reads the session ID from the stream', async () => {
    await startApp();

    const sseRes = await fetch(`${baseUrl}/mcp/sse`);
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('Content-Type')).toBe('text/event-stream');
    expect(sseRes.headers.get('Cache-Control')).toMatch(/no-cache/);
    expect(sseRes.headers.get('Connection')).toBe('keep-alive');
    expect(sseRes.headers.get('X-Accel-Buffering') ?? 'no').toBe('no');

    const reader = sseRes.body?.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    const match = text.match(/sessionId=([a-f0-9-]+)/);
    expect(match).not.toBeNull();
    const sessionId = match?.[1];

    const msgRes = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    });
    expect(msgRes.status).toBe(202);

    await reader.cancel();
  });

  it('handles errors in POST /mcp/messages handler', async () => {
    vi.spyOn(SSEServerTransport.prototype, 'handlePostMessage').mockRejectedValue(
      new Error('message handling failed'),
    );

    await startApp();

    const sseRes = await fetch(`${baseUrl}/mcp/sse`);
    expect(sseRes.status).toBe(200);
    const reader = sseRes.body?.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    const sessionId = text.match(/sessionId=([a-f0-9-]+)/)?.[1];

    const msgRes = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
    });
    expect(msgRes.status).toBe(500);

    await reader.cancel();
  });

  it('clearAllSSESessions cleans up sessions', async () => {
    await startApp();

    const sseRes = await fetch(`${baseUrl}/mcp/sse`);
    const reader = sseRes.body?.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    const sessionId = text.match(/sessionId=([a-f0-9-]+)/)?.[1];

    clearAllSSESessions();

    const msgRes = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(msgRes.status).toBe(404);

    await reader.cancel();
  });

  async function establishSession() {
    const sseRes = await fetch(`${baseUrl}/mcp/sse`);
    const reader = sseRes.body?.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    const sessionId = text.match(/sessionId=([a-f0-9-]+)/)?.[1];
    return { sessionId, reader };
  }

  it('cleanupExpiredSSESessions retains sessions within the timeout', async () => {
    await startApp();
    const { sessionId, reader } = await establishSession();

    // Generous timeout: the freshly-established session is not expired.
    cleanupExpiredSSESessions(60_000);

    const msgRes = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    });
    expect(msgRes.status).toBe(202);

    await reader.cancel();
  });

  it('cleanupExpiredSSESessions evicts sessions past the timeout', async () => {
    await startApp();
    const { sessionId, reader } = await establishSession();

    // Negative timeout: every session is older than the threshold -> evicted.
    cleanupExpiredSSESessions(-1);

    const msgRes = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    });
    expect(msgRes.status).toBe(404);

    await reader.cancel();
  });
});
