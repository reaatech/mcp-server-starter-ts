# @reaatech/mcp-server-observability

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-server-observability.svg)](https://www.npmjs.com/package/@reaatech/mcp-server-observability)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-server-starter-ts/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Structured logging, OpenTelemetry tracing, and metrics for MCP servers. Provides a Pino-based logger with PII redaction, OpenTelemetry SDK initialization with OTLP export, and Prometheus-compatible metric instruments.

## Installation

```bash
npm install @reaatech/mcp-server-observability
# or
pnpm add @reaatech/mcp-server-observability
```

## Feature Overview

- **Structured logging** — Pino-powered with PII redaction and request ID correlation
- **Automatic pretty-printing** — Human-readable output in development, raw JSON in production
- **Distributed tracing** — OpenTelemetry SDK with OTLP export and Express auto-instrumentation
- **Metrics** — Counters, histograms, and gauges for tool invocations, errors, sessions, and transport
- **Span helpers** — `withSpan()` wraps async operations in traced spans
- **Shutdown hooks** — Graceful teardown of tracing and metrics providers

## Quick Start

```typescript
import {
  logger,
  initObservability,
  withSpan,
  recordToolInvocation,
} from '@reaatech/mcp-server-observability';

// Initialize OpenTelemetry tracing and metrics (no-op if OTEL_EXPORTER_OTLP_ENDPOINT not set)
await initObservability();

// Execute with tracing
const result = await withSpan('my-operation', async () => {
  // ... business logic
  return data;
});

// Record a tool invocation
recordToolInvocation({
  toolName: 'my-tool',
  status: 'success',
  durationMs: 42,
});
```

## API Reference

### Logger

```typescript
import { logger, createRequestLogger, logToolExecution, logMiddlewareEvent, safeLog } from '@reaatech/mcp-server-observability';
```

| Export | Description |
|--------|-------------|
| `logger` | Base Pino logger instance (pre-configured with redaction) |
| `createRequestLogger(context, fields?)` | Returns a child logger with `request_id` and `session_id` bound |
| `logToolExecution({ toolName, action, durationMs, success, error?, context })` | Standardized tool execution event |
| `logMiddlewareEvent({ middleware, action, success, details?, context? })` | Standardized middleware event |
| `safeLog({ event, userId?, ...rest })` | Logs event with user ID hashed for PII safety |

#### Logger Behavior

- **Development** (`NODE_ENV !== 'production'`): enables `pino-pretty` with colorized output
- **Production** (`NODE_ENV === 'production'`): raw JSON output for log aggregators
- **Redaction**: Automatically redacts `apiKey`, `password`, `secret`, `token`, `authorization`, `x-api-key`, `email`, `phone`, `ssn`, `creditCard` from log payloads

#### Usage Patterns

```typescript
// Structured context
logger.info({ taskId: 'task-123', state: 'working' }, 'Task state changed');

// Error logging
try {
  await riskyOperation();
} catch (err) {
  logger.error({ err }, 'Operation failed');
}

// Request-scoped logging
const reqLogger = createRequestLogger(context);
reqLogger.info('Processing request');
```

### Tracing

```typescript
import { initObservability, shutdownObservability, getTracer, withSpan, setSpanAttributes } from '@reaatech/mcp-server-observability';
```

| Export | Description |
|--------|-------------|
| `initObservability()` | Initialize the OpenTelemetry SDK (tracing + metrics). No-op if `OTEL_EXPORTER_OTLP_ENDPOINT` is not set. |
| `shutdownObservability()` | Gracefully shut down the SDK, flushing pending spans |
| `getTracer()` | Returns an OpenTelemetry tracer instance |
| `withSpan(name, fn, attributes?)` | Execute `fn` within a traced span. On error, marks span as failed and records the exception. |
| `setSpanAttributes(attributes)` | Set key-value attributes on the currently active span |

#### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP collector URL (set to enable tracing) |
| `OTEL_SERVICE_NAME` | `mcp-server` | Service name in traces |
| `OTEL_RESOURCE_ATTRIBUTES` | — | Comma-separated `key=value` pairs (e.g. `team=ai,region=us-east-1`) |

### Metrics

```typescript
import { initMetrics, recordToolInvocation, recordError, setActiveSessionCount, recordTransportRequest, shutdownMetrics } from '@reaatech/mcp-server-observability';
```

| Export | Description |
|--------|-------------|
| `initMetrics()` | Initialize OTLP metric exporter. Called automatically by `initObservability()`. |
| `recordToolInvocation({ toolName, status, durationMs })` | Increment tool invocation counter + record duration histogram |
| `recordError({ errorType, toolName? })` | Increment error counter by type and optional tool name |
| `setActiveSessionCount(count)` | Update active session gauge (delta-based) |
| `recordTransportRequest({ transport, status })` | Increment transport request counter |
| `shutdownMetrics()` | Shut down the metrics provider |

#### Metric Instruments

| Instrument | Type | Description |
|------------|------|-------------|
| `mcp.tool.invocations` | Counter | Tool invocations by tool name and status |
| `mcp.tool.duration` | Histogram | Tool execution duration in ms |
| `mcp.server.active_sessions` | UpDownCounter | Active MCP sessions by transport |
| `mcp.server.errors` | Counter | Errors by type and tool name |
| `mcp.transport.requests` | Counter | Transport requests by transport and status |

## Integration with the Server

The `@reaatech/mcp-server-engine` package calls `initObservability()` at startup when you use `createApp()` or `startServer()`:

```typescript
import { startServer } from '@reaatech/mcp-server-engine';

// Tracing and metrics initialize automatically
startServer();
```

Tool executions triggered through the server automatically emit spans and record metrics.

## Related Packages

- [`@reaatech/mcp-server-core`](https://www.npmjs.com/package/@reaatech/mcp-server-core) — Configuration and types
- [`@reaatech/mcp-server-engine`](https://www.npmjs.com/package/@reaatech/mcp-server-engine) — MCP server framework
- [`@reaatech/mcp-server-tools`](https://www.npmjs.com/package/@reaatech/mcp-server-tools) — Tool registry (emits spans and metrics)

## License

[MIT](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
