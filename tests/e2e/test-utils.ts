/**
 * Test utilities for E2E tests.
 *
 * Creates an app with manually registered tools to avoid
 * dynamic import issues in Jest's ESM environment.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { envConfig } from '../../src/config/env.js';
import { logger } from '../../src/observability/logger.js';
import { createMcpServer } from '../../src/server.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTool, clearTools, getTools } from '../../src/tools/index.js';
import { authMiddleware } from '../../src/middleware/auth.js';
import { rateLimitMiddleware } from '../../src/middleware/rate-limit.js';
import { idempotencyMiddleware } from '../../src/middleware/idempotency.js';
import { sanitizationMiddleware } from '../../src/middleware/sanitization.js';
import { mountStreamableHTTP } from '../../src/transports/streamable-http.js';
import { mountSSE } from '../../src/transports/sse.js';
import type { ToolDefinition } from '../../src/tools/index.js';
import { APP_VERSION } from '../../src/version.js';

export async function createTestApp(
  tools?: ToolDefinition[],
  transport: 'streamable-http' | 'sse' | 'both' = 'both'
): Promise<express.Express> {
  if (tools && tools.length > 0) {
    clearTools();
    for (const tool of tools) {
      registerTool(tool);
    }
  }

  const discoveredTools = getTools();
  const serverFactory = (): McpServer => createMcpServer([...discoveredTools]);

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(
    cors({
      origin: false,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-api-key',
        'x-request-id',
        'Idempotency-Key',
        'Mcp-Session-Id',
      ],
    })
  );

  app.use(express.json({ limit: '10mb' }));

  app.use((req, _res, next) => {
    req.headers['x-request-id'] ??= crypto.randomUUID();
    next();
  });

  app.get('/health', (_req, res) => {
    const health = {
      status: 'healthy',
      version: APP_VERSION,
      environment: envConfig.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      checks: {
        readiness: 'ready',
        liveness: 'alive',
        memory: process.memoryUsage(),
        uptimeSeconds: process.uptime(),
      },
    };
    res.json(health);
  });

  app.get('/ready', (_req, res) => {
    res.json({ status: 'ready' });
  });

  app.get('/live', (_req, res) => {
    res.json({ status: 'alive' });
  });

  app.use(authMiddleware());
  app.use(rateLimitMiddleware());
  app.use(idempotencyMiddleware());
  app.use(sanitizationMiddleware());

  if (transport === 'streamable-http' || transport === 'both') {
    mountStreamableHTTP(app, serverFactory);
  }
  if (transport === 'sse' || transport === 'both') {
    mountSSE(app, serverFactory);
  }

  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'Endpoint not found',
    });
  });

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  );

  return app;
}
