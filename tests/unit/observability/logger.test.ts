/**
 * Unit tests for logger utilities
 */

import {
  createRequestLogger,
  logger,
  logMiddlewareEvent,
  logToolExecution,
  safeLog,
} from '../../../src/observability/logger.js';

describe('logger utilities', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create a child logger with request context', () => {
    const child = logger.child({ test: true });
    const childSpy = jest.spyOn(logger, 'child').mockReturnValue(child as never);

    const result = createRequestLogger(
      { requestId: 'req-123', sessionId: 'session-456' },
      { feature: 'test' }
    );

    expect(childSpy).toHaveBeenCalledWith({
      request_id: 'req-123',
      session_id: 'session-456',
      feature: 'test',
    });
    expect(result).toBe(child);
  });

  it('should log successful tool execution with request correlation', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

    logToolExecution({
      toolName: 'echo',
      action: 'call',
      durationMs: 12,
      success: true,
      context: { requestId: 'req-123' },
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'echo',
        action: 'call',
        durationMs: 12,
        request_id: 'req-123',
      }),
      'Tool execution completed'
    );
  });

  it('should log middleware failures as warnings', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

    logMiddlewareEvent({
      middleware: 'auth',
      action: 'rejected',
      success: false,
      details: { authMode: 'api-key' },
      context: { requestId: 'req-123' },
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        middleware: 'auth',
        action: 'rejected',
        authMode: 'api-key',
        request_id: 'req-123',
      }),
      'Middleware auth rejected'
    );
  });

  it('should hash user ids in safeLog output', () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

    safeLog({
      event: 'user_action',
      userId: 'sensitive-user-id',
      feature: 'demo',
    });

    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'user_action',
        userId: expect.stringMatching(/^[a-f0-9]{16}$/),
        feature: 'demo',
      }),
      'user_action'
    );
    expect(infoSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'sensitive-user-id' }),
      'user_action'
    );
  });
});
