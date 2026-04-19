# mcp-server-starter-ts — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                  │
│  │  MCP Client │    │  AI Agent   │    │  CLI Tool   │                  │
│  │  (Claude)   │    │  (Orchestrator)  │           │                  │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                  │
│         │                   │                   │                         │
│         └───────────────────┼───────────────────┘                         │
│                             │ HTTP/HTTPS                                   │
└─────────────────────────────┼─────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Transport Layer                                │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────┐   │
│  │     StreamableHTTP (Primary)    │  │    SSE (Legacy Compat)      │   │
│  │       POST /mcp                 │  │  GET /mcp/sse               │   │
│  │       DELETE /mcp               │  │  POST /mcp/messages         │   │
│  └────────────────┬────────────────┘  └──────────────┬──────────────┘   │
│                   │                                    │                 │
│                   └────────────────┬───────────────────┘                 │
│                                    ▼                                     │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Middleware Pipeline                              │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐    ┌──────────┐  │
│  │   Auth   │───▶│  Rate Limit  │───▶│  Idempotency  │───▶│Sanitization│ │
│  │Middleware│    │  Middleware  │    │  Middleware   │    │Middleware│  │
│  └──────────┘    └──────────────┘    └───────────────┘    └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Server Core                                │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Tool Registry (Auto-discovery)                 │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │   │
│  │  │ echo.tool  │  │ *.tool.ts  │  │ *.tool.ts  │  │ *.tool.ts  │  │   │
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Cross-Cutting Concerns                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │   Observability  │  │     Config       │  │      Types       │       │
│  │  - Tracing (OTel)│  │  - Zod validated │  │  - Shared types  │       │
│  │  - Metrics (OTel)│  │  - Env vars      │  │  - Zod schemas   │       │
│  │  - Logging (pino)│  │  - Fail-fast     │  │  - Domain models │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Stateless by Design
- No in-memory state shared across requests
- Idempotency cache is the only exception (TTL-bounded, can be swapped for Redis)
- Enables horizontal scaling on Cloud Run / Lambda

### 2. Zero-Trust Security
- All inputs validated with Zod schemas
- Prompt-injection sanitization on all string inputs
- API key or Bearer token required in production
- No PII in logs (automatic redaction)

### 3. Observability First
- Every request has a `request_id` for tracing
- OpenTelemetry spans for every tool call
- Structured JSON logging (pino)
- Metrics for SLO monitoring (latency, error rate, throughput)

### 4. Convention over Configuration
- Tools auto-discovered from `src/tools/*.tool.ts`
- No manual registration needed
- Consistent file naming: `*.tool.ts` for tools, `*.tool.test.ts` for tests

### 5. Fail Fast
- Environment validation at startup
- Missing required vars = immediate crash (no silent defaults)
- TypeScript strict mode enforced

---

## Component Deep Dive

### Transport Layer

| Transport | Protocol | Endpoint | Use Case |
|-----------|----------|----------|----------|
| StreamableHTTP | HTTP request/response | `POST /mcp` | Primary — all modern MCP clients |
| SSE (legacy) | Server-Sent Events | `GET /mcp/sse` + `POST /mcp/messages` | Backwards compatibility |

**Design Decision:** Both transports mounted on the same Express server and share the same MCP server instance. This avoids code duplication and ensures consistent behavior.

**Session Management:** StreamableHTTP uses `Mcp-Session-Id` headers for session tracking. Sessions are in-memory with configurable timeout. For production multi-instance deployments, sessions should be externalized (Redis).

### Middleware Pipeline

```
Request → Auth → Rate Limit → Idempotency → Sanitization → Tool Handler → Response
              │            │             │              │
              ▼            ▼             ▼              ▼
         401/403       429 Too      Cached         Sanitized
         on failure    Many         Response       Inputs
```

1. **Auth Middleware** — Validates `x-api-key` or `Authorization: Bearer` header
2. **Rate Limit Middleware** — Token bucket algorithm, per-client (keyed by API key or IP)
3. **Idempotency Middleware** — Deduplicates requests with same `Idempotency-Key` header
4. **Sanitization Middleware** — Strips prompt-injection patterns from string inputs

**Design Decision:** Middleware is applied in this specific order because:
- Auth first to reject unauthorized requests early
- Rate limit before expensive operations
- Idempotency before sanitization to ensure consistent cache keys
- Sanitization last before tool execution

### Tool System

Tools follow a strict convention:

```typescript
// src/tools/example.tool.ts
import { z } from 'zod';
import { defineTool } from './index.js';

export default defineTool({
  name: 'example',
  description: 'Example tool demonstrating the pattern',
  inputSchema: z.object({
    input: z.string().describe('Description for the LLM'),
  }),
  handler: async ({ input }, context) => {
    // context includes: request_id, idempotencyKey, session_id
    return { content: [{ type: 'text', text: `Echo: ${input}` }] };
  },
});
```

**Auto-discovery mechanism:**
1. At startup, `src/tools/index.ts` globs all `*.tool.ts` files
2. Each tool is imported and registered with the MCP server
3. No manual registration required

**Design Decision:** Tools are isolated modules that cannot import from each other. Shared logic goes in `src/utils/`. This prevents circular dependencies and makes tools independently testable.

### Observability

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Tracing      │     │     Metrics     │     │     Logging     │
│                 │     │                 │     │                 │
│ - Span per      │     │ - tool_calls    │     │ - Structured    │
│   tool call     │     │   (counter)     │     │   JSON (pino)   │
│                 │     │                 │     │                 │
│ - OTLP exporter │     │ - duration_ms   │     │ - request_id    │
│                 │     │   (histogram)   │     │   on every line │
│                 │     │                 │     │                 │
│                 │     │ - error_rate    │     │ - PII redacted  │
│                 │     │   (counter)     │     │   automatically │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Design Decision:** OpenTelemetry is used for tracing and metrics because it's the industry standard and supports any backend (Datadog, Grafana, Jaeger, etc.). Pino is used for logging because it's fast and supports structured JSON out of the box.

### Configuration

All configuration via environment variables, validated with Zod at startup:

```typescript
// src/config/env.ts
const envSchema = z.object({
  PORT: z.string().default('8080'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_KEY: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('mcp-server'),
  IDEMPOTENCY_TTL_MS: z.string().transform(Number).default('300000'),
  RATE_LIMIT_RPM: z.string().transform(Number).default('60'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
```

**Design Decision:** Fail-fast on missing required variables. Better to crash at startup than have subtle runtime failures.

---

## Security Model

### Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Network                                                     │
│ - HTTPS required in production                                       │
│ - API key / Bearer token validation                                  │
│ - Rate limiting per client                                           │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: Input                                                       │
│ - Zod schema validation on all tool inputs                           │
│ - Prompt-injection pattern sanitization                              │
│ - Size limits on request bodies                                      │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Processing                                                  │
│ - Tools run with minimal permissions                                 │
│ - No shell execution                                                 │
│ - Timeouts on all async operations                                   │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Output                                                      │
│ - PII redaction in logs                                              │
│ - Structured error responses (no stack traces to clients)            │
│ - Audit logging for sensitive operations                             │
└─────────────────────────────────────────────────────────────────────┘
```

### Prompt-Injection Defense

The sanitization middleware strips known injection patterns:

```typescript
const INJECTION_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  // ... more patterns
];
```

**Limitation:** This is a best-effort defense. Tools handling sensitive operations should implement additional validation.

---

## Deployment Architecture

### GCP Cloud Run

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud Run Service                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    MCP Server Container                      │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │    │
│  │  │ App       │  │ OTel      │  │ Secrets   │                │    │
│  │  │ Container │  │ Sidecar   │  │ Mounted   │                │    │
│  │  └───────────┘  └───────────┘  └───────────┘                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Config:                                                             │
│  - Min instances: 0 (scale to zero)                                 │
│  - Max instances: 10 (configurable)                                 │
│  - Memory: 512MB, CPU: 1 vCPU                                       │
│  - Timeout: 60s (configurable)                                      │
│                                                                      │
│  Secrets: Secret Manager → mounted as env vars                       │
│  Observability: OTel → Cloud Monitoring / Datadog                    │
└─────────────────────────────────────────────────────────────────────┘
```

### AWS Lambda + API Gateway

```
┌─────────────────────────────────────────────────────────────────────┐
│                      API Gateway v2 (HTTP)                           │
│                              │                                       │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Lambda Function                           │    │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐                │    │
│  │  │ MCP       │  │ OTel      │  │ Secrets   │                │    │
│  │  │ Server    │  │ Instrument│  │ Manager   │                │    │
│  │  │ (Express) │  │           │  │ Mounted   │                │    │
│  │  └───────────┘  └───────────┘  └───────────┘                │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Config:                                                             │
│  - Memory: 512MB (configurable)                                     │
│  - Timeout: 30s (max for API Gateway)                               │
│  - Provisioned concurrency: 0 (on-demand)                           │
│                                                                      │
│  Secrets: Secrets Manager → mounted as env vars                      │
│  Observability: OTel → CloudWatch / Datadog                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Design Decision:** Both deployment targets are supported via Terraform modules. The application code is identical — only the infrastructure differs.

---

## Data Flow

### Tool Invocation Flow

```
1. Client sends MCP request
        │
2. Transport layer parses request
        │
3. Middleware pipeline:
   - Auth validation
   - Rate limit check
   - Idempotency check (return cached if duplicate)
   - Input sanitization
        │
4. Tool registry routes to appropriate tool
        │
5. Tool handler executes:
   - Input validated against Zod schema
   - Business logic runs
   - Response formatted as MCP content
        │
6. Response cached (if idempotency key provided)
        │
7. Response sent to client
        │
8. Observability:
   - Trace span closed
   - Metrics recorded
   - Structured log written
```

---

## Failure Modes

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Tool throws unhandled error | Span status = error | Return structured error to client |
| Rate limit exceeded | 429 response | Client retries with backoff |
| Idempotency cache miss | Cache lookup fails | Execute normally, cache result |
| OTel exporter unavailable | Export errors logged | Continue operating (observability degraded) |
| Invalid tool input | Zod validation fails | Return validation error to client |
| Auth token invalid | 401 response | Client re-authenticates |

---

## References

- **CLAUDE.md** — General development guide
- **AGENTS.md** — Agent development guide
- **README.md** — Quick start and overview
- **MCP Specification** — https://modelcontextprotocol.io/
