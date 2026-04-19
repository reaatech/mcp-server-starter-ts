/**
 * MCP Server Entry Point
 *
 * Initializes the Express application with all middleware,
 * transports, and tools. Starts the HTTP server.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { envConfig, isProduction } from './config/env.js';
import { logger } from './observability/logger.js';
import { createMcpServer } from './server.js';
import { APP_VERSION } from './version.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { discoverTools } from './tools/index.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { idempotencyMiddleware } from './middleware/idempotency.js';
import { sanitizationMiddleware } from './middleware/sanitization.js';
import { mountStreamableHTTP } from './transports/streamable-http.js';
import { mountSSE } from './transports/sse.js';
import { initObservability } from './observability/tracing.js';

/**
 * Application version from centralized version module
 */

/**
 * Create and configure the Express application
 */
export async function createApp(): Promise<express.Express> {
  // Initialize observability
  await initObservability();

  // Discover and register tools
  const tools = await discoverTools();

  // Create a factory that produces new MCP server instances
  const serverFactory = (): McpServer => createMcpServer([...tools]);

  // Create Express app
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
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
    })
  );

  // Parse JSON bodies
  app.use(express.json({ limit: '10mb' }));

  // Request ID middleware
  app.use((req, _res, next) => {
    req.headers['x-request-id'] ??= crypto.randomUUID();
    next();
  });

  // Health check endpoint
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

  // Readiness check
  app.get('/ready', (_req, res) => {
    res.json({ status: 'ready' });
  });

  // Liveness check
  app.get('/live', (_req, res) => {
    res.json({ status: 'alive' });
  });

  // Middleware pipeline (in order)
  app.use(authMiddleware());
  app.use(rateLimitMiddleware());
  app.use(idempotencyMiddleware());
  app.use(sanitizationMiddleware());

  // Mount MCP transports
  mountStreamableHTTP(app, serverFactory);
  mountSSE(app, serverFactory);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'Endpoint not found',
    });
  });

  // Error handler
  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error({ error: err.message, stack: err.stack }, 'Unhandled error');
      res.status(500).json({
        error: 'Internal Server Error',
        message: isProduction() ? 'An unexpected error occurred' : err.message,
      });
    }
  );

  return app;
}

/**
 * Start the server
 */
export async function startServer(): Promise<void> {
  const app = await createApp();

  const server = app.listen(envConfig.PORT, () => {
    logger.info(
      {
        port: envConfig.PORT,
        environment: envConfig.NODE_ENV,
        version: APP_VERSION,
      },
      `MCP server started on port ${envConfig.PORT}`
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down...');
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Start server if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((error) => {
    logger.error({ error: error.message }, 'Failed to start server');
    process.exit(1);
  });
}
