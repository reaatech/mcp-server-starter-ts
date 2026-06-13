import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', async (importOriginal) => {
  const mod = await importOriginal<typeof import('node:crypto')>();
  return {
    ...mod,
    timingSafeEqual: vi.fn(() => {
      throw new Error('timing safe equal failure');
    }),
  };
});

import { resetEnvConfigCache } from '@reaatech/mcp-server-core';
import { authMiddleware } from './index.js';

function mockReqRes() {
  const status = vi.fn();
  const json = vi.fn();
  const set = vi.fn();
  const res = { status, json, set };
  status.mockReturnValue(res);
  json.mockReturnValue(res);
  set.mockReturnValue(res);
  const req = { headers: {} as Record<string, string | undefined>, ip: '127.0.0.1' };
  const next = vi.fn();
  return { req, res, next };
}

describe('constantTimeCompare error handling', () => {
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

  it('handles timingSafeEqual throw by returning 401 in api-key mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_BYPASS_IN_DEV = 'false';
    process.env.API_KEY = 'some-api-key';
    process.env.AUTH_MODE = 'api-key';
    resetEnvConfigCache();

    const { req, res, next } = mockReqRes();
    req.headers['x-api-key'] = 'some-api-key';
    authMiddleware()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('handles timingSafeEqual throw by returning 401 in bearer mode', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_BYPASS_IN_DEV = 'false';
    process.env.API_KEY = 'some-bearer-token';
    process.env.AUTH_MODE = 'bearer';
    resetEnvConfigCache();

    const { req, res, next } = mockReqRes();
    req.headers.authorization = 'Bearer some-bearer-token';
    authMiddleware()(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
