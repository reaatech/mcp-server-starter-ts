# Observability Guide

This guide covers the observability features of `mcp-server-starter-ts`.

## Overview

The server includes three pillars of observability:

1. **Logging** — Structured JSON logs via Pino
2. **Tracing** — Distributed traces via OpenTelemetry
3. **Metrics** — Counters, histograms, and gauges via OpenTelemetry

## Local Development

### Start Observability Stack

```bash
docker compose up
```

This starts:
- **MCP Server** — `http://localhost:8080`
- **Jaeger UI** — `http://localhost:16686` (traces)
- **Prometheus** — `http://localhost:9090` (metrics)

### View Traces

1. Open Jaeger UI at `http://localhost:16686`
2. Select service: `mcp-server`
3. Click "Find Traces"

Each tool invocation creates a span with:
- Tool name
- Input/output sizes
- Duration
- Error status (if applicable)

### Query Metrics

```bash
# Get tool invocation counts
curl 'http://localhost:9090/api/v1/query?query=mcp_tool_invocations'

# Get tool duration histogram
curl 'http://localhost:9090/api/v1/query?query=mcp_tool_duration'
```

## Production Setup

### Configure OTLP Exporter

Set the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com:4318
export OTEL_SERVICE_NAME=my-mcp-server
```

### Supported Backends

The OTLP exporter works with:

| Backend | Configuration |
|---------|--------------|
| Datadog | `OTEL_EXPORTER_OTLP_ENDPOINT=https://api.datadoghq.com` |
| Grafana Tempo | Native OTLP support |
| Jaeger | Native OTLP support |
| New Relic | `OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp.nr-data.net` |
| Honeycomb | `OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io` |

### Cloud-Specific Setup

#### GCP Cloud Run

Use the OTel Collector sidecar pattern:

```yaml
# In your Cloud Run deployment
env:
  - name: OTEL_EXPORTER_OTLP_ENDPOINT
    value: "http://localhost:4318"
```

Deploy the OTel Collector as a separate Cloud Run service or use Cloud Monitoring's built-in OTLP ingestion.

#### AWS Lambda

Use the AWS Distro for OpenTelemetry (ADOT) Lambda layer or export to AWS X-Ray:

```bash
export OTEL_TRACES_EXPORTER=xray
export OTEL_METRICS_EXPORTER=otlp
export OTEL_RESOURCE_ATTRIBUTES=service.name=mcp-server
```

## Structured Logging

### Log Format

All logs are JSON with these standard fields:

```json
{
  "level": "info",
  "time": "2024-01-01T00:00:00.000Z",
  "hostname": "server-1",
  "pid": 12345,
  "service": "mcp-server",
  "request_id": "req-abc123",
  "session_id": "sess-xyz789",
  "msg": "Tool execution completed"
}
```

### Adding Context

```typescript
import { logger } from '../observability/logger.js';

logger.info(
  { tool: 'echo', durationMs: 42, inputSize: 100 },
  'Tool execution completed'
);
```

### Log Levels

| Level | Use Case |
|-------|----------|
| `error` | Unrecoverable errors, exceptions |
| `warn` | Recoverable errors, degraded functionality |
| `info` | Important business events |
| `debug` | Detailed diagnostic information |

### Configure Log Level

```bash
export LOG_LEVEL=debug
```

## Metrics Reference

### Tool Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `mcp.tool.invocations` | Counter | `tool`, `status` | Total tool invocations |
| `mcp.tool.duration` | Histogram | `tool` | Tool execution duration (P50/P90/P99) |

### Server Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `mcp.server.active_sessions` | Gauge | — | Current active sessions |
| `mcp.server.errors` | Counter | `error_type` | Total errors by type |
| `mcp.transport.requests` | Counter | `transport`, `status` | Transport-level requests |

### Custom Metrics

Add custom metrics via the metrics module:

```typescript
import { metrics } from '@opentelemetry/api';

const customCounter = metrics.getMeter('mcp-server').createCounter('custom.events');
customCounter.add(1, { event_type: 'user_action' });
```

## Tracing

### Span Structure

Each tool call creates a span with:

- **Name**: `tool.{tool_name}`
- **Attributes**: `tool.name`, `tool.input.size`, `tool.output.size`
- **Events**: Input validation, execution start/end
- **Status**: `OK` or `ERROR` with description

### Trace Context Propagation

The server propagates trace context via:

- `traceparent` header (W3C Trace Context)
- `X-Request-Id` header (for correlation)

### Sampling

Configure sampling rate:

```bash
export OTEL_TRACES_SAMPLER=parentbased_traceidratio
export OTEL_TRACES_SAMPLER_ARG=0.1  # 10% sampling
```

## Alerts & Dashboards

### Recommended Alerts

1. **High Error Rate**: `rate(mcp.server.errors[5m]) > 0.1`
2. **High Latency**: `histogram_quantile(0.99, mcp.tool_duration) > 5000`
3. **Low Throughput**: `rate(mcp.tool_invocations[5m]) < 1`

### Dashboard Panels

- Tool invocation rate by tool
- P50/P90/P99 latency by tool
- Error rate over time
- Active sessions gauge
- Request volume by transport
