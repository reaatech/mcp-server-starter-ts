import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { authMiddleware } from '@reaatech/mcp-server-auth';
import { APP_VERSION, envConfig, isProduction } from '@reaatech/mcp-server-core';
import { initObservability, logger } from '@reaatech/mcp-server-observability';
import { discoverTools } from '@reaatech/mcp-server-tools';
import { mountSSE, mountStreamableHTTP } from '@reaatech/mcp-server-transport';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { idempotencyMiddleware } from './idempotency.js';
import { rateLimitMiddleware } from './rate-limit.js';
import { sanitizationMiddleware } from './sanitization.js';
import { createMcpServer } from './server.js';

export async function createApp(): Promise<express.Express> {
  await initObservability();

  const tools = await discoverTools();

  const serverFactory = (): McpServer => createMcpServer([...tools]);

  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin:
        envConfig.CORS_ORIGIN === '*' ? '*' : envConfig.CORS_ORIGIN.split(',').map((s) => s.trim()),
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-api-key',
        'x-request-id',
        'Idempotency-Key',
        'Mcp-Session-Id',
      ],
    }),
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

  mountStreamableHTTP(app, serverFactory);
  mountSSE(app, serverFactory);

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
        message: isProduction() ? 'An unexpected error occurred' : err.message,
      });
    },
  );

  return app;
}

export async function startServer(): Promise<void> {
  const app = await createApp();

  const server = app.listen(envConfig.PORT, () => {
    logger.info(
      {
        port: envConfig.PORT,
        environment: envConfig.NODE_ENV,
        version: APP_VERSION,
      },
      `MCP server started on port ${envConfig.PORT}`,
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error: Error) => {
    logger.error({ error: error.message }, 'Failed to start server');
    process.exit(1);
  });
}
