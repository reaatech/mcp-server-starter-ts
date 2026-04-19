# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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