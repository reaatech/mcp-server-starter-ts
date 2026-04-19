/**
 * Unit tests for tracing module
 */

import {
  getTracer,
  withSpan,
  setSpanAttributes,
  shutdownObservability,
} from '../../../src/observability/tracing.js';

const originalEnv = process.env;

describe('tracing', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getTracer', () => {
    it('should return a tracer instance', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      expect(typeof tracer.startActiveSpan).toBe('function');
    });
  });

  describe('withSpan', () => {
    it('should execute function and return result', async () => {
      const result = await withSpan('test-span', async () => 'hello');
      expect(result).toBe('hello');
    });

    it('should execute function with attributes', async () => {
      const result = await withSpan('test-span', async () => 42, { key: 'value' });
      expect(result).toBe(42);
    });

    it('should propagate errors', async () => {
      await expect(
        withSpan('test-span', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');
    });

    it('should handle async operations', async () => {
      const start = Date.now();
      const result = await withSpan('async-span', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'done';
      });
      expect(result).toBe('done');
      expect(Date.now() - start).toBeGreaterThanOrEqual(10);
    });
  });

  describe('setSpanAttributes', () => {
    it('should not throw when no active span', () => {
      expect(() => {
        setSpanAttributes({ test: 'value' });
      }).not.toThrow();
    });
  });

  describe('shutdownObservability', () => {
    it('should not throw when not initialized', async () => {
      await expect(shutdownObservability()).resolves.not.toThrow();
    });
  });
});
