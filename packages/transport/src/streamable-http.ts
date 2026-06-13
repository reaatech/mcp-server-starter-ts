import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestContext } from '@reaatech/mcp-server-core';
import { logger } from '@reaatech/mcp-server-observability';
import type { Express as ExpressApp, Request, Response } from 'express';
import { handleStreamableHTTPDelete, handleStreamableHTTPRequest } from './core.js';

export { clearAllSessions } from './core.js';

declare global {
  namespace Express {
    interface Request {
      requestContext?: RequestContext;
    }
  }
}

/**
 * Mount the MCP Streamable HTTP transport on an Express application.
 *
 * Registers `POST /mcp` (client→server messages, may return SSE) and
 * `DELETE /mcp` (session termination). This is a thin adapter over the
 * framework-agnostic core in `./core.js`.
 */
export function mountStreamableHTTP(app: ExpressApp, serverFactory: () => McpServer): void {
  app.post('/mcp', async (req: Request, res: Response) => {
    const context = req.requestContext as RequestContext | undefined;
    await handleStreamableHTTPRequest(req, res, req.body, serverFactory, {
      requestId: context?.requestId,
    });
  });

  app.delete('/mcp', (req: Request, res: Response) => {
    const context = req.requestContext as RequestContext | undefined;
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const result = handleStreamableHTTPDelete(sessionId, { requestId: context?.requestId });
    res.status(result.status).json(result.body);
  });

  logger.info('StreamableHTTP transport mounted on POST /mcp, DELETE /mcp');
}
