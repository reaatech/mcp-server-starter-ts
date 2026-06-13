import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAllSSESessions, fastifySSE, mountSSEFastify } from './fastify.js';

/** Minimal MCP server with a single `ping` tool. */
function serverFactory(): McpServer {
  const server = new McpServer(
    { name: 'fastify-sse-test', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  server.tool('ping', async () => ({ content: [{ type: 'text', text: 'pong' }] }));
  return server;
}

describe('fastifySSE', () => {
  let app: FastifyInstance;
  let baseUrl: string;

  afterEach(async () => {
    clearAllSSESessions();
    vi.restoreAllMocks();
    await app?.close();
  });

  async function startApp(
    register: (instance: FastifyInstance) => Promise<void> = (instance) =>
      instance.register(fastifySSE, { serverFactory }),
  ): Promise<void> {
    app = Fastify();
    await register(app);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  /** Open the SSE stream and read the session id from the `endpoint` event. */
  async function establishSession(): Promise<{
    sessionId: string;
    reader: ReadableStreamDefaultReader<Uint8Array>;
    response: Response;
  }> {
    const response = await fetch(`${baseUrl}/mcp/sse`);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('no SSE body');
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    const sessionId = text.match(/sessionId=([a-f0-9-]+)/)?.[1];
    if (!sessionId) throw new Error(`no sessionId in SSE stream: ${text}`);
    return { sessionId, reader, response };
  }

  it('establishes a session, accepts a message, and cleans up via clearAllSSESessions', async () => {
    await startApp();
    const { sessionId, reader } = await establishSession();

    // A JSON-RPC notification on the session is accepted (202 Accepted).
    const msg = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    });
    expect(msg.status).toBe(202);

    // After clearing sessions, the same id is no longer known.
    clearAllSSESessions();
    const afterClear = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    });
    expect(afterClear.status).toBe(404);

    await reader.cancel();
  });

  it('returns 400 when POST messages is called without a sessionId', async () => {
    await startApp();
    const res = await fetch(`${baseUrl}/mcp/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'Bad Request',
      message: 'sessionId query parameter is required',
    });
  });

  it('returns 404 when POST messages targets an unknown session', async () => {
    await startApp();
    const res = await fetch(`${baseUrl}/mcp/messages?sessionId=nonexistent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1 }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: 'Session not found',
      message: 'No active SSE session with the provided ID',
    });
  });

  it('returns 500 when message handling fails', async () => {
    vi.spyOn(SSEServerTransport.prototype, 'handlePostMessage').mockRejectedValue(
      new Error('message handling failed'),
    );
    await startApp();
    const { sessionId, reader } = await establishSession();

    const res = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 7 }),
    });
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      id: 7,
      error: { code: -32603, message: 'Internal error' },
    });

    await reader.cancel();
  });

  it('mountSSEFastify convenience wrapper works', async () => {
    await startApp((instance) => mountSSEFastify(instance, serverFactory));
    const { sessionId, reader } = await establishSession();

    const msg = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'ping' }),
    });
    expect(msg.status).toBe(202);

    await reader.cancel();
  });

  it('enforces a custom bodyLimit on the messages route', async () => {
    await startApp((instance) => instance.register(fastifySSE, { serverFactory, bodyLimit: 64 }));
    const { sessionId, reader } = await establishSession();

    const oversized = await fetch(`${baseUrl}/mcp/messages?sessionId=${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'ping',
        params: { padding: 'x'.repeat(256) },
      }),
    });
    expect(oversized.status).toBe(413);

    await reader.cancel();
  });

  it('throws when serverFactory option is missing', async () => {
    const instance = Fastify();
    await expect(
      instance.register(
        fastifySSE as unknown as (app: unknown, opts: Record<string, unknown>) => Promise<void>,
        {},
      ),
    ).rejects.toThrow('serverFactory');
    await instance.close();
  });
});
