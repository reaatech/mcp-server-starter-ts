import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnvConfig = vi.hoisted(() => ({
  LOG_LEVEL: 'info' as const,
  NODE_ENV: 'test' as const,
  OTEL_EXPORTER_OTLP_ENDPOINT: undefined as string | undefined,
  OTEL_SERVICE_NAME: 'mcp-server',
  OTEL_RESOURCE_ATTRIBUTES: undefined as string | undefined,
}));

const mockSpan = vi.hoisted(() => ({
  setStatus: vi.fn(),
  end: vi.fn(),
  recordException: vi.fn(),
  setAttribute: vi.fn(),
}));

const mockTracer = vi.hoisted(() => ({
  startActiveSpan: vi.fn(),
}));

const mockNodeSdkInstance = vi.hoisted(() => ({
  start: vi.fn(),
  shutdown: vi.fn(),
}));

const mockResource = vi.hoisted(() => ({ merge: vi.fn(() => mockResource) }));

vi.mock('@reaatech/mcp-server-core', () => ({
  envConfig: mockEnvConfig,
  isDevelopment: () => false,
  isTest: () => true,
  SERVICE_VERSION: '1.0.0',
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => mockTracer),
    getActiveSpan: vi.fn(),
  },
  SpanKind: { INTERNAL: 0, SERVER: 1, CLIENT: 2, PRODUCER: 3, CONSUMER: 4 },
  SpanStatusCode: { OK: 0, ERROR: 1, UNSET: 2 },
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn(() => mockResource),
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn(() => mockNodeSdkInstance),
}));

vi.mock('./metrics.js', () => ({
  initMetrics: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('pino', () => {
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(),
  };
  const pinoFn = vi.fn(() => mockLogger);
  pinoFn.stdTimeFunctions = { isoTime: () => '' };
  return { default: pinoFn };
});

import { type Span, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  getTracer,
  initObservability,
  setSpanAttributes,
  shutdownObservability,
  withSpan,
} from './index.js';
import { initMetrics } from './metrics.js';

describe('tracing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initObservability', () => {
    it('returns early when no OTLP endpoint', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = undefined;

      await initObservability();

      expect(NodeSDK).not.toHaveBeenCalled();
    });

    it('initializes NodeSDK when endpoint is set', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      mockNodeSdkInstance.start.mockResolvedValue(undefined);

      await initObservability();

      expect(resourceFromAttributes).toHaveBeenCalledWith({
        'service.name': 'mcp-server',
        'service.version': '1.0.0',
        'deployment.environment': 'test',
      });
      expect(OTLPTraceExporter).toHaveBeenCalledWith({
        url: 'http://localhost:4318/v1/traces',
      });
      expect(getNodeAutoInstrumentations).toHaveBeenCalledWith({
        '@opentelemetry/instrumentation-express': {
          requestHook: expect.any(Function),
        },
      });
      expect(NodeSDK).toHaveBeenCalled();
      expect(mockNodeSdkInstance.start).toHaveBeenCalled();
      expect(initMetrics).toHaveBeenCalled();
    });

    it('returns early when already initialized', async () => {
      await initObservability();

      expect(mockNodeSdkInstance.start).toHaveBeenCalledTimes(0);
    });

    it('handles initialization failure gracefully', async () => {
      vi.clearAllMocks();
      await shutdownObservability();

      mockNodeSdkInstance.start.mockRejectedValue(new Error('start failed'));

      await initObservability();

      expect(mockNodeSdkInstance.start).toHaveBeenCalled();
    });

    it('handles non-Error initialization failure', async () => {
      vi.clearAllMocks();
      await shutdownObservability();

      mockNodeSdkInstance.start.mockRejectedValue('string error');

      await initObservability();
    });

    afterAll(async () => {
      vi.clearAllMocks();
      mockNodeSdkInstance.start.mockResolvedValue(undefined);
      await shutdownObservability();
    });
  });

  describe('shutdownObservability', () => {
    it('is no-op when not initialized', async () => {
      vi.clearAllMocks();
      await shutdownObservability();

      expect(mockNodeSdkInstance.shutdown).not.toHaveBeenCalled();
    });

    it('shuts down the SDK', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      vi.clearAllMocks();
      await initObservability();

      await shutdownObservability();

      expect(mockNodeSdkInstance.shutdown).toHaveBeenCalledOnce();
    });

    it('is no-op after already shut down', async () => {
      await shutdownObservability();

      expect(mockNodeSdkInstance.shutdown).not.toHaveBeenCalled();
    });
  });

  describe('resource attributes', () => {
    it('merges custom resource attributes from environment', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      mockEnvConfig.OTEL_RESOURCE_ATTRIBUTES = 'key1=value1,key2=value2';
      mockNodeSdkInstance.start.mockResolvedValue(undefined);

      await initObservability();

      expect(resourceFromAttributes).toHaveBeenNthCalledWith(1, {
        'service.name': 'mcp-server',
        'service.version': '1.0.0',
        'deployment.environment': 'test',
      });
      expect(resourceFromAttributes).toHaveBeenNthCalledWith(2, {
        key1: 'value1',
        key2: 'value2',
      });
      expect(mockResource.merge).toHaveBeenCalled();
    });

    it('handles malformed resource attribute entries', async () => {
      mockEnvConfig.OTEL_RESOURCE_ATTRIBUTES = 'keyonly,=value,valid=yes';
      vi.clearAllMocks();
      await shutdownObservability();
      mockNodeSdkInstance.start.mockResolvedValue(undefined);

      await initObservability();

      expect(resourceFromAttributes).toHaveBeenNthCalledWith(2, {
        valid: 'yes',
      });
    });

    afterAll(async () => {
      mockEnvConfig.OTEL_RESOURCE_ATTRIBUTES = undefined;
      vi.clearAllMocks();
      await shutdownObservability();
    });
  });

  describe('requestHook', () => {
    it('sets http.request_id from x-request-id header', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      mockNodeSdkInstance.start.mockResolvedValue(undefined);

      await initObservability();

      const config = vi.mocked(getNodeAutoInstrumentations).mock.calls[0][0];
      const requestHook = config['@opentelemetry/instrumentation-express'].requestHook;

      const span = { setAttribute: vi.fn() };
      const info = { request: { headers: { 'x-request-id': 'req-123' } } };
      requestHook(span, info);

      expect(span.setAttribute).toHaveBeenCalledWith('http.request_id', 'req-123');
    });

    it('falls back to "unknown" when x-request-id is missing', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      vi.clearAllMocks();
      await shutdownObservability();
      mockNodeSdkInstance.start.mockResolvedValue(undefined);

      await initObservability();

      const config = vi.mocked(getNodeAutoInstrumentations).mock.calls[0][0];
      const requestHook = config['@opentelemetry/instrumentation-express'].requestHook;

      const span = { setAttribute: vi.fn() };
      const info = { request: { headers: {} } };
      requestHook(span, info);

      expect(span.setAttribute).toHaveBeenCalledWith('http.request_id', 'unknown');
    });

    afterAll(async () => {
      vi.clearAllMocks();
      await shutdownObservability();
    });
  });

  describe('getTracer', () => {
    it('returns a tracer from OpenTelemetry', () => {
      const tracer = getTracer();

      expect(trace.getTracer).toHaveBeenCalledWith('mcp-server', '1.0.0');
      expect(tracer).toBe(mockTracer);
    });
  });

  describe('withSpan', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockTracer.startActiveSpan.mockImplementation((_name, _options, fn) => fn(mockSpan));
    });

    it('sets status to OK on success', async () => {
      const result = await withSpan('test-span', async () => 'done');

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'test-span',
        { kind: SpanKind.INTERNAL, attributes: undefined },
        expect.any(Function),
      );
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
      expect(mockSpan.end).toHaveBeenCalled();
      expect(result).toBe('done');
    });

    it('sets status to ERROR on rejection', async () => {
      const error = new Error('task failed');

      await expect(
        withSpan('test-span', async () => {
          throw error;
        }),
      ).rejects.toThrow('task failed');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'task failed',
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('handles non-Error rejection', async () => {
      await expect(
        withSpan('test-span', async () => {
          throw 'string error';
        }),
      ).rejects.toBe('string error');

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'Unknown error',
      });
      expect(mockSpan.recordException).toHaveBeenCalled();
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('passes attributes to the span', async () => {
      mockTracer.startActiveSpan.mockImplementation((_name, _options, fn) => fn(mockSpan));

      await withSpan('test-span', async () => 'result', { key1: 'value1', key2: 42 });

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'test-span',
        { kind: SpanKind.INTERNAL, attributes: { key1: 'value1', key2: 42 } },
        expect.any(Function),
      );
    });

    it('always ends the span even on rejection', async () => {
      await expect(
        withSpan('test-span', async () => {
          throw new Error('fail');
        }),
      ).rejects.toThrow();

      expect(mockSpan.end).toHaveBeenCalled();
    });
  });

  describe('setSpanAttributes', () => {
    it('sets attributes on the active span', () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(mockSpan as Span);

      setSpanAttributes({ key1: 'value1', key2: 42, key3: true });

      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key1', 'value1');
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key2', 42);
      expect(mockSpan.setAttribute).toHaveBeenCalledWith('key3', true);
    });

    it('is no-op when no active span exists', () => {
      vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

      setSpanAttributes({ key1: 'value1' });

      expect(mockSpan.setAttribute).not.toHaveBeenCalled();
    });
  });
});
