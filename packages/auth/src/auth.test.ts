import { resetEnvConfigCache } from '@reaatech/mcp-server-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authMiddleware } from './index.js';

function mockReqRes() {
  const status = vi.fn();
  const json = vi.fn();
  const set = vi.fn();
  const res = { status, json, set };
  status.mockReturnValue(res);
  json.mockReturnValue(res);
  set.mockReturnValue(res);
  const req = {
    headers: {} as Record<string, string | undefined>,
    ip: '127.0.0.1',
  } as {
    headers: Record<string, string | undefined>;
    ip?: string;
    requestContext?: { requestId?: string; ipAddress?: string; apiKey?: string };
  };
  const next = vi.fn();
  return { req, res, next };
}

describe('authMiddleware', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.API_KEY;
    delete process.env.AUTH_BYPASS_IN_DEV;
    delete process.env.AUTH_MODE;
    delete process.env.NODE_ENV;
    resetEnvConfigCache();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetEnvConfigCache();
  });

  it('returns a middleware function', () => {
    const middleware = authMiddleware();
    expect(typeof middleware).toBe('function');
  });

  describe('auth bypass', () => {
    it('bypasses auth in dev mode with bypass enabled and no API_KEY', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'true';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      authMiddleware()(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.requestContext).toBeDefined();
      expect(req.requestContext.requestId).toBeDefined();
      expect(req.requestContext.ipAddress).toBe('127.0.0.1');
    });

    it('bypasses auth in test mode with bypass enabled and no API_KEY', () => {
      process.env.NODE_ENV = 'test';
      process.env.AUTH_BYPASS_IN_DEV = 'true';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      authMiddleware()(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.requestContext).toBeDefined();
    });

    it('does not bypass if AUTH_BYPASS_IN_DEV is false', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('does not bypass if API_KEY is set even with bypass enabled', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'true';
      process.env.API_KEY = 'secret-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-api-key'] = 'secret-key';
      authMiddleware()(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('missing API_KEY', () => {
    it('returns 500 when API_KEY is not set and not bypassing', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Authentication not configured',
        message: 'API_KEY environment variable is required in production',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('api-key auth mode', () => {
    it('authenticates with valid x-api-key', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-key';
      process.env.AUTH_MODE = 'api-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-api-key'] = 'valid-key';
      authMiddleware()(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.requestContext).toBeDefined();
      expect(req.requestContext.apiKey).toBe('[REDACTED]');
    });

    it('rejects invalid x-api-key with 401', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-key';
      process.env.AUTH_MODE = 'api-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-api-key'] = 'wrong-key';
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.set).toHaveBeenCalledWith('WWW-Authenticate', 'x-api-key');
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Valid authentication credentials required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects missing x-api-key header with 401', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-key';
      process.env.AUTH_MODE = 'api-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects empty x-api-key header with 401', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-key';
      process.env.AUTH_MODE = 'api-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-api-key'] = '';
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects x-api-key shorter than API_KEY', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'longer-key-value';
      process.env.AUTH_MODE = 'api-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-api-key'] = 'short';
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects x-api-key longer than API_KEY', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'short';
      process.env.AUTH_MODE = 'api-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-api-key'] = 'much-longer-key-value';
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 in production mode with valid key set', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'prod-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('bearer auth mode', () => {
    it('authenticates with valid bearer token', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-token';
      process.env.AUTH_MODE = 'bearer';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers.authorization = 'Bearer valid-token';
      authMiddleware()(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.requestContext).toBeDefined();
      expect(req.requestContext.apiKey).toBe('[REDACTED]');
    });

    it('rejects invalid bearer token with 401', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-token';
      process.env.AUTH_MODE = 'bearer';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers.authorization = 'Bearer wrong-token';
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.set).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer');
      expect(res.json).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Valid authentication credentials required',
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects missing Authorization header with 401', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-token';
      process.env.AUTH_MODE = 'bearer';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects malformed Authorization header (not Bearer) with 401', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-token';
      process.env.AUTH_MODE = 'bearer';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers.authorization = 'Basic dXNlcjpwYXNz';
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('rejects Authorization header with Bearer but no token', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'valid-token';
      process.env.AUTH_MODE = 'bearer';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers.authorization = 'Bearer ';
      authMiddleware()(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('default auth mode', () => {
    it('uses api-key mode by default when AUTH_MODE is not set', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'false';
      process.env.API_KEY = 'default-key';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-api-key'] = 'default-key';
      authMiddleware()(req, res, next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('request context', () => {
    it('uses x-request-id header when provided', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'true';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      req.headers['x-request-id'] = 'custom-id-123';
      authMiddleware()(req, res, next);
      expect(req.requestContext.requestId).toBe('custom-id-123');
    });

    it('generates requestId when x-request-id header is missing', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'true';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      delete req.headers['x-request-id'];
      authMiddleware()(req, res, next);
      expect(req.requestContext.requestId).toBeDefined();
      expect(typeof req.requestContext.requestId).toBe('string');
    });

    it('does not include ipAddress when req.ip is undefined', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_BYPASS_IN_DEV = 'true';
      resetEnvConfigCache();

      const { req, res, next } = mockReqRes();
      delete req.ip;
      authMiddleware()(req, res, next);
      expect(req.requestContext.ipAddress).toBeUndefined();
    });
  });
});
