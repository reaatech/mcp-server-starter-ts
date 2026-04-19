---
agent_id: "mcp-server-starter-ts"
display_name: "MCP Server Starter (TypeScript)"
version: "1.0.0"
description: "TypeScript starter template for building MCP servers"
type: "mcp"
confidence_threshold: 0.9
---

# mcp-server-starter-ts — Agent Development Guide

## What this is

This document defines the agent interaction model, skill definitions, and development
patterns for building AI agents on top of the `mcp-server-starter-ts` template. It
complements `CLAUDE.md` (which covers general development) by focusing specifically
on agent capabilities, tool design, and multi-agent orchestration patterns.

**Target audience:** Engineers building MCP-compliant AI agents, platform teams
integrating agents into orchestration layers, and SREs deploying agent infrastructure.

---

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Client     │────▶│  MCP Transport   │────▶│   Tool Router   │
│  (Claude, etc)  │     │ StreamableHTTP   │     │  (middleware)   │
└─────────────────┘     │      / SSE       │     └─────────────────┘
                              └──────────────────┘            │
                                                              ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Orchestrator   │────▶│  Agent Registry  │────▶│   Skill Pool    │
│  (router/core)  │     │  (YAML configs)  │     │ (Zod-validated) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Transport Layer** | `src/transports/` | StreamableHTTP (primary) + SSE (legacy) |
| **Tool Registry** | `src/tools/` | Auto-discovered tool modules with Zod schemas |
| **Middleware Stack** | `src/middleware/` | Auth → Rate Limit → Idempotency → Sanitization |
| **Skill Definitions** | `skills/*.md` | Human-readable skill specs for agent discovery |
| **Agent Config** | `agent.yaml` (optional) | Self-describing agent metadata for orchestrators |

---

## Skill System

Skills are the atomic unit of agent capability. Each skill maps to one or more
MCP tools and is described by a `skills/{skill-id}.md` file.

### Skill File Structure

```markdown
# {skill-display-name}

## Capability
One-sentence description of what this skill enables.

## MCP Tools
| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `tool_name` | Zod schema summary | Return type | RPM |

## Usage Examples
### Example 1: Basic usage
- User intent
- Tool call
- Expected response

## Error Handling
- Known failure modes
- Recovery strategies
- Escalation paths

## Security Considerations
- PII handling
- Permission requirements
- Audit logging
```

### Built-in Skills (Template)

The template ships with two example skills:

| Skill ID | File | Description |
|----------|------|-------------|
| `echo` | `skills/echo.md` | Basic echo capability — template for new skills |
| `health-check` | `skills/health-check.md` | Server diagnostics and readiness/liveness reporting |

### Adding a New Skill

1. **Create the skill definition:**
   ```bash
   touch skills/my-skill.md
   ```

2. **Create the tool implementation:**
   ```bash
   touch src/tools/my-skill.tool.ts
   ```

3. **Create the test:**
   ```bash
   touch tests/unit/tools/my-skill.tool.test.ts
   ```

4. **Update this document** with the new skill in the table above.

---

## Agent Configuration

Agents using this template can self-describe via an optional `agent.yaml` file
at the repository root. This enables dynamic registration with orchestrators
like `ask-gm/orchestrator-core`.

### agent.yaml Schema

```yaml
# agent.yaml — Self-describing agent metadata
agent_id: "my-agent"
display_name: "My Agent"
description: >-
  Description of agent capabilities, used in classifier prompts
  for routing decisions.
endpoint: "${MCP_ENDPOINT:-http://localhost:8080}"
type: mcp
is_default: false
confidence_threshold: 0.7
clarification_required: false
clarification_context: >-
  User-facing description shown when clarification is needed.
examples:
  - "Example user query that should route here"
  - "Another example query"
skills:
  - echo
  - my-skill
```

### Registration with Orchestrator

For multi-agent platforms (like ask-gm), copy your `agent.yaml` to the
orchestrator's agent registry:

```bash
cp agent.yaml ../orchestrator-core/agents/my-agent.yaml
# Or reference via environment variable endpoint
```

---

## Tool Design Patterns

### Zod Schema Best Practices

```typescript
// ✅ GOOD: Descriptive, validated, typed
inputSchema: z.object({
  userId: z.string().uuid('Must be a valid UUID'),
  action: z.enum(['create', 'read', 'update', 'delete']),
  metadata: z.record(z.unknown()).optional(),
}),

// ❌ BAD: Unvalidated, any types
inputSchema: z.object({
  id: z.any(),
  data: z.any(),
}),
```

### Handler Error Patterns

```typescript
// ✅ GOOD: Structured error responses
handler: async ({ userId, action }) => {
  try {
    const result = await doSomething(userId, action);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (error) {
    logger.error({ err: error, userId, action }, 'Tool execution failed');
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      isError: true,
    };
  }
},

// ❌ BAD: Throwing unhandled errors
handler: async ({ userId }) => {
  return doSomething(userId); // May throw and break protocol
},
```

### Idempotency

Tools that perform mutations MUST be idempotent when called with the same
`Idempotency-Key` header. The middleware handles deduplication, but tool
implementations should also be safe to retry:

```typescript
// ✅ GOOD: Idempotent by design
handler: async ({ userId, action }, { idempotencyKey }) => {
  // Use idempotencyKey as a dedup key in your data store
  const existing = await findByNameKey(idempotencyKey);
  if (existing) return existing;
  return createWithDedupKey(userId, action, idempotencyKey);
},
```

---

## Security Model

### Input Sanitization

The `sanitization` middleware strips prompt-injection patterns from all tool
inputs. Tools should NOT perform additional sanitization unless handling
sensitive data types:

```typescript
// The middleware handles this — don't duplicate
// ❌ Don't do this:
handler: async ({ message }) => {
  const clean = message.replace(/<script>/g, ''); // Redundant
  // ...
}
```

### PII Handling

- **Never log raw user input** — the pino logger is configured to redact
  common PII patterns
- **Never return PII in error messages** — use generic error text
- **Use the `observability/logger.ts` utilities** for safe logging:
  ```typescript
  import { safeLog } from '../observability/logger.js';
  safeLog({ event: 'user_action', userId: hash(userId) }); // Hash PII
  ```

### Authentication

The `auth` middleware supports two modes:

| Mode | Config | Use Case |
|------|--------|----------|
| API Key | `API_KEY` env var | Service-to-service |
| Bearer Token | `AUTH_MODE=bearer` | User-authenticated requests |

Tools should not implement their own auth checks — rely on the middleware.

---

## Observability for Agents

### Structured Logging

Every log line includes `request_id` and `service` automatically. Add
agent-specific context:

```typescript
import { logger } from '../observability/logger.js';

logger.info({
  tool: 'my_tool',
  action: 'create',
  userId: hashedId,
  durationMs: elapsed,
}, 'Tool execution completed');
```

### Tracing

Each tool call is automatically traced as an OTel span. Add custom attributes:

```typescript
import { trace } from '@opentelemetry/api';

const span = trace.getActiveSpan();
span?.setAttribute('custom.attribute', 'value');
```

### Metrics

The template exposes these default metrics:

| Metric | Type | Labels |
|--------|------|--------|
| `mcp.tool.invocations` | Counter | `tool`, `status` |
| `mcp.tool.duration` | Histogram | `tool` (P50/P90/P99) |
| `mcp.transport.requests` | Counter | `transport`, `status` |

Add custom metrics via the `metrics.ts` module.

---

## Testing Agents

### Unit Tests (Tool Level)

```typescript
// tests/unit/tools/my-tool.tool.test.ts
import myTool from '../../src/tools/my-tool.tool.js';

describe('my-tool', () => {
  it('should handle valid input', async () => {
    const result = await myTool.handler({ param: 'value' }, {});
    expect(result.content[0].type).toBe('text');
  });

  it('should handle errors gracefully', async () => {
    const result = await myTool.handler({ param: 'invalid' }, {});
    expect(result.isError).toBe(true);
  });
});
```

### Integration Tests (Transport Level)

```typescript
// tests/e2e/streamable-http.test.ts
import { startServer } from '../../src/index.js';

describe('StreamableHTTP transport', () => {
  beforeAll(async () => { await startServer(); });
  afterAll(async () => { await stopServer(); });

  it('should execute tool via MCP protocol', async () => {
    const response = await fetch('http://localhost:8080/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'echo', arguments: { message: 'hello' } },
      }),
    });
    const result = await response.json();
    expect(result.result.content[0].text).toBe('hello');
  });
});
```

### E2E Tests (Orchestrator Integration)

For agents participating in a multi-agent system, test the full routing flow:

```typescript
// tests/e2e/orchestrator-integration.test.ts
describe('Multi-agent routing', () => {
  it('should route to correct agent based on classifier', async () => {
    // Test that queries matching this agent's examples
    // are correctly routed by the orchestrator
  });
});
```

---

## Deployment

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `PORT` | no | `8080` | HTTP listen port |
| `NODE_ENV` | no | `development` | Environment |
| `API_KEY` | yes (prod) | — | Auth middleware key |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | — | OTel collector |
| `OTEL_SERVICE_NAME` | no | `mcp-server` | Service name |
| `IDEMPOTENCY_TTL_MS` | no | `300000` | Idempotency cache TTL |
| `RATE_LIMIT_RPM` | no | `60` | Rate limit per client |
| `LOG_LEVEL` | no | `info` | Pino log level |

### Terraform Deployment

```bash
# GCP Cloud Run
cd infra/gcp && terraform apply

# AWS Lambda + API Gateway
cd infra/aws && terraform apply
```

Both deployments configure:
- Secret management (GCP Secret Manager / AWS Secrets Manager)
- OTel sidecar for observability
- IAM roles with least privilege
- Health check endpoints

---

## Checklist: Production Readiness

Before deploying an agent to production:

- [ ] All tools have corresponding `*.tool.test.ts` files
- [ ] All tools have Zod-validated input schemas
- [ ] Error handling returns structured responses (no unhandled throws)
- [ ] No PII in logs (verified via log sampling)
- [ ] `API_KEY` configured for auth middleware
- [ ] OTel exporter configured for tracing/metrics
- [ ] Rate limiting tuned for expected traffic
- [ ] Idempotency implemented for mutation tools
- [ ] Skill definitions (`skills/*.md`) are complete
- [ ] Agent config (`agent.yaml`) is accurate
- [ ] Docker image built with multi-stage Dockerfile
- [ ] Terraform state configured for remote backend
- [ ] CI pipeline passes (lint, typecheck, test, build)

---

## References

- **CLAUDE.md** — General development guide for this template
- **README.md** — Quick start and overview
- **ARCHITECTURE.md** — Deep dive into system design
- **ask-gm/orchestrator-core** — Multi-agent orchestration reference
- **MCP Specification** — https://modelcontextprotocol.io/
