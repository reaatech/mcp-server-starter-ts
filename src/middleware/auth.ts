/**
 * Authentication middleware.
 *
 * Validates API key or Bearer token on incoming requests.
 * Can be bypassed in development mode.
 */

import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { envConfig } from '../config/env.js';
import { logMiddlewareEvent } from '../observability/logger.js';
import type { RequestContext } from '../types/domain.js';

declare global {
  namespace Express {
    interface Request {
      requestContext?: RequestContext;
    }
  }
}

/**
 * Authentication middleware factory.
 *
 * In development mode, auth is bypassed (configurable).
 * In production, requires either:
 *   - x-api-key header matching API_KEY env var, OR
 *   - Authorization: Bearer <token> header matching API_KEY env var
 */
export function authMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string | undefined;

    // Initialize request context
    const context: RequestContext = {
      requestId: requestId ?? crypto.randomUUID(),
      ...(req.ip && { ipAddress: req.ip }),
    };

    // Allow bypass outside production when explicitly enabled and no API key is set.
    if (envConfig.NODE_ENV !== 'production' && envConfig.AUTH_BYPASS_IN_DEV && !envConfig.API_KEY) {
      logMiddlewareEvent({
        middleware: 'auth',
        action: 'bypassed (non-production, no API_KEY)',
        success: true,
        context,
      });
      req.requestContext = context;
      next();
      return;
    }

    // Require authentication in production or when API_KEY is set
    if (!envConfig.API_KEY) {
      logMiddlewareEvent({
        middleware: 'auth',
        action: 'rejected (no API_KEY configured)',
        success: false,
        context,
      });
      res.status(500).json({
        error: 'Authentication not configured',
        message: 'API_KEY environment variable is required in production',
      });
      return;
    }

    // Check for API key in x-api-key header
    const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
    const authHeader = req.headers.authorization as string | undefined;

    let isAuthenticated = false;

    if (envConfig.AUTH_MODE === 'api-key' && apiKeyHeader) {
      isAuthenticated = constantTimeCompare(apiKeyHeader, envConfig.API_KEY);
    } else if (envConfig.AUTH_MODE === 'bearer' && authHeader) {
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      isAuthenticated = constantTimeCompare(bearerToken, envConfig.API_KEY);
    }

    if (!isAuthenticated) {
      logMiddlewareEvent({
        middleware: 'auth',
        action: 'rejected (invalid credentials)',
        success: false,
        details: {
          authMode: envConfig.AUTH_MODE,
          hasApiKeyHeader: !!apiKeyHeader,
          hasAuthHeader: !!authHeader,
        },
        context,
      });
      res.set('WWW-Authenticate', envConfig.AUTH_MODE === 'bearer' ? 'Bearer' : 'x-api-key');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid authentication credentials required',
      });
      return;
    }

    // Auth succeeded
    context.apiKey = '[REDACTED]';
    req.requestContext = context;

    logMiddlewareEvent({
      middleware: 'auth',
      action: 'authenticated',
      success: true,
      context,
    });

    next();
  };
}

/**
 * Constant-time comparison to prevent timing attacks.
 * Uses crypto.timingSafeEqual for actual comparison, with
 * length comparison done in constant time via XOR.
 */
function constantTimeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');

  const aLen = aBuf.length;
  const bLen = bBuf.length;

  let result = aLen ^ bLen;

  const maxLen = Math.max(aLen, bLen);
  const paddedA = aLen === maxLen ? aBuf : Buffer.concat([aBuf, Buffer.alloc(maxLen - aLen)]);
  const paddedB = bLen === maxLen ? bBuf : Buffer.concat([bBuf, Buffer.alloc(maxLen - bLen)]);

  try {
    result |= timingSafeEqual(paddedA, paddedB) ? 0 : 1;
  } catch {
    result |= 1;
  }

  return result === 0;
}
