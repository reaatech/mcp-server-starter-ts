/**
 * Unit tests for metrics module
 */

import {
  recordToolInvocation,
  recordError,
  recordTransportRequest,
  setActiveSessionCount,
  shutdownMetrics,
} from '../../../src/observability/metrics.js';

const originalEnv = process.env;

describe('metrics', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = '';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('recordToolInvocation', () => {
    it('should not throw when metrics are not initialized', () => {
      expect(() => {
        recordToolInvocation({
          toolName: 'echo',
          status: 'success',
          durationMs: 42,
        });
      }).not.toThrow();
    });

    it('should record success status', () => {
      expect(() => {
        recordToolInvocation({
          toolName: 'echo',
          status: 'success',
          durationMs: 100,
        });
      }).not.toThrow();
    });

    it('should record error status', () => {
      expect(() => {
        recordToolInvocation({
          toolName: 'health-check',
          status: 'error',
          durationMs: 5,
        });
      }).not.toThrow();
    });
  });

  describe('recordError', () => {
    it('should not throw when metrics are not initialized', () => {
      expect(() => {
        recordError({ errorType: 'validation' });
      }).not.toThrow();
    });

    it('should record error with tool name', () => {
      expect(() => {
        recordError({ errorType: 'timeout', toolName: 'echo' });
      }).not.toThrow();
    });
  });

  describe('recordTransportRequest', () => {
    it('should not throw when metrics are not initialized', () => {
      expect(() => {
        recordTransportRequest({ transport: 'streamable-http', status: 'success' });
      }).not.toThrow();
    });

    it('should record SSE transport request', () => {
      expect(() => {
        recordTransportRequest({ transport: 'sse', status: 'error' });
      }).not.toThrow();
    });
  });

  describe('setActiveSessionCount', () => {
    it('should not throw when metrics are not initialized', () => {
      expect(() => {
        setActiveSessionCount(5);
      }).not.toThrow();
    });

    it('should return 0 when metrics not initialized', () => {
      setActiveSessionCount(99);
    });
  });

  describe('shutdownMetrics', () => {
    it('should not throw when metrics are not initialized', async () => {
      await expect(shutdownMetrics()).resolves.not.toThrow();
    });
  });
});
