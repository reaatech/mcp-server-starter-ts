# @reaatech/mcp-server-server

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-server-server.svg)](https://www.npmjs.com/package/@reaatech/mcp-server-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-server-starter-ts/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

MCP server framework built on Express 5 with a composable middleware pipeline, tool orchestration, and dual-transport support. This is the top-level package that ties together the `@reaatech/mcp-server-*` ecosystem.

## Installation

```bash
npm install @reaatech/mcp-server-server
# or
pnpm add @reaatech/mcp-server-server
```

## Feature Overview

- **Express 5 server** — Helmet security headers, CORS with configurable origins, 10 MB JSON body parsing
- **Middleware pipeline** — Auth → Rate limit → Idempotency → Sanitization, in order
- **Dual transports** — Streamable HTTP (primary) + SSE (legacy), mounted automatically
- **Tool orchestration** — Auto-discovers `.tool.ts` files, registers them, traces execution
- **Health endpoints** — `/health` (full diagnostics), `/ready` (readiness), `/live` (liveness)
- **Observability** — OpenTelemetry tracing on every tool call, Pino structured logging
- **Graceful shutdown** — SIGTERM/SIGINT handlers drain connections within a configurable timeout
- **Environment-validated** — All configuration validated at startup via Zod; fails fast on misconfiguration

## Quick Start

### Start a Server (30 seconds)

```typescript
import { startServer } from '@reaatech/mcp-server-server';

// Built-in echo and health-check tools are available
// Transport, auth, rate limiting, idempotency, and sanitization are all configured
startServer();
```

```bash
PORT=8080 pnpm dev
```

```
✅ GET  /health        → { status: "healthy", version: "1.0.0", ... }
✅ POST /mcp           → MCP messages (Streamable HTTP)
✅ GET  /mcp/sse       → SSE stream
✅ POST /mcp/messages  → SSE message handling
```

### Customize the App

```typescript
import { createApp } from '@reaatech/mcp-server-server';

const app = await createApp();

// Add custom routes, middleware, or error handlers
app.get('/custom', (req, res) => {
  res.json({ custom: true });
});

app.listen(8080);
```

## API Reference

### `createApp(): Promise<Express>`

Builds and returns a fully configured Express application.

```typescript
const app = await createApp();
app.listen(8080);
```

Steps performed:
1. Initializes OpenTelemetry (tracing + metrics)
2. Discovers and registers tools via `@reaatech/mcp-server-tools`
3. Mounts security middleware (Helmet, CORS, JSON body parsing)
4. Registers request ID generation
5. Adds health/readiness/liveness endpoints
6. Applies the middleware pipeline (auth → rate-limit → idempotency → sanitization)
7. Mounts Streamable HTTP and SSE transports
8. Adds 404 handler and centralized error handler

### `startServer(): Promise<void>`

Creates the app, listens on the configured `PORT`, and registers SIGTERM/SIGINT graceful shutdown handlers.

```typescript
startServer();
// Server listens on envConfig.PORT (default 8080)
// Graceful shutdown: drains connections within 30 seconds
```

### `createMcpServer(tools: ToolDefinition[]): McpServer`

Creates an MCP server instance with the given tools. Each tool is registered with the MCP SDK's `server.tool()` method. Tool execution is wrapped in OpenTelemetry spans and emits metrics.

```typescript
import { createMcpServer } from '@reaatech/mcp-server-server';
import { getTools } from '@reaatech/mcp-server-tools';

const server = createMcpServer(getTools());
```

### Middleware Components

Each middleware function returns an Express middleware:

```typescript
import {
  rateLimitMiddleware,
  idempotencyMiddleware,
  sanitizationMiddleware,
} from '@reaatech/mcp-server-server';

app.use(rateLimitMiddleware());
app.use(idempotencyMiddleware());
app.use(sanitizationMiddleware());
```

### Utility Functions

| Export | Returns | Description |
|--------|---------|-------------|
| `getServerVersion()` | `string` | Current server version |
| `getServerName()` | `string` | Server name (`mcp-server-starter-ts`) |
| `clearRateLimitStore()` | `void` | Clear rate limit state (for testing) |
| `clearIdempotencyCache()` | `void` | Clear idempotency cache (for testing) |
| `getIdempotencyCacheSize()` | `number` | Current cache entry count |
| `sanitizeString(input, patterns?)` | `{ sanitized, stripped }` | Sanitize a string |
| `sanitizeObject(obj, patterns)` | `{ sanitized, stripped }` | Recursively sanitize an object |

## Middleware Pipeline

| Order | Middleware | Description |
|-------|-----------|-------------|
| 1 | **Auth** | Validates API key or Bearer token. Attaches `RequestContext` to `req`. Skips in dev when no key configured. |
| 2 | **Rate Limit** | Token bucket per client (keyed by hashed API key or IP). Returns `429` with `Retry-After`. |
| 3 | **Idempotency** | Deduplicates requests with `Idempotency-Key` header. Returns cached response for duplicates within TTL. |
| 4 | **Sanitization** | Strips known prompt-injection patterns from request bodies. Logs sanitization events. |

## Configuration

All configuration is read from `@reaatech/mcp-server-core`'s validated environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `NODE_ENV` | `development` | Environment |
| `CORS_ORIGIN` | `*` | CORS allowed origin(s) |
| `API_KEY` | — | Shared secret for auth (required in production) |
| `AUTH_MODE` | `api-key` | `api-key` or `bearer` |
| `AUTH_BYPASS_IN_DEV` | `true` | Skip auth in dev when no key configured |
| `RATE_LIMIT_RPM` | `60` | Requests per minute per client |
| `IDEMPOTENCY_TTL_MS` | `300000` | Cache TTL for idempotent requests |
| `SESSION_TIMEOUT_MS` | `1800000` | Session expiry |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP collector URL |
| `OTEL_SERVICE_NAME` | `mcp-server` | Service name for OTel |
| `SANITIZATION_DENY_PATTERNS` | — | Extra patterns for sanitization |

## Health Endpoints

| Endpoint | Response | Description |
|----------|----------|-------------|
| `GET /health` | `{ status, version, environment, uptime, timestamp, checks: { readiness, liveness, memory } }` | Full diagnostics |
| `GET /ready` | `{ status: "ready" }` | Readiness probe for orchestrators |
| `GET /live` | `{ status: "alive" }` | Liveness probe for orchestrators |

## Error Handling

The server includes a centralized error handler:

- **404 responses**: `{ error: "Not Found", message: "Endpoint not found" }`
- **Unhandled errors**: `{ error: "Internal Server Error", message }` — error details are hidden in production

## Related Packages

- [`@reaatech/mcp-server-core`](https://www.npmjs.com/package/@reaatech/mcp-server-core) — Core types and configuration
- [`@reaatech/mcp-server-auth`](https://www.npmjs.com/package/@reaatech/mcp-server-auth) — Authentication middleware
- [`@reaatech/mcp-server-observability`](https://www.npmjs.com/package/@reaatech/mcp-server-observability) — Logging, tracing, metrics
- [`@reaatech/mcp-server-transport`](https://www.npmjs.com/package/@reaatech/mcp-server-transport) — Transport layer
- [`@reaatech/mcp-server-tools`](https://www.npmjs.com/package/@reaatech/mcp-server-tools) — Tool registry and built-in tools

## License

[MIT](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
