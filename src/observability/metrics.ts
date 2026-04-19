/**
 * OpenTelemetry metrics setup.
 *
 * Configures metrics collection with OTLP exporter.
 * Provides counters, histograms, and gauges for MCP operations.
 */

import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { metrics, ValueType } from '@opentelemetry/api';
import { envConfig } from '../config/env.js';
import { logger } from './logger.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../version.js';

/**
 * Meter provider instance
 */
let meterProvider: MeterProvider | undefined;

/**
 * Metric instruments
 */
import type { Counter, Histogram, UpDownCounter } from '@opentelemetry/api';

let toolInvocationsCounter: Counter | undefined;
let toolDurationHistogram: Histogram | undefined;
let activeSessionsGauge: UpDownCounter | undefined;
let errorsCounter: Counter | undefined;
let transportRequestsCounter: Counter | undefined;

/**
 * Track the last known session count for delta calculation
 */
let lastSessionCount = 0;

/**
 * Get the MCP meter
 */
function getMeter(): ReturnType<typeof metrics.getMeter> {
  return metrics.getMeter(SERVICE_NAME, SERVICE_VERSION);
}

/**
 * Initialize metrics
 */
export async function initMetrics(): Promise<void> {
  if (meterProvider) {
    return;
  }

  // Skip if no OTLP endpoint configured
  if (!envConfig.OTEL_EXPORTER_OTLP_ENDPOINT) {
    return;
  }

  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: envConfig.OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: envConfig.NODE_ENV,
  });

  const exporter = new OTLPMetricExporter({
    url: `${envConfig.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
  });

  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: 60000, // Export every minute
      }),
    ],
  });

  metrics.setGlobalMeterProvider(meterProvider);

  const meter = getMeter();

  // Tool invocations counter
  toolInvocationsCounter = meter.createCounter('mcp.tool.invocations', {
    description: 'Number of tool invocations',
    valueType: ValueType.INT,
  });

  // Tool duration histogram
  toolDurationHistogram = meter.createHistogram('mcp.tool.duration', {
    description: 'Tool execution duration in milliseconds',
    valueType: ValueType.INT,
    advice: {
      explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
    },
  });

  // Active sessions gauge (using UpDownCounter)
  activeSessionsGauge = meter.createUpDownCounter('mcp.server.active_sessions', {
    description: 'Number of active MCP sessions',
    valueType: ValueType.INT,
  });

  // Errors counter
  errorsCounter = meter.createCounter('mcp.server.errors', {
    description: 'Number of errors by type',
    valueType: ValueType.INT,
  });

  // Transport requests counter
  transportRequestsCounter = meter.createCounter('mcp.transport.requests', {
    description: 'Number of transport-level requests',
    valueType: ValueType.INT,
  });

  logger.info('OpenTelemetry metrics initialized');
}

/**
 * Record a tool invocation
 */
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

/**
 * Record an error
 */
export function recordError(params: { errorType: string; toolName?: string }): void {
  const { errorType, toolName } = params;

  if (errorsCounter) {
    errorsCounter.add(1, {
      error_type: errorType,
      ...(toolName && { tool_name: toolName }),
    });
  }
}

/**
 * Update active session count
 * Uses delta tracking since UpDownCounter only supports add/subtract
 */
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

/**
 * Record a transport-level request
 */
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

/**
 * Shutdown metrics
 */
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
