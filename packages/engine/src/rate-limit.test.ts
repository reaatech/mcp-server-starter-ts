import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRateLimitStore, rateLimitMiddleware } from './rate-limit.js';

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    method: 'GET',
    url: '/test',
    originalUrl: '/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    body: undefined,
    requestContext: undefined,
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  res.set = vi.fn().mockReturnValue(res);
  res.statusCode = 200;
  return res;
}

function mockNext(): NextFunction {
  return vi.fn();
}

describe('rate-limit', () => {
  beforeEach(() => {
    clearRateLimitStore();
  });

  describe('rateLimitMiddleware', () => {
    it('allows requests with tokens remaining', () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rate limits when tokens are exhausted', () => {
      const req = mockReq();
      const res = mockRes();

      const middleware = rateLimitMiddleware();

      for (let i = 0; i < 60; i++) {
        middleware(i === 0 ? req : mockReq(), i === 0 ? res : mockRes(), mockNext());
      }

      const req61 = mockReq();
      const res61 = mockRes();
      res61.json = vi.fn().mockReturnValue(res61);
      res61.set = vi.fn().mockReturnValue(res61);
      res61.status = vi.fn().mockReturnValue(res61);
      const next61 = mockNext();

      middleware(req61, res61, next61);

      expect(res61.status).toHaveBeenCalledWith(429);
      expect(res61.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Too Many Requests' }),
      );
      expect(res61.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
      expect(next61).not.toHaveBeenCalled();
    });

    it('sets correct rate-limit headers', () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
    });

    it('uses x-api-key header for client identification', () => {
      const req = mockReq({ headers: { 'x-api-key': 'my-api-key' } });
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('uses authorization header for client identification when no api key', () => {
      const req = mockReq({ headers: { authorization: 'Bearer token123' } });
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('uses ip for client identification when no auth headers', () => {
      const req = mockReq({ headers: {}, ip: '10.0.0.1' });
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('uses socket remoteAddress when ip is unavailable', () => {
      const req = mockReq({ headers: {}, ip: undefined, socket: { remoteAddress: '10.0.0.2' } });
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('uses unknown when both ip and remoteAddress are unavailable', () => {
      const req = mockReq({ headers: {}, ip: undefined, socket: { remoteAddress: undefined } });
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      expect(next).toHaveBeenCalledOnce();
    });

    it('resets tokens after refill period', async () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      const middleware = rateLimitMiddleware();

      middleware(req, res, next);
      expect(res.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');

      vi.useFakeTimers();
      const reqFuture = mockReq();
      const resFuture = mockRes();
      resFuture.set = vi.fn().mockReturnValue(resFuture);
      const nextFuture = mockNext();

      vi.advanceTimersByTime(60000);
      middleware(reqFuture, resFuture, nextFuture);

      expect(resFuture.set).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));

      vi.useRealTimers();
    });

    it('tracks different clients independently', () => {
      const middleware = rateLimitMiddleware();

      const req1 = mockReq({ headers: { 'x-api-key': 'client-a' } });
      const res1 = mockRes();
      const next1 = mockNext();
      middleware(req1, res1, next1);

      const req2 = mockReq({ headers: { 'x-api-key': 'client-b' } });
      const res2 = mockRes();
      const next2 = mockNext();
      middleware(req2, res2, next2);

      expect(next1).toHaveBeenCalled();
      expect(next2).toHaveBeenCalled();
    });
  });

  describe('clearRateLimitStore', () => {
    it('clears the store', () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();

      rateLimitMiddleware()(req, res, next);

      clearRateLimitStore();

      const req2 = mockReq();
      const res2 = mockRes();
      res2.set = vi.fn().mockReturnValue(res2);
      const next2 = mockNext();

      rateLimitMiddleware()(req2, res2, next2);

      expect(res2.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
    });
  });
});
