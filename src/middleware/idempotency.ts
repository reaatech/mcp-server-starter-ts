/**
 * Idempotency middleware.
 *
 * Deduplicates requests with the same Idempotency-Key header.
 * Returns cached response for duplicate requests within TTL window.
 */

import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { envConfig } from '../config/env.js';
import { logger, logMiddlewareEvent } from '../observability/logger.js';
import type { IdempotencyEntry } from '../types/domain.js';

/**
 * In-memory idempotency cache.
 * Key: idempotency key scoped to the request fingerprint
 * Value: cached entry
 */
const idempotencyCache = new Map<string, IdempotencyEntry>();

/**
 * Clean up expired entries periodically.
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache.entries()) {
    if (now - entry.createdAt > entry.ttl) {
      idempotencyCache.delete(key);
    }
  }
}

const cleanupInterval = setInterval(cleanupExpiredEntries, 60000);
cleanupInterval.unref?.();

/**
 * Get cached response for a scoped idempotency cache key.
 * Returns null if not found or expired.
 */
function getCachedResponse(key: string): IdempotencyEntry | null {
  const entry = idempotencyCache.get(key);
  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (now - entry.createdAt > entry.ttl) {
    idempotencyCache.delete(key);
    return null;
  }

  return entry;
}

/**
 * Cache a response for a scoped idempotency cache key.
 */
function cacheResponse(key: string, response: unknown, statusCode: number): void {
  const entry: IdempotencyEntry = {
    key,
    response,
    statusCode,
    createdAt: Date.now(),
    ttl: envConfig.IDEMPOTENCY_TTL_MS,
  };
  idempotencyCache.set(key, entry);
}

/**
 * Get idempotency key from request headers.
 */
function getIdempotencyKey(req: Request): string | undefined {
  return req.headers['idempotency-key'] as string | undefined;
}

function getRequestFingerprint(req: Request): string {
  const actor =
    (req.headers['x-api-key'] as string | undefined) ??
    (req.headers.authorization as string | undefined) ??
    req.ip ??
    req.socket?.remoteAddress ??
    'unknown';
  const body = req.body === undefined ? '' : JSON.stringify(req.body);

  return createHash('sha256')
    .update(
      JSON.stringify({
        method: req.method,
        path: req.originalUrl || req.url,
        actor,
        body,
      })
    )
    .digest('hex');
}

function getCacheKey(req: Request, idempotencyKey: string): string {
  return `${idempotencyKey}:${getRequestFingerprint(req)}`;
}

/**
 * Extend Express Response type to store intercepted responses
 */
declare global {
  namespace Express {
    interface Response {
      _idempotencyOriginalSend?: (body?: unknown) => Response;
      _idempotencyOriginalJson?: (body?: unknown) => Response;
    }
  }
}

function isCacheableResponse(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 400;
}

/**
 * Idempotency middleware.
 *
 * For requests with an Idempotency-Key header:
 * - If a matching scoped key exists in cache and is not expired: return cached response
 * - Otherwise: intercept response, cache it, then send
 *
 * Cache scope includes request path, method, actor, and body to prevent
 * collisions across callers or endpoints that reuse the same Idempotency-Key.
 */
export function idempotencyMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = req.requestContext;
    const idempotencyKey = getIdempotencyKey(req);

    // No idempotency key provided - proceed normally
    if (!idempotencyKey) {
      next();
      return;
    }

    if (req.requestContext) {
      req.requestContext.idempotencyKey = idempotencyKey;
    }

    const cacheKey = getCacheKey(req, idempotencyKey);

    // Check for existing cached response
    const cachedEntry = getCachedResponse(cacheKey);
    if (cachedEntry) {
      logMiddlewareEvent({
        middleware: 'idempotency',
        action: 'cache hit',
        success: true,
        details: { idempotencyKey },
        ...(context && { context }),
      });

      res.set('Idempotency-Key', idempotencyKey);
      res.set('X-Idempotency-Cached', 'true');
      res.status(cachedEntry.statusCode);
      if (cachedEntry.response !== null && typeof cachedEntry.response === 'object') {
        res.json(cachedEntry.response);
      } else {
        res.send(cachedEntry.response);
      }
      return;
    }

    const originalSend = res.send.bind(res);
    const originalJson = res.json.bind(res);
    res._idempotencyOriginalSend = originalSend;
    res._idempotencyOriginalJson = originalJson;

    const captureResponse = (body: unknown): void => {
      if (isCacheableResponse(res.statusCode)) {
        cacheResponse(cacheKey, body, res.statusCode);
        res.set('Idempotency-Key', idempotencyKey);
        res.set('X-Idempotency-Cached', 'false');
      }
    };

    res.json = function json(body: unknown) {
      captureResponse(body);
      return originalJson(body);
    };

    res.send = function send(body: unknown) {
      captureResponse(body);
      return originalSend(body);
    };

    logMiddlewareEvent({
      middleware: 'idempotency',
      action: 'tracking',
      success: true,
      details: { idempotencyKey },
      ...(context && { context }),
    });

    next();
  };
}

/**
 * Clear idempotency cache.
 * Primarily for testing purposes.
 */
export function clearIdempotencyCache(): void {
  idempotencyCache.clear();
  logger.debug('Idempotency cache cleared');
}

/**
 * Get cache size for monitoring.
 */
export function getIdempotencyCacheSize(): number {
  return idempotencyCache.size;
}
