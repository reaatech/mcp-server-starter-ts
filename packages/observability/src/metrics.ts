import { ValueType, metrics } from '@opentelemetry/api';
import type { Counter, Histogram, UpDownCounter } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { envConfig } from '@reaatech/mcp-server-core';
import { SERVICE_VERSION } from '@reaatech/mcp-server-core';
import { logger } from './logger.js';

let meterProvider: MeterProvider | undefined;

let toolInvocationsCounter: Counter | undefined;
let toolDurationHistogram: Histogram | undefined;
let activeSessionsGauge: UpDownCounter | undefined;
let errorsCounter: Counter | undefined;
let transportRequestsCounter: Counter | undefined;

let lastSessionCount = 0;

function getMeter() {
  return metrics.getMeter('mcp-server', SERVICE_VERSION);
}

export async function initMetrics(): Promise<void> {
  if (meterProvider) {
    return;
  }

  if (!envConfig.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return;
  }

  const resource = new Resource({
    'service.name': envConfig.OTEL_SERVICE_NAME,
    'service.version': SERVICE_VERSION,
    'deployment.environment': envConfig.NODE_ENV,
  });

  const exporter = new OTLPMetricExporter({
    url: `${envConfig.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  });

  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: 60000,
      }),
    ],
  });

  metrics.setGlobalMeterProvider(meterProvider);

  const meter = getMeter();

  toolInvocationsCounter = meter.createCounter('mcp.tool.invocations', {
    description: 'Number of tool invocations',
    valueType: ValueType.INT,
  });

  toolDurationHistogram = meter.createHistogram('mcp.tool.duration', {
    description: 'Tool execution duration in milliseconds',
    valueType: ValueType.INT,
    advice: {
      explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    },
  });

  activeSessionsGauge = meter.createUpDownCounter('mcp.server.active_sessions', {
    description: 'Number of active MCP sessions',
    valueType: ValueType.INT,
  });

  errorsCounter = meter.createCounter('mcp.server.errors', {
    description: 'Number of errors by type',
    valueType: ValueType.INT,
  });

  transportRequestsCounter = meter.createCounter('mcp.transport.requests', {
    description: 'Number of transport-level requests',
    valueType: ValueType.INT,
  });

  logger.info('OpenTelemetry metrics initialized');
}

export function recordToolInvocation(params: {
  toolName: string;
  status: 'success' | 'error';
  durationMs: number;
}): void {
  const { toolName, status, durationMs } = params;

  if (toolInvocationsCounter) {
    toolInvocationsCounter.add(1, {
      tool_name: toolName,
      status,
    });
  }

  if (toolDurationHistogram) {
    toolDurationHistogram.record(Math.round(durationMs), {
      tool_name: toolName,
    });
  }
}

export function recordError(params: { errorType: string; toolName?: string }): void {
  const { errorType, toolName } = params;

  if (errorsCounter) {
    errorsCounter.add(1, {
      error_type: errorType,
      ...(toolName && { tool_name: toolName }),
    });
  }
}

export function setActiveSessionCount(count: number): void {
  if (activeSessionsGauge) {
    const delta = count - lastSessionCount;
    if (delta !== 0) {
      activeSessionsGauge.add(delta, {
        transport: 'mixed',
      });
      lastSessionCount = count;
    }
  }
}

export function recordTransportRequest(params: {
  transport: 'streamable-http' | 'sse';
  status: 'success' | 'error';
}): void {
  const { transport, status } = params;

  if (transportRequestsCounter) {
    transportRequestsCounter.add(1, {
      transport,
      status,
    });
  }
}

export async function shutdownMetrics(): Promise<void> {
  if (meterProvider) {
    await meterProvider.shutdown();
    meterProvider = undefined;
    toolInvocationsCounter = undefined;
    toolDurationHistogram = undefined;
    activeSessionsGauge = undefined;
    errorsCounter = undefined;
    transportRequestsCounter = undefined;
    lastSessionCount = 0;
    logger.info('Metrics provider shut down');
  }
}
