/**
 * Unit tests for idempotency middleware
 */

import type { Request, Response } from 'express';
describe('idempotency middleware', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: jest.Mock;

  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.IDEMPOTENCY_TTL_MS = '300000'; // 5 minutes

    req = {
      headers: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn().mockReturnThis(),
      statusCode: 200,
      // Use a real function that returns `this` for chaining
      send: function (this: Response) {
        return this;
      } as unknown as Response['send'],
    };
    next = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should pass through requests without idempotency key', async () => {
    const { idempotencyMiddleware: freshMiddleware } =
      await import('../../../src/middleware/idempotency.js');
    const { clearIdempotencyCache } = await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });

  it('should track requests with idempotency key', async () => {
    const { idempotencyMiddleware: freshMiddleware } =
      await import('../../../src/middleware/idempotency.js');
    const { clearIdempotencyCache } = await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    req.headers = { 'idempotency-key': 'test-key-1' };

    middleware(req as Request, res as Response, next);

    // Should call next and wrap res.send
    expect(next).toHaveBeenCalled();
    expect(res.send).not.toBe(res._idempotencyOriginalSend);
  });

  it('should return cached response for duplicate requests', async () => {
    const {
      idempotencyMiddleware: freshMiddleware,
      clearIdempotencyCache,
      getIdempotencyCacheSize,
    } = await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    req.headers = { 'idempotency-key': 'test-key-2' };

    // First request - middleware wraps res.send
    middleware(req as Request, res as Response, next);

    // The middleware wraps res.send to intercept the response
    // We need to call the wrapped send function to trigger caching
    const wrappedSend = res.send;
    const toolResponse = { content: [{ type: 'text', text: 'test' }] };

    // Call the wrapped send - this should cache the response
    if (wrappedSend) {
      wrappedSend.call(res, toolResponse);
    }

    // Now the cache should have the response
    expect(getIdempotencyCacheSize()).toBeGreaterThan(0);

    // Reset for second request
    res.json = jest.fn();
    res.status = jest.fn().mockReturnThis();
    res.set = jest.fn().mockReturnThis();
    res.statusCode = 200;
    next = jest.fn();

    // Second request with same key should return cached response
    middleware(req as Request, res as Response, next);

    // Should not call next, should return cached response
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.set).toHaveBeenCalledWith('X-Idempotency-Cached', 'true');
  });

  it('should treat different keys as different requests', async () => {
    const { idempotencyMiddleware: freshMiddleware } =
      await import('../../../src/middleware/idempotency.js');
    const { clearIdempotencyCache } = await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    // First request
    req.headers = { 'idempotency-key': 'key-a' };
    middleware(req as Request, res as Response, next);

    // Reset
    next = jest.fn();
    res.json = jest.fn();
    res.status = jest.fn().mockReturnThis();
    res.statusCode = 200;

    // Second request with different key
    req.headers = { 'idempotency-key': 'key-b' };
    middleware(req as Request, res as Response, next);

    // Should call next because it's a new key
    expect(next).toHaveBeenCalled();
  });

  it('should set correct headers when sending response', async () => {
    const { idempotencyMiddleware: freshMiddleware } =
      await import('../../../src/middleware/idempotency.js');
    const { clearIdempotencyCache } = await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    req.headers = { 'idempotency-key': 'test-key-3' };

    middleware(req as Request, res as Response, next);

    // Send a response to trigger header setting
    const toolResponse = { content: [{ type: 'text', text: 'test' }] };
    if (res.send) {
      res.send(toolResponse);
    }

    // Headers should be set during send
    expect(res.set).toHaveBeenCalledWith('Idempotency-Key', 'test-key-3');
    expect(res.set).toHaveBeenCalledWith('X-Idempotency-Cached', 'false');
  });

  it('should handle non-object cached response', async () => {
    const { idempotencyMiddleware: freshMiddleware, clearIdempotencyCache } =
      await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    req.headers = { 'idempotency-key': 'string-key' };
    res.statusCode = 200;

    middleware(req as Request, res as Response, next);

    // Simulate sending a string response
    const wrappedSend = res.send;
    if (wrappedSend) {
      wrappedSend.call(res, 'string response');
    }

    // Reset for second request
    res.send = jest.fn();
    res.status = jest.fn().mockReturnThis();
    res.set = jest.fn().mockReturnThis();
    res.statusCode = 200;
    next = jest.fn();

    // Second request should return cached string response
    middleware(req as Request, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should scope cache entries by request path', async () => {
    const {
      idempotencyMiddleware: freshMiddleware,
      clearIdempotencyCache,
      getIdempotencyCacheSize,
    } = await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    req.headers = { 'idempotency-key': 'shared-key' };
    req.method = 'POST';
    req.url = '/mcp';
    req.originalUrl = '/mcp';
    res.statusCode = 200;

    middleware(req as Request, res as Response, next);

    const wrappedSend = res.send;
    if (wrappedSend) {
      wrappedSend.call(res, { ok: true });
    }

    expect(getIdempotencyCacheSize()).toBe(1);

    next = jest.fn();
    res.json = jest.fn();
    res.status = jest.fn().mockReturnThis();
    res.set = jest.fn().mockReturnThis();
    res.statusCode = 200;
    res.send = function (this: Response) {
      return this;
    } as unknown as Response['send'];
    req.url = '/health';
    req.originalUrl = '/health';

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should scope cache entries by authenticated actor', async () => {
    const {
      idempotencyMiddleware: freshMiddleware,
      clearIdempotencyCache,
      getIdempotencyCacheSize,
    } = await import('../../../src/middleware/idempotency.js');
    clearIdempotencyCache();
    const middleware = freshMiddleware();

    req.headers = {
      'idempotency-key': 'actor-key',
      'x-api-key': 'client-a',
    };
    req.method = 'POST';
    req.url = '/mcp';
    req.originalUrl = '/mcp';
    res.statusCode = 200;

    middleware(req as Request, res as Response, next);

    const wrappedSend = res.send;
    if (wrappedSend) {
      wrappedSend.call(res, { ok: true });
    }

    expect(getIdempotencyCacheSize()).toBe(1);

    next = jest.fn();
    res.json = jest.fn();
    res.status = jest.fn().mockReturnThis();
    res.set = jest.fn().mockReturnThis();
    res.statusCode = 200;
    res.send = function (this: Response) {
      return this;
    } as unknown as Response['send'];
    req.headers = {
      'idempotency-key': 'actor-key',
      'x-api-key': 'client-b',
    };

    middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
