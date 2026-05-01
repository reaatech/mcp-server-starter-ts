import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { envConfig } from '@reaatech/mcp-server-core';
import { SERVICE_VERSION } from '@reaatech/mcp-server-core';
import { logger } from './logger.js';
import { initMetrics } from './metrics.js';

let sdk: NodeSDK | undefined;

export async function initObservability(): Promise<void> {
  if (sdk) {
    return;
  }

  if (!envConfig.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info(
      { note: 'Set OTEL_EXPORTER_OTLP_ENDPOINT to enable tracing' },
      'OpenTelemetry tracing disabled',
    );
    return;
  }

  let resource = new Resource({
    'service.name': envConfig.OTEL_SERVICE_NAME,
    'service.version': SERVICE_VERSION,
    'deployment.environment': envConfig.NODE_ENV,
  });

  if (envConfig.OTEL_RESOURCE_ATTRIBUTES) {
    const attrs = envConfig.OTEL_RESOURCE_ATTRIBUTES.split(',').reduce(
      (acc, pair) => {
        const [key, value] = pair.split('=');
        if (key && value) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      },
      {} as Record<string, string>,
    );
    resource = resource.merge(new Resource(attrs));
  }

  const traceExporter = new OTLPTraceExporter({
    url: `${envConfig.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-express': {
          requestHook: (span, info) => {
            span.setAttribute(
              'http.request_id',
              (info.request.headers['x-request-id'] as string) || 'unknown',
            );
          },
        },
      }),
    ],
  });

  try {
    await sdk.start();
    await initMetrics();

    logger.info(
      {
        endpoint: envConfig.OTEL_EXPORTER_OTLP_ENDPOINT,
        service: envConfig.OTEL_SERVICE_NAME,
      },
      'OpenTelemetry tracing and metrics initialized',
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage }, 'Failed to initialize OpenTelemetry');
  }
}

export async function shutdownObservability(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = undefined;
    logger.info('OpenTelemetry SDK shut down');
  }
}

export function getTracer() {
  return trace.getTracer('mcp-server', SERVICE_VERSION);
}

export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
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

export function setSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const span = trace.getActiveSpan();
  if (span) {
    for (const [key, value] of Object.entries(attributes)) {
      span.setAttribute(key, value);
    }
  }
}
