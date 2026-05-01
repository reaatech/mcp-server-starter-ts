import { timingSafeEqual } from 'node:crypto';
import { envConfig } from '@reaatech/mcp-server-core';
import type { RequestContext } from '@reaatech/mcp-server-core';
import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestContext?: RequestContext;
    }
  }
}

export function authMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = req.headers['x-request-id'] as string | undefined;

    const context: RequestContext = {
      requestId: requestId ?? crypto.randomUUID(),
      ...(req.ip && { ipAddress: req.ip }),
    };

    if (envConfig.NODE_ENV !== 'production' && envConfig.AUTH_BYPASS_IN_DEV && !envConfig.API_KEY) {
      req.requestContext = context;
      next();
      return;
    }

    if (!envConfig.API_KEY) {
      res.status(500).json({
        error: 'Authentication not configured',
        message: 'API_KEY environment variable is required in production',
      });
      return;
    }

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
      res.set('WWW-Authenticate', envConfig.AUTH_MODE === 'bearer' ? 'Bearer' : 'x-api-key');
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid authentication credentials required',
      });
      return;
    }

    context.apiKey = '[REDACTED]';
    req.requestContext = context;

    next();
  };
}

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
