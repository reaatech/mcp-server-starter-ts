/**
 * Unit tests for auth middleware
 */

import type { Request, Response } from 'express';

describe('auth middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';

    req = {
      headers: {},
      ip: '127.0.0.1',
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('development mode', () => {
    it('should bypass auth when no API_KEY is set in dev mode', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.API_KEY;

      const { authMiddleware: freshAuthMiddleware } =
        await import('../../../src/middleware/auth.js');
      const middleware = freshAuthMiddleware();

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('production mode', () => {
    it('should reject requests without API key', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'test-secret-key';
      process.env.AUTH_MODE = 'api-key';

      const { authMiddleware: freshAuthMiddleware } =
        await import('../../../src/middleware/auth.js');
      const middleware = freshAuthMiddleware();

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Unauthorized' }));
    });

    it('should accept valid API key in x-api-key header', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'test-secret-key';
      process.env.AUTH_MODE = 'api-key';

      req.headers = { 'x-api-key': 'test-secret-key' };

      const { authMiddleware: freshAuthMiddleware } =
        await import('../../../src/middleware/auth.js');
      const middleware = freshAuthMiddleware();

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject invalid API key', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'test-secret-key';
      process.env.AUTH_MODE = 'api-key';

      req.headers = { 'x-api-key': 'wrong-key' };

      const { authMiddleware: freshAuthMiddleware } =
        await import('../../../src/middleware/auth.js');
      const middleware = freshAuthMiddleware();

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should accept valid Bearer token', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'test-bearer-token';
      process.env.AUTH_MODE = 'bearer';

      req.headers = { authorization: 'Bearer test-bearer-token' };

      const { authMiddleware: freshAuthMiddleware } =
        await import('../../../src/middleware/auth.js');
      const middleware = freshAuthMiddleware();

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });

    it('should reject malformed Bearer token', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'test-bearer-token';
      process.env.AUTH_MODE = 'bearer';

      req.headers = { authorization: 'InvalidFormat test-bearer-token' };

      const { authMiddleware: freshAuthMiddleware } =
        await import('../../../src/middleware/auth.js');
      const middleware = freshAuthMiddleware();

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
