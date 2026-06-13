import type { AddressInfo } from 'node:net';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import express from 'express';
import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAllSessions } from './core.js';
import { fastifyStreamableHTTP, mountStreamableHTTPFastify } from './fastify.js';
import { mountStreamableHTTP } from './streamable-http.js';

/** Minimal MCP server with a single `ping` tool. */
function serverFactory(): McpServer {
  const server = new McpServer(
    { name: 'transport-test', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  server.tool('ping', async () => ({ content: [{ type: 'text', text: 'pong' }] }));
  return server;
}

const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

const INITIALIZE_BODY = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
};

async function post(
  baseUrl: string,
  body: unknown,
  sessionId?: string,
): Promise<{ status: number; sessionId: string | null; json: unknown }> {
  const headers: Record<string, string> = { ...MCP_HEADERS };
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return {
    status: res.status,
    sessionId: res.headers.get('mcp-session-id'),
    json: text ? JSON.parse(text) : undefined,
  };
}

async function del(
  baseUrl: string,
  sessionId?: string,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {};
  if (sessionId) {
    headers['mcp-session-id'] = sessionId;
  }
  const res = await fetch(`${baseUrl}/mcp`, { method: 'DELETE', headers });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : undefined };
}

/** Shared behavioural contract exercised against every adapter. */
function streamableHTTPContract(
  start: () => Promise<{ baseUrl: string; close: () => Promise<void> }>,
) {
  let baseUrl: string;
  let close: () => Promise<void>;

  async function setup(): Promise<void> {
    ({ baseUrl, close } = await start());
  }

  afterEach(async () => {
    clearAllSessions();
    await close?.();
  });

  it('initializes a session, handles a request, and terminates via DELETE', async () => {
    await setup();

    // 1. Initialize -> returns a session id and server info.
    const init = await post(baseUrl, INITIALIZE_BODY);
    expect(init.status).toBe(200);
    expect(init.sessionId).toBeTruthy();
    const sessionId = init.sessionId as string;
    expect(
      (init.json as { result?: { serverInfo?: { name?: string } } }).result?.serverInfo?.name,
    ).toBe('transport-test');

    // 2. Complete the handshake.
    const initialized = await post(
      baseUrl,
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      sessionId,
    );
    expect(initialized.status).toBe(202);

    // 3. A JSON-RPC request on the session returns the registered tool.
    const list = await post(
      baseUrl,
      { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
      sessionId,
    );
    expect(list.status).toBe(200);
    const tools =
      (list.json as { result?: { tools?: Array<{ name: string }> } }).result?.tools ?? [];
    expect(tools.map((t) => t.name)).toContain('ping');

    // 4. Terminate the session.
    const terminated = await del(baseUrl, sessionId);
    expect(terminated.status).toBe(200);
    expect(terminated.json).toEqual({ success: true });
  });

  it('returns 404 when terminating an unknown session', async () => {
    await setup();
    const res = await del(baseUrl, 'does-not-exist');
    expect(res.status).toBe(404);
  });
}

describe('mountStreamableHTTP (Express)', () => {
  streamableHTTPContract(async () => {
    const app = express();
    app.use(express.json());
    mountStreamableHTTP(app, serverFactory);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    };
  });
});

describe('fastifyStreamableHTTP (Fastify)', () => {
  streamableHTTPContract(async () => {
    const app = Fastify();
    await app.register(fastifyStreamableHTTP, { serverFactory });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    return {
      baseUrl: `http://127.0.0.1:${port}`,
      close: () => app.close(),
    };
  });
});

describe('core error handling', () => {
  let httpServer: ReturnType<typeof httpListen>;
  let baseUrl: string;

  function httpListen(app: express.Express) {
    const s = app.listen(0);
    return s;
  }

  afterEach(() => {
    clearAllSessions();
    httpServer?.closeAllConnections?.();
    httpServer?.close();
  });

  it('returns 500 JSON-RPC error when server connect fails', async () => {
    const app = express();
    app.use(express.json());
    mountStreamableHTTP(app, () => {
      const server = new McpServer(
        { name: 'error-test', version: '1.0.0' },
        { capabilities: { tools: {} } },
      );
      vi.spyOn(server, 'connect').mockRejectedValue(new Error('connection refused'));
      return server;
    });
    httpServer = app.listen(0);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { ...MCP_HEADERS },
      body: JSON.stringify(INITIALIZE_BODY),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error?: { code?: number; message?: string };
      id?: unknown;
      jsonrpc?: string;
    };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error?.code).toBe(-32603);
    expect(body.error?.message).toBe('Internal error');
    expect(body.id).toBe(1);
  });

  it('clearAllSessions terminates all active sessions', async () => {
    const app = express();
    app.use(express.json());
    mountStreamableHTTP(app, serverFactory);
    httpServer = app.listen(0);
    await new Promise<void>((resolve) => httpServer.once('listening', resolve));
    const { port } = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;

    const init = await post(baseUrl, INITIALIZE_BODY);
    const sessionId = init.sessionId as string;

    clearAllSessions();

    const res = await del(baseUrl, sessionId);
    expect(res.status).toBe(404);
  });
});

describe('request context propagation', () => {
  afterEach(() => {
    clearAllSessions();
  });

  it('forwards requestContext.requestId on the Express adapter (POST + DELETE)', async () => {
    const app = express();
    app.use(express.json());
    app.use((req: express.Request & { requestContext?: { requestId: string } }, _res, next) => {
      req.requestContext = { requestId: 'express-req-id' };
      next();
    });
    mountStreamableHTTP(app, serverFactory);
    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const init = await post(baseUrl, INITIALIZE_BODY);
    expect(init.sessionId).toBeTruthy();
    const delRes = await del(baseUrl, init.sessionId as string);
    expect(delRes.status).toBe(200);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('forwards requestContext.requestId on the Fastify adapter (POST + DELETE)', async () => {
    const app = Fastify();
    app.addHook('onRequest', (req, _reply, done) => {
      (req as { requestContext?: { requestId: string } }).requestContext = {
        requestId: 'fastify-req-id',
      };
      done();
    });
    await app.register(fastifyStreamableHTTP, { serverFactory });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const init = await post(baseUrl, INITIALIZE_BODY);
    expect(init.sessionId).toBeTruthy();
    const delRes = await del(baseUrl, init.sessionId as string);
    expect(delRes.status).toBe(200);

    await app.close();
  });
});

describe('fastifyStreamableHTTP standalone', () => {
  afterEach(() => {
    clearAllSessions();
  });

  it('throws when serverFactory option is missing', async () => {
    const app = Fastify();
    await expect(
      app.register(
        fastifyStreamableHTTP as unknown as (
          app: unknown,
          opts: Record<string, unknown>,
        ) => Promise<void>,
        {},
      ),
    ).rejects.toThrow('serverFactory');
    await app.close();
  });

  it('mountStreamableHTTPFastify convenience wrapper works', async () => {
    const app = Fastify();
    await mountStreamableHTTPFastify(app, serverFactory);
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    const init = await post(baseUrl, INITIALIZE_BODY);
    expect(init.sessionId).toBeTruthy();

    const delRes = await del(baseUrl, init.sessionId as string);
    expect(delRes.status).toBe(200);

    clearAllSessions();
    await app.close();
  });
});
