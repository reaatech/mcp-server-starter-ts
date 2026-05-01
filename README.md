# mcp-server-starter-ts

[![CI](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)](https://www.typescriptlang.org/)

> Production-grade [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server starter template in TypeScript. Built from Fortune-10 scale operational experience.

This monorepo provides core types, a server framework, pluggable middleware, observability, and transport layer — everything needed to build, secure, and operate an MCP server from day one.

## Features

- **Core types & configuration** — Zod-validated environment config, shared domain types, content block helpers
- **Server framework** — Express 5 with composable middleware pipeline (auth, rate limit, idempotency, sanitization)
- **Pluggable auth** — API key and Bearer token validation with timing-safe comparison
- **Tool system** — Type-safe `defineTool()` helper, auto-discovery of `.tool.ts` files, built-in `echo` and `health-check` tools
- **Dual transports** — Streamable HTTP (primary) + SSE (legacy) with session management and automatic cleanup
- **Observability** — Pino structured logging with PII redaction, OpenTelemetry tracing, Prometheus-compatible metrics
- **Security middleware** — Rate limiting (token bucket), request idempotency, prompt-injection input sanitization

## Installation

### Using the packages

Packages are published under the `@reaatech` scope and can be installed individually:

```bash
# Server framework (includes all middleware and transports)
pnpm add @reaatech/mcp-server-server

# Core types and configuration
pnpm add @reaatech/mcp-server-core

# Authentication middleware (standalone)
pnpm add @reaatech/mcp-server-auth

# Tool registry and built-in tools
pnpm add @reaatech/mcp-server-tools

# Observability (logging, tracing, metrics)
pnpm add @reaatech/mcp-server-observability

# Transport layer (standalone)
pnpm add @reaatech/mcp-server-transport
```

### Contributing

```bash
# Clone the repository
git clone https://github.com/reaatech/mcp-server-starter-ts.git
cd mcp-server-starter-ts

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run the test suite
pnpm test

# Run linting
pnpm lint
```

## Quick Start

Create a minimal MCP server with built-in tools in under 10 lines:

```typescript
import { startServer } from '@reaatech/mcp-server-server';

// Built-in echo and health-check tools are available
// Auth, rate limiting, idempotency, and sanitization are configured
// Streamable HTTP and SSE transports are mounted
startServer();
```

```bash
PORT=8080 pnpm dev
```

See the [`examples/01-basic-server/`](./examples/01-basic-server/) for the complete working example.

## Packages

| Package | Description |
| ------- | ----------- |
| [`@reaatech/mcp-server-core`](./packages/core) | Core types, Zod schemas, configuration, and version utilities |
| [`@reaatech/mcp-server-auth`](./packages/auth) | Pluggable authentication middleware |
| [`@reaatech/mcp-server-observability`](./packages/observability) | Structured logging, OpenTelemetry tracing, and metrics |
| [`@reaatech/mcp-server-transport`](./packages/transport) | MCP transport implementations (Streamable HTTP, SSE) |
| [`@reaatech/mcp-server-tools`](./packages/tools) | Tool registry, discovery, and built-in tools |
| [`@reaatech/mcp-server-server`](./packages/server) | MCP server framework (Express, middleware pipeline) |

## Tool Authoring

```typescript
import { defineTool } from '@reaatech/mcp-server-tools';
import { z } from 'zod';
import { textContent } from '@reaatech/mcp-server-core';

export default defineTool({
  name: 'my-tool',
  description: 'Does something useful for the LLM',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
  }),
  handler: async ({ query }, context) => {
    return {
      content: [textContent(`Results for: ${query}`)],
    };
  },
});
```

Tools are auto-discovered from `.tool.ts` files at startup via `@reaatech/mcp-server-tools`.

## Deployment

### Docker

```bash
docker build -t my-mcp-server .
docker run -p 8080:8080 -e API_KEY=your-key my-mcp-server
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | Server port |
| `NODE_ENV` | No | `development` | Environment |
| `API_KEY` | Yes (prod) | — | Auth key |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins |
| `AUTH_MODE` | No | `api-key` | `api-key` or `bearer` |
| `AUTH_BYPASS_IN_DEV` | No | `true` | Skip auth in dev when no key |
| `RATE_LIMIT_RPM` | No | `60` | Requests per minute per client |
| `IDEMPOTENCY_TTL_MS` | No | `300000` | Idempotency cache TTL (5 min) |
| `SESSION_TIMEOUT_MS` | No | `1800000` | MCP session expiry (30 min) |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | — | OpenTelemetry collector URL |
| `OTEL_SERVICE_NAME` | No | `mcp-server` | Service name in traces |
| `OTEL_RESOURCE_ATTRIBUTES` | No | — | Additional attributes (`key=value,...`) |
| `SANITIZATION_DENY_PATTERNS` | No | — | Extra sanitization patterns |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — System design, package relationships, and data flows
- [`AGENTS.md`](./AGENTS.md) — Coding conventions and development guidelines
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — Contribution workflow and release process
- [`docs/`](./docs/) — Deep dives on deployment, observability, security, and tool authoring

## License

[MIT](LICENSE)
