/**
 * SSE (Server-Sent Events) transport for MCP.
 *
 * Legacy transport for backwards compatibility.
 * Uses SSE for server-to-client events and POST for client-to-server.
 *
 * Endpoints:
 *   GET /mcp/sse - Establish SSE stream
 *   POST /mcp/messages?sessionId=<id> - Send MCP request
 */

import type { Express, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { envConfig } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { recordTransportRequest } from '../observability/metrics.js';
import type { RequestContext } from '../types/domain.js';
import { updateTransportSessionCount } from './session-metrics.js';

/**
 * In-memory SSE session store
 */
const sseSessions = new Map<
  string,
  {
    transport: SSEServerTransport;
    server: McpServer;
    res: Response;
    createdAt: number;
    lastAccessedAt: number;
  }
>();

/**
 * Clean up expired SSE sessions
 */
function cleanupSSESessions(timeoutMs: number): void {
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
  () => cleanupSSESessions(envConfig.SESSION_TIMEOUT_MS),
  5 * 60 * 1000
);
cleanupInterval.unref?.();

/**
 * Mount SSE transport on Express app
 */
export function mountSSE(app: Express, serverFactory: () => McpServer): void {
  // GET /mcp/sse - Establish SSE stream
  app.get('/mcp/sse', async (req: Request, res: Response) => {
    const context = req.requestContext as RequestContext | undefined;

    try {
      // Create SSE transport
      const transport = new SSEServerTransport('/mcp/messages', res);

      // Store the session
      const sessionId = transport.sessionId;

      // Create and connect a new server for this session
      const mcpServer = serverFactory();
      await mcpServer.connect(transport);

      sseSessions.set(sessionId, {
        transport,
        server: mcpServer,
        res,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      });
      updateTransportSessionCount('sse', sseSessions.size);

      // Set headers for SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Send initial endpoint event
      transport.start();

      recordTransportRequest({ transport: 'sse', status: 'success' });

      logger.info(
        {
          sessionId,
          request_id: context?.requestId,
        },
        'SSE session established'
      );

      // Handle client disconnect
      req.on('close', () => {
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
          request_id: context?.requestId,
        },
        'SSE session establishment failed'
      );

      if (!res.headersSent) {
        res.status(500).send('Failed to establish SSE connection');
      }
    }
  });

  // POST /mcp/messages - Handle MCP messages
  app.post('/mcp/messages', async (req: Request, res: Response) => {
    const context = req.requestContext as RequestContext | undefined;
    const sessionId = req.query.sessionId as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId query parameter is required',
      });
      return;
    }

    const session = sseSessions.get(sessionId);
    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        message: 'No active SSE session with the provided ID',
      });
      return;
    }

    try {
      // Update last accessed time
      session.lastAccessedAt = Date.now();

      // Forward request to transport
      await session.transport.handlePostMessage(req, res, req.body);

      recordTransportRequest({ transport: 'sse', status: 'success' });
    } catch (error) {
      recordTransportRequest({ transport: 'sse', status: 'error' });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        {
          error: errorMessage,
          sessionId,
          request_id: context?.requestId,
        },
        'SSE message handling failed'
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

  logger.info('SSE transport mounted on GET /mcp/sse, POST /mcp/messages');
}

/**
 * Clear all SSE sessions (for testing)
 */
export function clearAllSSESessions(): void {
  for (const session of sseSessions.values()) {
    session.res.end();
  }
  sseSessions.clear();
  updateTransportSessionCount('sse', 0);
  logger.debug('All SSE sessions cleared');
}
