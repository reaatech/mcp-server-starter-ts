import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { envConfig } from '@reaatech/mcp-server-core';
import { logger, recordTransportRequest } from '@reaatech/mcp-server-observability';
import type { RequestLogContext } from './core.js';
import { updateTransportSessionCount } from './session-metrics.js';

/**
 * Framework-agnostic core for the legacy MCP SSE transport.
 *
 * Mirrors `./core.js` (Streamable HTTP): it owns the SSE session lifecycle and
 * drives the SDK's {@link SSEServerTransport}, which operates on raw Node
 * `http.IncomingMessage` / `http.ServerResponse`. Framework adapters (Express,
 * Fastify, …) are thin wrappers that extract the raw request/response and the
 * parsed body and delegate here. No framework types appear in this file.
 */

interface SSESession {
  transport: SSEServerTransport;
  server: McpServer;
  res: ServerResponse;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Shared SSE session store. All adapters operate on the same map so sessions are
 * managed identically regardless of the framework that created them, and
 * {@link clearAllSSESessions} clears every session.
 */
const sseSessions = new Map<string, SSESession>();

/** Default path the client posts messages back to. */
export const DEFAULT_SSE_MESSAGES_PATH = '/mcp/messages';

/**
 * Evict SSE sessions idle for longer than `timeoutMs` and update the
 * active-session gauge. Invoked periodically by the cleanup interval; exported
 * so the eviction logic can be unit-tested directly without faking timers.
 */
export function cleanupExpiredSSESessions(timeoutMs: number): void {
  const now = Date.now();
  for (const [sessionId, session] of sseSessions.entries()) {
    if (now - session.lastAccessedAt > timeoutMs) {
      session.res.end();
      sseSessions.delete(sessionId);
      logger.debug({ sessionId }, 'SSE session expired and cleaned up');
    }
  }
  updateTransportSessionCount('sse', sseSessions.size);
}

const cleanupInterval = setInterval(
  () => cleanupExpiredSSESessions(envConfig.SESSION_TIMEOUT_MS),
  5 * 60 * 1000,
);
cleanupInterval.unref?.();

/**
 * Establish an SSE stream (`GET /mcp/sse`).
 *
 * Operates purely on raw Node objects so any framework can call it: Express
 * passes its `req`/`res` directly; Fastify passes `request.raw`/`reply.raw`
 * after calling `reply.hijack()`. Writes the SSE response headers and starts the
 * transport, or responds `500` if the handshake fails before headers are sent.
 */
export async function handleSSEConnection(
  rawReq: IncomingMessage,
  rawRes: ServerResponse,
  messagesPath: string,
  serverFactory: () => McpServer,
  ctx?: RequestLogContext,
): Promise<void> {
  try {
    const transport = new SSEServerTransport(messagesPath, rawRes);

    const sessionId = transport.sessionId;

    const mcpServer = serverFactory();
    await mcpServer.connect(transport);

    sseSessions.set(sessionId, {
      transport,
      server: mcpServer,
      res: rawRes,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
    updateTransportSessionCount('sse', sseSessions.size);

    rawRes.setHeader('Content-Type', 'text/event-stream');
    rawRes.setHeader('Cache-Control', 'no-cache');
    rawRes.setHeader('Connection', 'keep-alive');
    rawRes.setHeader('X-Accel-Buffering', 'no');

    transport.start();

    recordTransportRequest({ transport: 'sse', status: 'success' });

    logger.info(
      {
        sessionId,
        request_id: ctx?.requestId,
      },
      'SSE session established',
    );

    rawReq.on('close', () => {
      sseSessions.delete(sessionId);
      updateTransportSessionCount('sse', sseSessions.size);
      logger.debug({ sessionId }, 'SSE client disconnected');
    });
  } catch (error) {
    recordTransportRequest({ transport: 'sse', status: 'error' });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        error: errorMessage,
        request_id: ctx?.requestId,
      },
      'SSE session establishment failed',
    );

    if (!rawRes.headersSent) {
      rawRes.statusCode = 500;
      rawRes.end('Failed to establish SSE connection');
    }
  }
}

/**
 * Handle an SSE client→server message (`POST /mcp/messages?sessionId=<id>`).
 *
 * Writes validation errors (`400` missing session id, `404` unknown session)
 * and internal errors directly to `rawRes` so each adapter responds identically
 * regardless of framework.
 */
export async function handleSSEMessage(
  sessionId: string | undefined,
  rawReq: IncomingMessage,
  rawRes: ServerResponse,
  parsedBody: unknown,
  ctx?: RequestLogContext,
): Promise<void> {
  if (!sessionId) {
    writeJson(rawRes, 400, {
      error: 'Bad Request',
      message: 'sessionId query parameter is required',
    });
    return;
  }

  const session = sseSessions.get(sessionId);
  if (!session) {
    writeJson(rawRes, 404, {
      error: 'Session not found',
      message: 'No active SSE session with the provided ID',
    });
    return;
  }

  try {
    session.lastAccessedAt = Date.now();

    await session.transport.handlePostMessage(rawReq, rawRes, parsedBody);

    recordTransportRequest({ transport: 'sse', status: 'success' });
  } catch (error) {
    recordTransportRequest({ transport: 'sse', status: 'error' });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        error: errorMessage,
        sessionId,
        request_id: ctx?.requestId,
      },
      'SSE message handling failed',
    );

    if (!rawRes.headersSent) {
      const id = (parsedBody as { id?: unknown } | null | undefined)?.id ?? null;
      writeJson(rawRes, 500, {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Internal error',
        },
      });
    }
  }
}

/** Clear all active SSE sessions. Primarily for testing. */
export function clearAllSSESessions(): void {
  for (const session of sseSessions.values()) {
    session.res.end();
  }
  sseSessions.clear();
  updateTransportSessionCount('sse', 0);
  logger.debug('All SSE sessions cleared');
}

function writeJson(rawRes: ServerResponse, status: number, body: unknown): void {
  rawRes.statusCode = status;
  rawRes.setHeader('Content-Type', 'application/json');
  rawRes.end(JSON.stringify(body));
}
