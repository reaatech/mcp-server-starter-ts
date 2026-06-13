import { resetEnvConfigCache } from '@reaatech/mcp-server-core';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@reaatech/mcp-server-auth', () => ({
  authMiddleware: vi.fn(() => (req: Request, _res: Response, next: NextFunction) => {
    (req as Record<string, unknown>).requestContext = { requestId: 'test-req' };
    next();
  }),
}));

vi.mock('@reaatech/mcp-server-transport', () => ({
  mountStreamableHTTP: vi.fn(),
  mountSSE: vi.fn(),
}));

vi.mock('@reaatech/mcp-server-tools', () => ({
  discoverTools: vi.fn().mockResolvedValue([]),
}));

import supertest from 'supertest';
import { createApp } from './app.js';

describe('app', () => {
  describe('createApp', () => {
    it('creates an Express app', async () => {
      const app = await createApp();
      expect(app).toBeDefined();
    });

    it('GET /health returns health status', async () => {
      const app = await createApp();
      const res = await supertest(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'healthy',
        version: '1.0.0',
        environment: 'test',
      });
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body.checks).toMatchObject({
        readiness: 'ready',
        liveness: 'alive',
      });
    });

    it('GET /ready returns ready status', async () => {
      const app = await createApp();
      const res = await supertest(app).get('/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ready' });
    });

    it('GET /live returns alive status', async () => {
      const app = await createApp();
      const res = await supertest(app).get('/live');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'alive' });
    });

    it('returns 404 for unknown routes', async () => {
      const app = await createApp();
      const res = await supertest(app).get('/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: 'Not Found',
        message: 'Endpoint not found',
      });
    });

    it('handles malformed JSON body with 500 error', async () => {
      const app = await createApp();
      const res = await supertest(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('not valid json');

      expect(res.status).toBe(500);
    });

    it('sets x-request-id header on requests', async () => {
      const app = await createApp();
      const res = await supertest(app).get('/health');

      expect(res.status).toBe(200);
    });

    it('handles OPTIONS preflight requests', async () => {
      const app = await createApp();
      const res = await supertest(app).options('/health');

      expect(res.status).toBe(204);
    });

    it('hides error message in production mode', async () => {
      const origNodeEnv = process.env.NODE_ENV;
      const origApiKey = process.env.API_KEY;
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'test-prod-key';
      resetEnvConfigCache();

      const app = await createApp();
      const res = await supertest(app)
        .post('/health')
        .set('Content-Type', 'application/json')
        .send('invalid json');

      expect(res.status).toBe(500);
      expect(res.body.message).toBe('An unexpected error occurred');

      process.env.NODE_ENV = origNodeEnv;
      if (origApiKey) {
        process.env.API_KEY = origApiKey;
      } else {
        delete process.env.API_KEY;
      }
      resetEnvConfigCache();
    });
  });
});
