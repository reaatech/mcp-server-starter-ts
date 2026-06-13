import type { IncomingMessage, ServerResponse } from 'node:http';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { envConfig } from '@reaatech/mcp-server-core';
import { logger, recordTransportRequest } from '@reaatech/mcp-server-observability';
import { updateTransportSessionCount } from './session-metrics.js';

/**
 * Framework-agnostic core for the MCP Streamable HTTP transport.
 *
 * This module owns the session lifecycle (creation, reuse, cleanup) and drives
 * the SDK's {@link StreamableHTTPServerTransport}, which already operates on raw
 * Node `http.IncomingMessage` / `http.ServerResponse`. Framework adapters
 * (Express, Fastify, …) are thin wrappers that extract the raw request/response
 * and parsed body and delegate here. No framework types appear in this file.
 */

export interface StreamableSession {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  createdAt: number;
  lastAccessedAt: number;
}

/** Map of `mcp-session-id` -> active session. */
export type SessionStore = Map<string, StreamableSession>;

/**
 * Shared session store. All adapters operate on the same map so sessions are
 * managed identically regardless of the framework that created them, and
 * {@link clearAllSessions} clears every session.
 */
const sessions: SessionStore = new Map();

/** Optional request context forwarded by adapters for structured logging. */
export interface RequestLogContext {
  requestId?: string;
}

/** Result of a session-termination request, written by the adapter. */
export interface DeleteResult {
  status: number;
  body: unknown;
}

/**
 * Evict sessions idle for longer than `timeoutMs` and update the active-session
 * gauge. Invoked periodically by the cleanup interval; exported so the eviction
 * logic can be unit-tested directly without faking timers.
 */
export function cleanupExpiredSessions(timeoutMs: number): void {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastAccessedAt > timeoutMs) {
      session.transport.close();
      sessions.delete(sessionId);
      logger.debug({ sessionId }, 'Session expired and cleaned up');
    }
  }
  updateTransportSessionCount('streamable-http', sessions.size);
}

const cleanupInterval = setInterval(
  () => cleanupExpiredSessions(envConfig.SESSION_TIMEOUT_MS),
  5 * 60 * 1000,
);
cleanupInterval.unref?.();

/**
 * Handle a Streamable HTTP client→server request (`POST /mcp`).
 *
 * Operates purely on raw Node objects so any framework can call it: Express
 * passes its `req`/`res` (which extend the Node types) directly; Fastify passes
 * `request.raw`/`reply.raw` after calling `reply.hijack()`. The parsed JSON body
 * is forwarded to the SDK transport so it does not re-parse the stream.
 */
export async function handleStreamableHTTPRequest(
  rawReq: IncomingMessage,
  rawRes: ServerResponse,
  parsedBody: unknown,
  serverFactory: () => McpServer,
  ctx?: RequestLogContext,
): Promise<void> {
  const sessionId = rawReq.headers['mcp-session-id'] as string | undefined;

  try {
    let transport: StreamableHTTPServerTransport;
    let mcpServer: McpServer;

    const existing = sessionId ? sessions.get(sessionId) : undefined;
    if (existing) {
      existing.lastAccessedAt = Date.now();
      transport = existing.transport;
      mcpServer = existing.server;
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (newSessionId: string) => {
          logger.debug({ sessionId: newSessionId }, 'Session initialized');
        },
      });
      mcpServer = serverFactory();
      await mcpServer.connect(transport);
    }

    await transport.handleRequest(rawReq, rawRes, parsedBody);

    recordTransportRequest({ transport: 'streamable-http', status: 'success' });

    const activeSessionId = transport.sessionId;
    if (activeSessionId) {
      sessions.set(activeSessionId, {
        transport,
        server: mcpServer,
        createdAt: sessions.get(activeSessionId)?.createdAt ?? Date.now(),
        lastAccessedAt: Date.now(),
      });
      updateTransportSessionCount('streamable-http', sessions.size);
    }
  } catch (error) {
    recordTransportRequest({ transport: 'streamable-http', status: 'error' });
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      {
        error: errorMessage,
        sessionId,
        request_id: ctx?.requestId,
      },
      'StreamableHTTP request failed',
    );

    if (!rawRes.headersSent) {
      const id = (parsedBody as { id?: unknown } | null | undefined)?.id ?? null;
      rawRes.statusCode = 500;
      rawRes.setHeader('Content-Type', 'application/json');
      rawRes.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: 'Internal error',
          },
        }),
      );
    }
  }
}

/**
 * Handle a session-termination request (`DELETE /mcp`).
 *
 * Returns the status/body the adapter should write, keeping the function free of
 * framework types so each adapter can respond idiomatically.
 */
export function handleStreamableHTTPDelete(
  sessionId: string | undefined,
  ctx?: RequestLogContext,
): DeleteResult {
  const session = sessionId ? sessions.get(sessionId) : undefined;
  if (!session) {
    return {
      status: 404,
      body: {
        error: 'Session not found',
        message: 'No active session with the provided ID',
      },
    };
  }

  session.transport.close();
  sessions.delete(sessionId as string);
  updateTransportSessionCount('streamable-http', sessions.size);

  logger.info(
    {
      sessionId,
      request_id: ctx?.requestId,
    },
    'Session terminated',
  );

  return { status: 200, body: { success: true } };
}

/** Clear all active Streamable HTTP sessions. Primarily for testing. */
export function clearAllSessions(): void {
  for (const session of sessions.values()) {
    session.transport.close();
  }
  sessions.clear();
  updateTransportSessionCount('streamable-http', 0);
  logger.debug('All sessions cleared');
}
