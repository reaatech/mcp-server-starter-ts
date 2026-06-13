# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-06-13

### Added
- `@reaatech/mcp-server-transport`: framework-agnostic Streamable HTTP core plus first-class **Fastify** support via the `fastifyStreamableHTTP` plugin (and a `mountStreamableHTTPFastify` convenience wrapper). The plugin calls `reply.hijack()` and hands the raw socket to the SDK transport so Fastify never serializes or auto-closes JSON/SSE responses.
- `@reaatech/mcp-server-transport`: exported framework-neutral handlers (`handleStreamableHTTPRequest`, `handleStreamableHTTPDelete`) for building custom adapters.

### Changed
- `@reaatech/mcp-server-transport`: refactored into a framework-agnostic core (raw Node `req`/`res` + parsed body + shared session store) with thin Express/Fastify adapters. The existing `mountStreamableHTTP(app, serverFactory)` Express API is unchanged and now delegates to the core; sessions are shared across adapters.
- `@reaatech/mcp-server-transport`: relaxed `zod` from a hard `^4.4.3` dependency to an optional peer range `^3.23 || ^4`; `express` and `fastify` are now optional peer dependencies. Consumers are no longer forced onto zod 4.

## [1.0.0] - 2026-04-18

### Added
- MCP server with StreamableHTTP and SSE transports
- Tool system with auto-discovery from `src/tools/*.tool.ts`
- Middleware pipeline (auth, rate-limit, idempotency, sanitization)
- Structured logging with Pino (request_id correlation, PII redaction)
- OpenTelemetry tracing and metrics with OTLP export
- Health check endpoints (`/health`, `/ready`, `/live`)
- Zod-validated environment configuration
- Docker multi-stage build with non-root user (<50MB)
- docker-compose for local development with Jaeger + Prometheus
- Terraform modules for GCP Cloud Run and AWS Lambda
- CI/CD with GitHub Actions (lint, test, build, docker)
- Comprehensive documentation (README, ARCHITECTURE, AGENTS, CLAUDE)
- Skill definitions for echo and health-check tools
- Unit and E2E test coverage with 80% threshold

### Security
- API key and Bearer token authentication
- Constant-time comparison to prevent timing attacks
- Token bucket rate limiting per-client
- Prompt-injection pattern sanitization
- Security headers via Helmet
- No PII in logs (automatic redaction)