import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mockEnvConfig = vi.hoisted(() => ({
  LOG_LEVEL: 'info' as const,
  NODE_ENV: 'test' as const,
  OTEL_EXPORTER_OTLP_ENDPOINT: undefined as string | undefined,
  OTEL_SERVICE_NAME: 'mcp-server',
  OTEL_RESOURCE_ATTRIBUTES: undefined as string | undefined,
}));

const mockCounter = vi.hoisted(() => ({ add: vi.fn() }));
const mockHistogram = vi.hoisted(() => ({ record: vi.fn() }));
const mockUpDownCounter = vi.hoisted(() => ({ add: vi.fn() }));
const mockMeterProviderInstance = vi.hoisted(() => ({ shutdown: vi.fn() }));
const mockMeter = vi.hoisted(() => ({
  createCounter: vi.fn(() => mockCounter),
  createHistogram: vi.fn(() => mockHistogram),
  createUpDownCounter: vi.fn(() => mockUpDownCounter),
}));

vi.mock('@reaatech/mcp-server-core', () => ({
  envConfig: mockEnvConfig,
  isDevelopment: () => false,
  isTest: () => true,
  SERVICE_VERSION: '1.0.0',
}));

vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: vi.fn(() => mockMeter),
    setGlobalMeterProvider: vi.fn(),
  },
  ValueType: { INT: 0 },
}));

vi.mock('@opentelemetry/exporter-metrics-otlp-http', () => ({
  OTLPMetricExporter: vi.fn(),
}));

vi.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: vi.fn(() => ({})),
}));

vi.mock('@opentelemetry/sdk-metrics', () => ({
  MeterProvider: vi.fn(() => mockMeterProviderInstance),
  PeriodicExportingMetricReader: vi.fn(),
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

import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import {
  initMetrics,
  recordError,
  recordToolInvocation,
  recordTransportRequest,
  setActiveSessionCount,
  shutdownMetrics,
} from './index.js';

describe('metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('initMetrics', () => {
    it('returns early when no OTLP endpoint is configured', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = undefined;

      await initMetrics();

      expect(MeterProvider).not.toHaveBeenCalled();
    });

    it('initializes OTLP metrics when endpoint is set', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

      await initMetrics();

      expect(resourceFromAttributes).toHaveBeenCalledWith({
        'service.name': 'mcp-server',
        'service.version': '1.0.0',
        'deployment.environment': 'test',
      });
      expect(OTLPMetricExporter).toHaveBeenCalledWith({
        url: 'http://localhost:4318/v1/metrics',
      });
      expect(MeterProvider).toHaveBeenCalled();
      expect(metrics.setGlobalMeterProvider).toHaveBeenCalledWith(mockMeterProviderInstance);
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'mcp.tool.invocations',
        expect.any(Object),
      );
      expect(mockMeter.createCounter).toHaveBeenCalledWith('mcp.server.errors', expect.any(Object));
      expect(mockMeter.createCounter).toHaveBeenCalledWith(
        'mcp.transport.requests',
        expect.any(Object),
      );
      expect(mockMeter.createHistogram).toHaveBeenCalledWith(
        'mcp.tool.duration',
        expect.any(Object),
      );
      expect(mockMeter.createUpDownCounter).toHaveBeenCalledWith(
        'mcp.server.active_sessions',
        expect.any(Object),
      );
    });

    it('returns early when already initialized', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

      await initMetrics();

      expect(mockMeter.createCounter).toHaveBeenCalledTimes(0);
      expect(MeterProvider).toHaveBeenCalledTimes(0);
    });

    afterAll(async () => {
      vi.clearAllMocks();
      await shutdownMetrics();
    });
  });

  describe('recordToolInvocation', () => {
    it('is no-op when metrics are not initialized', () => {
      vi.clearAllMocks();
      recordToolInvocation({ toolName: 'my-tool', status: 'success', durationMs: 100 });

      expect(mockCounter.add).not.toHaveBeenCalled();
      expect(mockHistogram.record).not.toHaveBeenCalled();
    });

    it('records invocation counters and histogram', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      vi.clearAllMocks();
      await shutdownMetrics();
      await initMetrics();

      recordToolInvocation({ toolName: 'my-tool', status: 'success', durationMs: 150 });

      expect(mockCounter.add).toHaveBeenCalledWith(1, { tool_name: 'my-tool', status: 'success' });
      expect(mockHistogram.record).toHaveBeenCalledWith(150, { tool_name: 'my-tool' });
    });

    it('records error status', async () => {
      recordToolInvocation({ toolName: 'my-tool', status: 'error', durationMs: 200 });

      expect(mockCounter.add).toHaveBeenCalledWith(1, { tool_name: 'my-tool', status: 'error' });
    });

    it('rounds duration to integer', async () => {
      recordToolInvocation({ toolName: 'my-tool', status: 'success', durationMs: 150.7 });

      expect(mockHistogram.record).toHaveBeenCalledWith(151, { tool_name: 'my-tool' });
    });

    afterAll(async () => {
      vi.clearAllMocks();
      await shutdownMetrics();
    });
  });

  describe('recordError', () => {
    it('is no-op when metrics are not initialized', () => {
      vi.clearAllMocks();
      recordError({ errorType: 'validation' });

      expect(mockCounter.add).not.toHaveBeenCalled();
    });

    it('records error with tool name', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      vi.clearAllMocks();
      await shutdownMetrics();
      await initMetrics();

      recordError({ errorType: 'validation', toolName: 'my-tool' });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        error_type: 'validation',
        tool_name: 'my-tool',
      });
    });

    it('records error without tool name', async () => {
      recordError({ errorType: 'timeout' });

      expect(mockCounter.add).toHaveBeenCalledWith(1, { error_type: 'timeout' });
    });

    afterAll(async () => {
      vi.clearAllMocks();
      await shutdownMetrics();
    });
  });

  describe('setActiveSessionCount', () => {
    it('is no-op when metrics are not initialized', () => {
      vi.clearAllMocks();
      setActiveSessionCount(5);

      expect(mockUpDownCounter.add).not.toHaveBeenCalled();
    });

    it('records delta from previous count', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      vi.clearAllMocks();
      await shutdownMetrics();
      await initMetrics();

      setActiveSessionCount(10);

      expect(mockUpDownCounter.add).toHaveBeenCalledTimes(1);
      expect(mockUpDownCounter.add).toHaveBeenCalledWith(10, { transport: 'mixed' });
    });

    it('records subsequent deltas correctly', async () => {
      setActiveSessionCount(15);

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(5, { transport: 'mixed' });
    });

    it('does nothing when count is unchanged', async () => {
      vi.clearAllMocks();
      setActiveSessionCount(15);

      expect(mockUpDownCounter.add).not.toHaveBeenCalled();
    });

    it('records negative delta when count decreases', async () => {
      setActiveSessionCount(10);

      expect(mockUpDownCounter.add).toHaveBeenCalledWith(-5, { transport: 'mixed' });
    });

    afterAll(async () => {
      vi.clearAllMocks();
      await shutdownMetrics();
    });
  });

  describe('recordTransportRequest', () => {
    it('is no-op when metrics are not initialized', () => {
      vi.clearAllMocks();
      recordTransportRequest({ transport: 'sse', status: 'success' });

      expect(mockCounter.add).not.toHaveBeenCalled();
    });

    it('records transport request with sse transport', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      vi.clearAllMocks();
      await shutdownMetrics();
      await initMetrics();

      recordTransportRequest({ transport: 'sse', status: 'success' });

      expect(mockCounter.add).toHaveBeenCalledWith(1, { transport: 'sse', status: 'success' });
    });

    it('records transport request with error status', async () => {
      recordTransportRequest({ transport: 'streamable-http', status: 'error' });

      expect(mockCounter.add).toHaveBeenCalledWith(1, {
        transport: 'streamable-http',
        status: 'error',
      });
    });

    afterAll(async () => {
      vi.clearAllMocks();
      await shutdownMetrics();
    });
  });

  describe('shutdownMetrics', () => {
    it('is no-op when not initialized', async () => {
      vi.clearAllMocks();
      await shutdownMetrics();

      expect(mockMeterProviderInstance.shutdown).not.toHaveBeenCalled();
    });

    it('shuts down the meter provider', async () => {
      mockEnvConfig.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';
      vi.clearAllMocks();
      await shutdownMetrics();
      await initMetrics();

      await shutdownMetrics();

      expect(mockMeterProviderInstance.shutdown).toHaveBeenCalledTimes(1);
    });

    it('resets internal state after shutdown', async () => {
      await shutdownMetrics();

      vi.clearAllMocks();
      recordToolInvocation({ toolName: 'test', status: 'success', durationMs: 100 });

      expect(mockCounter.add).not.toHaveBeenCalled();
    });
  });
});
