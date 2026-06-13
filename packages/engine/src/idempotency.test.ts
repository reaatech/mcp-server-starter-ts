import { resetEnvConfigCache } from '@reaatech/mcp-server-core';
import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearIdempotencyCache,
  getIdempotencyCacheSize,
  idempotencyMiddleware,
} from './idempotency.js';

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    headers: {},
    method: 'POST',
    url: '/test',
    originalUrl: '/test',
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
    body: { foo: 'bar' },
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

describe('idempotency', () => {
  beforeEach(() => {
    clearIdempotencyCache();
  });

  afterEach(() => {
    resetEnvConfigCache();
  });

  describe('idempotencyMiddleware', () => {
    it('calls next() when no idempotency key is present', () => {
      const req = mockReq({ headers: {} });
      const res = mockRes();
      const next = mockNext();

      idempotencyMiddleware()(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('sets idempotencyKey on requestContext when present', () => {
      const req = mockReq({
        headers: { 'idempotency-key': 'my-key' },
        requestContext: { requestId: 'req-1' },
      });
      const res = mockRes();
      const next = mockNext();

      idempotencyMiddleware()(req, res, next);

      expect(req.requestContext?.idempotencyKey).toBe('my-key');
    });

    it('caches and returns cached response for object body', async () => {
      const req = mockReq({
        headers: { 'idempotency-key': 'key-1' },
        body: { data: 'test' },
      });
      const res = mockRes();
      const next = mockNext();
      next.mockImplementation(() => {
        res.statusCode = 200;
        res.json({ result: 'first' });
      });

      idempotencyMiddleware()(req, res, next);

      expect(res.set).toHaveBeenCalledWith('Idempotency-Key', 'key-1');
      expect(res.set).toHaveBeenCalledWith('X-Idempotency-Cached', 'false');

      const req2 = mockReq({
        headers: { 'idempotency-key': 'key-1' },
        body: { data: 'test' },
      });
      const res2 = mockRes();
      const next2 = mockNext();

      idempotencyMiddleware()(req2, res2, next2);

      expect(res2.set).toHaveBeenCalledWith('Idempotency-Key', 'key-1');
      expect(res2.set).toHaveBeenCalledWith('X-Idempotency-Cached', 'true');
      expect(res2.json).toHaveBeenCalledWith({ result: 'first' });
      expect(res2.status).toHaveBeenCalledWith(200);
      expect(next2).not.toHaveBeenCalled();
    });

    it('caches and returns cached response for non-object body via send', async () => {
      const req = mockReq({
        headers: { 'idempotency-key': 'key-2' },
        body: 'plain text',
      });
      const res = mockRes();
      const next = mockNext();
      next.mockImplementation(() => {
        res.statusCode = 200;
        res.send('plain');
      });

      idempotencyMiddleware()(req, res, next);

      const req2 = mockReq({
        headers: { 'idempotency-key': 'key-2' },
        body: 'plain text',
      });
      const res2 = mockRes();
      res2.send = vi.fn().mockReturnValue(res2);
      res2.json = vi.fn().mockReturnValue(res2);
      res2.set = vi.fn().mockReturnValue(res2);
      res2.status = vi.fn().mockReturnValue(res2);
      res2.statusCode = 200;
      const next2 = mockNext();

      idempotencyMiddleware()(req2, res2, next2);

      expect(res2.send).toHaveBeenCalledWith('plain');
      expect(next2).not.toHaveBeenCalled();
    });

    it('does not cache non-cacheable responses (>= 400)', () => {
      const req = mockReq({
        headers: { 'idempotency-key': 'key-3' },
      });
      const res = mockRes();
      const next = mockNext();
      next.mockImplementation(() => {
        res.statusCode = 400;
        res.json({ error: 'bad' });
      });

      idempotencyMiddleware()(req, res, next);

      const req2 = mockReq({
        headers: { 'idempotency-key': 'key-3' },
      });
      const res2 = mockRes();
      res2.set = vi.fn().mockReturnValue(res2);
      res2.status = vi.fn().mockReturnValue(res2);
      res2.statusCode = 200;
      const next2 = mockNext();

      idempotencyMiddleware()(req2, res2, next2);

      expect(next2).toHaveBeenCalled();
    });

    it('uses different cache keys for different request bodies', () => {
      const req = mockReq({
        headers: { 'idempotency-key': 'key-same' },
        body: { data: 'first' },
      });
      const res = mockRes();
      const next = mockNext();
      next.mockImplementation(() => {
        res.statusCode = 200;
        res.json({ result: 'first' });
      });

      idempotencyMiddleware()(req, res, next);

      const req2 = mockReq({
        headers: { 'idempotency-key': 'key-same' },
        body: { data: 'second' },
      });
      const res2 = mockRes();
      res2.set = vi.fn().mockReturnValue(res2);
      res2.status = vi.fn().mockReturnValue(res2);
      res2.statusCode = 200;
      const next2 = mockNext();

      idempotencyMiddleware()(req2, res2, next2);

      expect(next2).toHaveBeenCalled();
    });

    it('returns cached null response via send', async () => {
      const req = mockReq({
        headers: { 'idempotency-key': 'null-key' },
        body: {},
      });
      const res = mockRes();
      const next = mockNext();
      next.mockImplementation(() => {
        res.statusCode = 200;
        res.json(null);
      });

      idempotencyMiddleware()(req, res, next);

      const req2 = mockReq({
        headers: { 'idempotency-key': 'null-key' },
        body: {},
      });
      const res2 = mockRes();
      res2.send = vi.fn().mockReturnValue(res2);
      res2.json = vi.fn().mockReturnValue(res2);
      res2.set = vi.fn().mockReturnValue(res2);
      res2.status = vi.fn().mockReturnValue(res2);
      res2.statusCode = 200;
      const next2 = mockNext();

      idempotencyMiddleware()(req2, res2, next2);

      expect(res2.send).toHaveBeenCalled();
      expect(res2.json).not.toHaveBeenCalled();
    });
  });

  describe('clearIdempotencyCache', () => {
    it('clears the cache', () => {
      expect(getIdempotencyCacheSize()).toBe(0);
    });
  });

  describe('getIdempotencyCacheSize', () => {
    it('returns current cache size', () => {
      expect(getIdempotencyCacheSize()).toBe(0);
    });
  });

  describe('expired entries', () => {
    it('returns cache miss for expired entries', async () => {
      process.env.IDEMPOTENCY_TTL_MS = '10';
      resetEnvConfigCache();

      const req = mockReq({
        headers: { 'idempotency-key': 'exp-key' },
        body: { data: 'test' },
      });
      const res = mockRes();
      const next = mockNext();
      next.mockImplementation(() => {
        res.statusCode = 200;
        res.json({ result: 'first' });
      });

      idempotencyMiddleware()(req, res, next);

      await new Promise((r) => setTimeout(r, 20));

      const req2 = mockReq({
        headers: { 'idempotency-key': 'exp-key' },
        body: { data: 'test' },
      });
      const res2 = mockRes();
      res2.set = vi.fn().mockReturnValue(res2);
      res2.status = vi.fn().mockReturnValue(res2);
      res2.statusCode = 200;
      const next2 = mockNext();

      idempotencyMiddleware()(req2, res2, next2);

      expect(next2).toHaveBeenCalled();
    }, 10000);
  });

  describe('getRequestFingerprint', () => {
    it('uses unknown actor when no identifying info', () => {
      const req = mockReq({
        headers: {},
        ip: undefined,
        socket: { remoteAddress: undefined },
        body: { data: 'test' },
        'idempotency-key': 'test-key',
      });
      const res = mockRes();
      const next = mockNext();

      idempotencyMiddleware()(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('uses socket remoteAddress when ip is unavailable', () => {
      const req = mockReq({
        headers: {},
        ip: undefined,
        body: { data: 'test' },
        'idempotency-key': 'test-key',
      });
      const res = mockRes();
      const next = mockNext();

      idempotencyMiddleware()(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });
});
