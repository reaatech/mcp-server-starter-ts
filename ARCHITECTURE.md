# ARCHITECTURE.md — mcp-server-starter-ts

> System-level design for the MCP server starter template.

## Overview

This monorepo provides a composable MCP server framework in TypeScript with pluggable authentication, rate limiting, idempotency, input sanitization, dual transports, and full observability — all split into independent, publishable packages.

## Package Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                      MCP Server                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Express    │  │  Middleware  │  │   Tool Registry     │ │
│  │  App +     │  │  Pipeline   │  │   (auto-discovery)  │ │
│  │  Transports │  │              │  │                     │ │
│  └──────┬──────┘  └──────┬───────┘  └──────────┬──────────┘ │
└─────────┼────────────────┼──────────────────────┼───────────┘
          │                │                      │
          └────────────────┼──────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────────┐
    │   Auth   │    │  Transport│   │ Observability │
    └────┬─────┘    └────┬─────┘    └──────┬───────┘
         │               │                │
         └───────────────┼────────────────┘
                         ▼
                   ┌──────────┐
                   │   Core   │
                   │ (types,  │
                   │  config, │
                   │  version)│
                   └──────────┘
```

### Dependency Graph

```
tools ──► core, observability
transport ──► core, observability
auth ──► core
observability ──► core
server ──► core, auth, observability, transport, tools
```

`core` is the foundation — every package depends on it. `server` is the top-level package that ties everything together.

## Data Flow

### Tool Invocation (Streamable HTTP)

```
Client ──POST /mcp──► Express App ──► Auth ──► Rate Limit ──► Idempotency ──► Sanitization
                                         │                    │
                                         ▼                    ▼
                                   401 on failure      Cache hit: return
                                                       cached response
                                                              │
                                                              ▼
                                           MCP Server ──► Tool Registry
                                                              │
                                                              ▼
                                                         Tool Handler
                                                         (withSpan + metrics)
                                                              │
                                                              ▼
                                                       JSON-RPC Response
```

### Tool Invocation (SSE)

```
Client ──GET /mcp/sse──► Server ──► SSEServerTransport
                            │
                            └──► POST /mcp/messages?sessionId=X ──► Tool Handler
                                                                       │
                                                                       └──► SSE stream: content
```

### Middleware Pipeline

```
Request
  │
  ├──► Auth Middleware        (packages/auth)
  │      Validates x-api-key or Authorization: Bearer
  │      Attaches RequestContext to req
  │      Returns 401 on failure
  │
  ├──► Rate Limit Middleware  (packages/server)
  │      Token bucket per client (hashed API key or IP)
  │      Returns 429 with Retry-After on breach
  │
  ├──► Idempotency Middleware (packages/server)
  │      Checks Idempotency-Key header
  │      Returns cached response for duplicates within TTL
  │      Caches new responses for future deduplication
  │
  ├──► Sanitization Middleware (packages/server)
  │      Strips prompt-injection patterns from string inputs
  │      Logs sanitization events without raw input content
  │
  └──► Tool Handler
```

## Technology Choices

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript 5.8+ | Type safety, ESM + CJS dual output |
| Package Manager | pnpm 10 | Workspace monorepo, fast, disk-efficient |
| Build | tsup + Turborepo | Fast ESM/CJS compilation, dependency-aware orchestration |
| Lint/Format | Biome | Single tool, fast, no plugin config |
| Testing | Vitest | Fast, Jest-compatible, native ESM |
| HTTP Server | Express 5 | Enterprise standard, middleware ecosystem |
| Validation | Zod 3 | Runtime schema validation, type inference |
| Logging | Pino 9 | Structured JSON, fast, PII redaction |
| Tracing | OpenTelemetry | Industry standard, backend-agnostic |
| Auth | crypto.timingSafeEqual | Timing-attack-resistant comparison |
| Versioning | Changesets | Multi-package versioning, auto-CHANGELOG |
| CI | GitHub Actions + Turbo | Cached builds, matrix testing, provenance |

## Design Principles

### 1. Composition over Monolith

Each concern lives in its own package with a single responsibility. `server` composes them into a working application. Consumers can pick individual packages for their own use cases.

### 2. Fail Fast

Environment configuration is validated at startup with Zod. Missing required variables cause an immediate crash with a clear error message — no silent defaults in production.

### 3. Observability First

Every tool call is wrapped in an OpenTelemetry span. Metrics are recorded automatically. Structured logs include request correlation IDs. This is not bolted on — it's built into the framework.

### 4. Defense in Depth

Security is applied in layers: transport encryption (expected in deployment) → authentication → rate limiting → request deduplication → input sanitization → schema validation.

### 5. Convention over Configuration

Tools follow the `*.tool.ts` naming convention and are auto-discovered. The middleware pipeline has a documented, fixed order. Package structure follows the `@reaatech/mcp-server-{concern}` naming convention.

## Extension Points

- **Custom tools** — Add `packages/tools/src/my-tool.tool.ts` with `defineTool()`; auto-discovered at startup
- **Custom auth** — Implement your own Express middleware; plug in before `createApp()` or replace `authMiddleware`
- **Custom middleware** — Add Express middleware in the pipeline via `createApp()` customization
- **New transports** — Implement transport mounting functions following the `mountStreamableHTTP` pattern
- **New packages** — Add to `packages/` with the standard template; depends on `core` for shared types

## Deployment Architecture

The application is a single Express server. All packages are bundled at build time — there are no runtime dependencies between packages beyond what `npm install` resolves.

```
┌──────────────────────────────────────┐
│            Docker Container           │
│  ┌────────────────────────────────┐  │
│  │     examples/01-basic-server   │  │
│  │  ┌──────────────────────────┐  │  │
│  │  │  @reaatech/mcp-server-*  │  │  │
│  │  │  (all packages composed)  │  │  │
│  │  └──────────────────────────┘  │  │
│  └────────────────────────────────┘  │
│                                       │
│  PORT=8080                            │
│  OTEL_EXPORTER_OTLP_ENDPOINT=...      │
└──────────────────────────────────────┘
```

Multi-stage Docker builds (see `docker/Dockerfile`) and Terraform modules for AWS Lambda and GCP Cloud Run (see `infra/`) are provided.
