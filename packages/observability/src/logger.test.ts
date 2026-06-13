import type { RequestContext } from '@reaatech/mcp-server-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockChildLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
}));

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(() => mockChildLogger),
}));

vi.mock('@reaatech/mcp-server-core', () => ({
  envConfig: { LOG_LEVEL: 'info', NODE_ENV: 'development' },
  isDevelopment: () => true,
  isTest: () => false,
  SERVICE_VERSION: '1.0.0',
}));

vi.mock('pino', () => {
  const pinoFn = vi.fn(() => mockLogger);
  pinoFn.stdTimeFunctions = { isoTime: () => '' };
  return { default: pinoFn };
});

import {
  createRequestLogger,
  logger,
  logMiddlewareEvent,
  logToolExecution,
  safeLog,
} from './index.js';

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });

  describe('createRequestLogger', () => {
    it('creates child logger with request context', () => {
      const context: RequestContext = { requestId: 'req-1', sessionId: 'sess-1' };

      createRequestLogger(context);

      expect(logger.child).toHaveBeenCalledWith({
        request_id: 'req-1',
        session_id: 'sess-1',
      });
    });

    it('returns the child logger', () => {
      const context: RequestContext = { requestId: 'req-1' };

      const result = createRequestLogger(context);

      expect(result).toBe(mockChildLogger);
    });

    it('merges additional fields into child logger', () => {
      const context: RequestContext = { requestId: 'req-1', sessionId: 'sess-1' };

      createRequestLogger(context, { source: 'api', version: 2 });

      expect(logger.child).toHaveBeenCalledWith({
        request_id: 'req-1',
        session_id: 'sess-1',
        source: 'api',
        version: 2,
      });
    });
  });

  describe('logToolExecution', () => {
    it('logs info on success', () => {
      const context: RequestContext = { requestId: 'req-1' };

      logToolExecution({
        toolName: 'my-tool',
        action: 'execute',
        durationMs: 100,
        success: true,
        context,
      });

      expect(logger.info).toHaveBeenCalledWith(
        { tool: 'my-tool', action: 'execute', durationMs: 100, request_id: 'req-1' },
        'Tool execution completed',
      );
    });

    it('logs error on failure', () => {
      const context: RequestContext = { requestId: 'req-2' };

      logToolExecution({
        toolName: 'my-tool',
        action: 'execute',
        durationMs: 50,
        success: false,
        error: 'Something went wrong',
        context,
      });

      expect(logger.error).toHaveBeenCalledWith(
        {
          tool: 'my-tool',
          action: 'execute',
          durationMs: 50,
          error: 'Something went wrong',
          request_id: 'req-2',
        },
        'Tool execution failed',
      );
    });
  });

  describe('logMiddlewareEvent', () => {
    it('logs debug on success without context or details', () => {
      logMiddlewareEvent({
        middleware: 'auth',
        action: 'check',
        success: true,
      });

      expect(logger.debug).toHaveBeenCalledWith(
        { middleware: 'auth', action: 'check' },
        'Middleware auth check',
      );
    });

    it('logs warn on failure with context and details', () => {
      logMiddlewareEvent({
        middleware: 'rate-limit',
        action: 'enforce',
        success: false,
        details: { limit: 100, remaining: 0 },
        context: { requestId: 'req-1' },
      });

      expect(logger.warn).toHaveBeenCalledWith(
        {
          middleware: 'rate-limit',
          action: 'enforce',
          request_id: 'req-1',
          limit: 100,
          remaining: 0,
        },
        'Middleware rate-limit enforce',
      );
    });

    it('includes request_id when context has requestId', () => {
      logMiddlewareEvent({
        middleware: 'auth',
        action: 'verify',
        success: true,
        context: { requestId: 'req-1' },
      });

      expect(logger.debug).toHaveBeenCalledWith(
        { middleware: 'auth', action: 'verify', request_id: 'req-1' },
        'Middleware auth verify',
      );
    });

    it('does not include request_id when context has no requestId', () => {
      logMiddlewareEvent({
        middleware: 'auth',
        action: 'verify',
        success: true,
        context: { requestId: '' },
      });

      expect(logger.debug).toHaveBeenCalledWith(
        { middleware: 'auth', action: 'verify' },
        'Middleware auth verify',
      );
    });

    it('does not include request_id when context is undefined', () => {
      logMiddlewareEvent({
        middleware: 'auth',
        action: 'verify',
        success: true,
      });

      expect(logger.debug).toHaveBeenCalledWith(
        { middleware: 'auth', action: 'verify' },
        'Middleware auth verify',
      );
    });
  });

  describe('safeLog', () => {
    it('logs event with hashed userId', () => {
      safeLog({ event: 'user_login', userId: 'user@example.com' });

      const args = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(args[0].event).toBe('user_login');
      expect(args[0].userId).toBeDefined();
      expect(args[0].userId).not.toBe('user@example.com');
      expect(args[0].userId).toHaveLength(16);
      expect(args[1]).toBe('user_login');
    });

    it('logs event without userId', () => {
      safeLog({ event: 'page_view' });

      expect(logger.info).toHaveBeenCalledWith({ event: 'page_view' }, 'page_view');
    });

    it('logs event with empty userId (no hashing)', () => {
      safeLog({ event: 'page_view', userId: '' });

      expect(logger.info).toHaveBeenCalledWith({ event: 'page_view', userId: '' }, 'page_view');
    });

    it('preserves additional fields', () => {
      safeLog({ event: 'custom_event', category: 'analytics', value: 42 });

      expect(logger.info).toHaveBeenCalledWith(
        { event: 'custom_event', category: 'analytics', value: 42 },
        'custom_event',
      );
    });
  });
});
