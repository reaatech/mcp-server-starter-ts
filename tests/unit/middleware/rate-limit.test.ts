/**
 * Unit tests for rate limit middleware
 */

import type { Request, Response } from 'express';
import { clearRateLimitStore } from '../../../src/middleware/rate-limit.js';

describe('rate limit middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.RATE_LIMIT_RPM = '10'; // 10 requests per minute for testing

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
    clearRateLimitStore();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should allow requests under the limit', async () => {
    const { rateLimitMiddleware: freshMiddleware } =
      await import('../../../src/middleware/rate-limit.js');
    const middleware = freshMiddleware();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('should set rate limit headers', async () => {
    const { rateLimitMiddleware: freshMiddleware } =
      await import('../../../src/middleware/rate-limit.js');
    const middleware = freshMiddleware();

    middleware(req as Request, res as Response, next);

    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.stringMatching(/^\d+$/));
  });

  it('should reject requests over the limit', async () => {
    const { rateLimitMiddleware: freshMiddleware } =
      await import('../../../src/middleware/rate-limit.js');
    const middleware = freshMiddleware();

    // Make 10 requests to exhaust the limit
    for (let i = 0; i < 10; i++) {
      const nextMock = jest.fn();
      middleware(req as Request, res as Response, nextMock);
    }

    // 11th request should be rejected
    middleware(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.set).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Too Many Requests' }));
  });

  it('should track clients separately by API key', async () => {
    const { rateLimitMiddleware: freshMiddleware } =
      await import('../../../src/middleware/rate-limit.js');
    const middleware = freshMiddleware();

    // Client 1 uses all 10 requests
    req.headers = { 'x-api-key': 'client1' };
    for (let i = 0; i < 10; i++) {
      const nextMock = jest.fn();
      middleware(req as Request, res as Response, nextMock);
    }

    // Client 2 should still be allowed
    req.headers = { 'x-api-key': 'client2' };
    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should track clients separately by IP', async () => {
    const { rateLimitMiddleware: freshMiddleware } =
      await import('../../../src/middleware/rate-limit.js');
    const middleware = freshMiddleware();

    // Client 1 uses all 10 requests - create a new req with specific IP
    const req1 = {
      headers: {},
      ip: '192.168.1.1',
    } as unknown as Request;
    for (let i = 0; i < 10; i++) {
      const nextMock = jest.fn();
      middleware(req1, res as Response, nextMock);
    }

    // Client 2 should still be allowed - use a fresh req object with different IP
    const req2 = {
      headers: {},
      ip: '192.168.1.2',
    } as unknown as Request;
    const next2 = jest.fn();
    middleware(req2, res as Response, next2);

    expect(next2).toHaveBeenCalled();
  });
});
