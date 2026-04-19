/**
 * OpenTelemetry tracing setup.
 *
 * Configures distributed tracing with OTLP exporter.
 * Auto-instruments Express and creates custom spans for tool calls.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { envConfig } from '../config/env.js';
import { logger } from './logger.js';
import { initMetrics } from './metrics.js';
import { SERVICE_NAME, SERVICE_VERSION } from '../version.js';

/**
 * OpenTelemetry SDK instance
 */
let sdk: NodeSDK | undefined;

/**
 * Initialize OpenTelemetry SDK
 */
export async function initObservability(): Promise<void> {
  if (sdk) {
    return;
  }

  // Skip OTel initialization if no exporter endpoint configured
  if (!envConfig.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info(
      { note: 'Set OTEL_EXPORTER_OTLP_ENDPOINT to enable tracing' },
      'OpenTelemetry tracing disabled'
    );
    return;
  }

  let resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: envConfig.OTEL_SERVICE_NAME,
    [SemanticResourceAttributes.SERVICE_VERSION]: SERVICE_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: envConfig.NODE_ENV,
  });

  // Parse additional resource attributes from env
  if (envConfig.OTEL_RESOURCE_ATTRIBUTES) {
    const attrs = envConfig.OTEL_RESOURCE_ATTRIBUTES.split(',').reduce(
      (acc, pair) => {
        const [key, value] = pair.split('=');
        if (key && value) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      },
      {} as Record<string, string>
    );
    resource = resource.merge(new Resource(attrs));
  }

  const traceExporter = new OTLPTraceExporter({
    url: `${envConfig.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource,
    spanProcessor: new BatchSpanProcessor(traceExporter),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-express': {
          requestHook: (span, info) => {
            span.setAttribute(
              'http.request_id',
              (info.request.headers['x-request-id'] as string) || 'unknown'
            );
          },
        },
      }),
    ],
  });

  try {
    await sdk.start();

    // Also initialize metrics if endpoint is configured
    await initMetrics();

    logger.info(
      {
        endpoint: envConfig.OTEL_EXPORTER_OTLP_ENDPOINT,
        service: envConfig.OTEL_SERVICE_NAME,
      },
      'OpenTelemetry tracing and metrics initialized'
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to initialize OpenTelemetry');
  }
}

/**
 * Shutdown OpenTelemetry SDK
 */
export async function shutdownObservability(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
    logger.info('OpenTelemetry SDK shut down');
  }
}

/**
 * Get tracer instance
 */
export function getTracer(): ReturnType<typeof trace.getTracer> {
  return trace.getTracer(SERVICE_NAME, SERVICE_VERSION);
}

/**
 * Execute a function within a traced span
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { kind: SpanKind.INTERNAL, attributes }, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
      span.recordException(error instanceof Error ? error : new Error(errorMessage));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Set attributes on the current active span
 */
export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }
}
