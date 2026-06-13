import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestContext } from '@reaatech/mcp-server-core';
import { logger } from '@reaatech/mcp-server-observability';
import type { Express as ExpressApp, Request, Response } from 'express';
import { DEFAULT_SSE_MESSAGES_PATH, handleSSEConnection, handleSSEMessage } from './sse-core.js';

export {
  cleanupExpiredSSESessions,
  clearAllSSESessions,
} from './sse-core.js';

declare global {
  namespace Express {
    interface Request {
      requestContext?: RequestContext;
    }
  }
}

/**
 * Mount the legacy MCP SSE transport on an Express application.
 *
 * Registers `GET /mcp/sse` (establish the event stream) and
 * `POST /mcp/messages` (client→server messages). This is a thin adapter over
 * the framework-agnostic core in `./sse-core.js`; sessions are shared with the
 * Fastify adapter.
 */
export function mountSSE(app: ExpressApp, serverFactory: () => McpServer): void {
  app.get('/mcp/sse', async (req: Request, res: Response) => {
    const context = req.requestContext as RequestContext | undefined;
    await handleSSEConnection(req, res, DEFAULT_SSE_MESSAGES_PATH, serverFactory, {
      requestId: context?.requestId,
    });
  });

  app.post('/mcp/messages', async (req: Request, res: Response) => {
    const context = req.requestContext as RequestContext | undefined;
    const sessionId = req.query.sessionId as string | undefined;
    await handleSSEMessage(sessionId, req, res, req.body, {
      requestId: context?.requestId,
    });
  });

  logger.info('SSE transport mounted on GET /mcp/sse, POST /mcp/messages');
}
