import { createHash } from 'node:crypto';
import { envConfig } from '@reaatech/mcp-server-core';
import type { RateLimitState } from '@reaatech/mcp-server-core';
import { logMiddlewareEvent, logger } from '@reaatech/mcp-server-observability';
import type { NextFunction, Request, Response } from 'express';

const rateLimitStore = new Map<string, RateLimitState & { lastAccessedAt: number }>();

function cleanupStaleEntries(): void {
  const now = Date.now();
  const staleThreshold = 30 * 60 * 1000;

  for (const [key, state] of rateLimitStore.entries()) {
    if (now - state.lastAccessedAt > staleThreshold) {
      rateLimitStore.delete(key);
    }
  }
}

const cleanupInterval = setInterval(cleanupStaleEntries, 5 * 60 * 1000);
cleanupInterval.unref?.();

function hashClientKey(clientKey: string): string {
  return createHash('sha256').update(clientKey).digest('hex').slice(0, 16);
}

function getOrCreateState(key: string): RateLimitState & { lastAccessedAt: number } {
  const existing = rateLimitStore.get(key);
  if (existing) {
    existing.lastAccessedAt = Date.now();
    return existing;
  }

  const state: RateLimitState & { lastAccessedAt: number } = {
    tokens: envConfig.RATE_LIMIT_RPM,
    lastRefill: Date.now(),
    lastAccessedAt: Date.now(),
  };
  rateLimitStore.set(key, state);
  return state;
}

function refillTokens(state: RateLimitState): void {
  const now = Date.now();
  const elapsedMs = now - state.lastRefill;

  if (elapsedMs <= 0) {
    state.lastRefill = now;
    return;
  }

  const elapsedMinutes = elapsedMs / 60000;
  state.tokens = Math.min(
    envConfig.RATE_LIMIT_RPM,
    Math.max(0, state.tokens + elapsedMinutes * envConfig.RATE_LIMIT_RPM),
  );
  state.lastRefill = now;
}

function getClientKey(req: Request): string {
  const apiKey = req.headers['x-api-key'] as string | undefined;
  if (apiKey) {
    return hashClientKey(`key:${apiKey}`);
  }

  const authHeader = req.headers.authorization as string | undefined;
  if (authHeader) {
    return hashClientKey(`auth:${authHeader}`);
  }

  return hashClientKey(`ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`);
}

export function rateLimitMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const context = req.requestContext;
    const clientKey = getClientKey(req);
    const clientId = hashClientKey(clientKey);

    const state = getOrCreateState(clientKey);
    refillTokens(state);

    res.set('X-RateLimit-Limit', envConfig.RATE_LIMIT_RPM.toString());
    res.set('X-RateLimit-Remaining', Math.floor(state.tokens).toString());

    if (state.tokens < 1) {
      const retryAfterMs = Math.ceil(((1 - state.tokens) / envConfig.RATE_LIMIT_RPM) * 60000);
      const retryAfterSecs = Math.ceil(retryAfterMs / 1000);

      res.set('Retry-After', retryAfterSecs.toString());

      logMiddlewareEvent({
        middleware: 'rate-limit',
        action: 'rate limit exceeded',
        success: false,
        details: {
          clientId,
          retryAfterSecs,
          tokens: state.tokens,
        },
        ...(context && { context }),
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please retry after the specified time.',
        retryAfter: retryAfterSecs,
      });
      return;
    }

    state.tokens -= 1;
    res.set('X-RateLimit-Remaining', Math.floor(state.tokens).toString());

    logMiddlewareEvent({
      middleware: 'rate-limit',
      action: 'allowed',
      success: true,
      details: {
        clientId,
        tokensRemaining: state.tokens,
      },
      ...(context && { context }),
    });

    next();
  };
}

export function clearRateLimitStore(): void {
  rateLimitStore.clear();
  logger.debug('Rate limit store cleared');
}
