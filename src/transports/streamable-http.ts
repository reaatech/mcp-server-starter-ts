/**
 * StreamableHTTP transport for MCP.
 *
 * Primary transport using HTTP request/response pattern.
 * Supports session management via Mcp-Session-Id header.
 *
 * Endpoints:
 *   POST /mcp - Send MCP request, receive response
 *   DELETE /mcp - End session
 */

import type { Express, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHTTP.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { envConfig } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { recordTransportRequest } from '../observability/metrics.js';
import type { RequestContext } from '../types/domain.js';
import { updateTransportSessionCount } from './session-metrics.js';

/**
 * In-memory session store
 */
const sessions = new Map<
  string,
  {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
    createdAt: number;
    lastAccessedAt: number;
  }
>();

function cleanupSessions(timeoutMs: number): void {
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
  () => cleanupSessions(envConfig.SESSION_TIMEOUT_MS),
  5 * 60 * 1000
);
cleanupInterval.unref?.();

/**
 * Mount StreamableHTTP transport on Express app
 */
export function mountStreamableHTTP(app: Express, serverFactory: () => McpServer): void {
  // POST /mcp - Handle MCP requests
  app.post('/mcp', async (req: Request, res: Response) => {
    const context = req.requestContext as RequestContext | undefined;
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;
      let mcpServer: McpServer;

      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        session.lastAccessedAt = Date.now();
        transport = session.transport;
        mcpServer = session.server;
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

      await transport.handleRequest(req, res, req.body);

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
          request_id: context?.requestId,
        },
        'StreamableHTTP request failed'
      );

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id ?? null,
          error: {
            code: -32603,
            message: 'Internal error',
          },
        });
      }
    }
  });

  // DELETE /mcp - End session
  app.delete('/mcp', (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const context = req.requestContext as RequestContext | undefined;

    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({
        error: 'Session not found',
        message: 'No active session with the provided ID',
      });
      return;
    }

    const session = sessions.get(sessionId)!;
    session.transport.close();
    sessions.delete(sessionId);
    updateTransportSessionCount('streamable-http', sessions.size);

    logger.info(
      {
        sessionId,
        request_id: context?.requestId,
      },
      'Session terminated'
    );

    res.status(200).json({ success: true });
  });

  logger.info('StreamableHTTP transport mounted on POST /mcp, DELETE /mcp');
}

/**
 * Clear all sessions (for testing)
 */
export function clearAllSessions(): void {
  for (const session of sessions.values()) {
    session.transport.close();
  }
  sessions.clear();
  updateTransportSessionCount('streamable-http', 0);
  logger.debug('All sessions cleared');
}
