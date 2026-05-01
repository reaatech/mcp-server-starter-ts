# @reaatech/mcp-server-core

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-server-core.svg)](https://www.npmjs.com/package/@reaatech/mcp-server-core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-server-starter-ts/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Core MCP types, Zod schemas, configuration, and version utilities. This package is the single source of truth for all domain types used throughout the `@reaatech/mcp-server-*` ecosystem.

## Installation

```bash
npm install @reaatech/mcp-server-core
# or
pnpm add @reaatech/mcp-server-core
```

## Feature Overview

- **Runtime schema validation** — Zod schemas for all external-facing data shapes
- **Environment configuration** — Validated, cached environment variables with fail-fast semantics
- **Shared domain types** — `ToolResponse`, `ContentBlock`, `RequestContext`, `ToolContext`, and more
- **Content block helpers** — `textContent()` and `errorResponse()` factories
- **Version management** — Centralized `APP_VERSION`, `SERVICE_NAME`, and `SERVER_INFO`
- **Dual ESM/CJS output** — works with `import` and `require`

## Quick Start

```typescript
import {
  textContent,
  errorResponse,
  envConfig,
  isProduction,
  APP_VERSION,
  SERVER_INFO,
} from '@reaatech/mcp-server-core';

// Create a text content block
const content = textContent('Hello, world!');

// Create an error response
const response = errorResponse('Something went wrong');

// Access validated environment config (cached, validated at startup)
const port = envConfig.PORT;
const logLevel = envConfig.LOG_LEVEL;

// Check the environment
if (isProduction()) {
  // ...
}
```

## API Reference

### Content Blocks

| Export | Description |
|--------|-------------|
| `TextContentSchema` | `{ type: "text", text: string }` |
| `ImageContentSchema` | `{ type: "image", data: string, mimeType: string }` |
| `ResourceContentSchema` | `{ type: "resource", uri: string, mimeType?, text?, blob? }` |
| `ContentBlockSchema` / `ContentBlock` | Union of all content block types |
| `textContent(text)` | Factory: `{ type: "text", text }` |
| `errorResponse(message)` | Factory: `{ content: [...], isError: true }` |

### Tool Response

| Export | Description |
|--------|-------------|
| `ToolResponseSchema` / `ToolResponse` | `{ content: ContentBlock[], isError?: boolean }` |

### Request & Session Types

| Export | Description |
|--------|-------------|
| `RequestContext` | `requestId`, `sessionId?`, `idempotencyKey?`, `apiKey?`, `ipAddress?` |
| `ToolContext` | `{ request: RequestContext, session?: SessionData }` |
| `SessionData` | `{ id, createdAt, lastAccessedAt, metadata? }` |
| `RateLimitState` | `{ tokens: number, lastRefill: number }` |
| `IdempotencyEntry` | `{ key, response, statusCode, createdAt, ttl }` |

### Health Status

| Export | Description |
|--------|-------------|
| `HealthStatusSchema` / `HealthStatus` | `{ status: "healthy" \| "unhealthy", version, environment, uptime, timestamp }` |

### Environment Configuration

```typescript
import { getEnvConfig, resetEnvConfigCache, envConfig, isProduction, isDevelopment, isTest } from '@reaatech/mcp-server-core';
```

| Export | Description |
|--------|-------------|
| `getEnvConfig()` | Parse and validate `process.env`, returns cached `EnvConfig` |
| `envConfig` | Proxy accessor — lazy-loads on access, caches result |
| `resetEnvConfigCache()` | Clear cache (for tests that mutate `process.env`) |
| `isProduction()` | `envConfig.NODE_ENV === 'production'` |
| `isDevelopment()` | `envConfig.NODE_ENV === 'development'` |
| `isTest()` | `envConfig.NODE_ENV === 'test'` |

#### `EnvConfig` Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `PORT` | `number` | `8080` | Server port |
| `NODE_ENV` | `'development' \| 'production' \| 'test'` | `'development'` | Environment |
| `CORS_ORIGIN` | `string` | `'*'` | CORS allowed origins |
| `API_KEY` | `string \| undefined` | — | Shared secret for auth |
| `AUTH_MODE` | `'api-key' \| 'bearer'` | `'api-key'` | Authentication mode |
| `AUTH_BYPASS_IN_DEV` | `boolean` | `true` | Bypass auth in dev when no key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `string \| undefined` | — | OTLP collector URL |
| `OTEL_SERVICE_NAME` | `string` | `'mcp-server'` | Service name for OTel |
| `OTEL_RESOURCE_ATTRIBUTES` | `string \| undefined` | — | Additional OTel attributes |
| `IDEMPOTENCY_TTL_MS` | `number` | `300000` | Idempotency cache TTL |
| `RATE_LIMIT_RPM` | `number` | `60` | Rate limit per minute |
| `LOG_LEVEL` | `'debug' \| 'info' \| 'warn' \| 'error'` | `'info'` | Log level |
| `SESSION_TIMEOUT_MS` | `number` | `1800000` | Session expiry ms |
| `SANITIZATION_DENY_PATTERNS` | `string \| undefined` | — | Extra deny patterns |

### Version Constants

```typescript
import { APP_VERSION, SERVICE_NAME, SERVICE_VERSION, SERVER_INFO } from '@reaatech/mcp-server-core';
```

| Export | Description |
|--------|-------------|
| `APP_VERSION` | Current application version |
| `SERVICE_NAME` | `'mcp-server-starter-ts'` |
| `SERVICE_VERSION` | Same as `APP_VERSION` |
| `SERVER_INFO` | `{ name: SERVICE_NAME, version: APP_VERSION }` |

## Usage Pattern

Every schema export has a matching type export. Use the Zod schema for runtime validation and the inferred type for compile-time checking:

```typescript
import { ToolResponseSchema, type ToolResponse } from '@reaatech/mcp-server-core';

function handleResponse(raw: unknown): ToolResponse {
  return ToolResponseSchema.parse(raw);
}
```

## Related Packages

- [`@reaatech/mcp-server-engine`](https://www.npmjs.com/package/@reaatech/mcp-server-engine) — MCP server framework
- [`@reaatech/mcp-server-tools`](https://www.npmjs.com/package/@reaatech/mcp-server-tools) — Tool registry and built-in tools
- [`@reaatech/mcp-server-auth`](https://www.npmjs.com/package/@reaatech/mcp-server-auth) — Authentication middleware
- [`@reaatech/mcp-server-observability`](https://www.npmjs.com/package/@reaatech/mcp-server-observability) — Logging, tracing, metrics
- [`@reaatech/mcp-server-transport`](https://www.npmjs.com/package/@reaatech/mcp-server-transport) — Transport layer

## License

[MIT](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
