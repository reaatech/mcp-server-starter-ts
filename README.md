# mcp-server-starter-ts

**Production-grade MCP server template in TypeScript.**

Built from lessons learned shipping MCP servers at Fortune-10 scale. This is "what I wish existed on day 1 of a Fortune-10 MCP build."

## Quick Start

```bash
# Clone the template
git clone https://github.com/reaatech/mcp-server-starter-ts my-mcp-server
cd my-mcp-server

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development server
npm run dev

# Test with curl
curl http://localhost:8080/health
```

## What's Included

| Feature | Status | Description |
|---------|--------|-------------|
| **MCP Protocol** | ✅ | Full MCP server using `@modelcontextprotocol/sdk` |
| **Dual Transports** | ✅ | StreamableHTTP (primary) + SSE (legacy) |
| **Tool System** | ✅ | Auto-discovered tools with Zod validation |
| **Auth Middleware** | ✅ | API key / Bearer token validation |
| **Rate Limiting** | ✅ | Token bucket algorithm, per-client |
| **Idempotency** | ✅ | Request deduplication with TTL cache |
| **Input Sanitization** | ✅ | Prompt-injection defense |
| **Structured Logging** | ✅ | Pino with request_id correlation |
| **Distributed Tracing** | ✅ | OpenTelemetry with OTLP export |
| **Metrics** | ✅ | OTel counters, histograms, gauges |
| **Docker** | ✅ | Multi-stage build, <50MB target |
| **docker-compose** | ✅ | Local dev with Jaeger + Prometheus |
| **CI/CD** | ✅ | GitHub Actions (lint, test, build, docker) |
| **TypeScript** | ✅ | Strict mode, ESM, NodeNext |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCP Client    │────▶│  Express Server  │────▶│  Middleware     │
│   (Claude, etc) │     │  (Transport)     │     │  Pipeline       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Observability  │◀────│   MCP Server     │◀────│  Tool Registry  │
│  (OTel/Pino)    │     │   (Core)         │     │  (Auto-discover)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Tool Authoring

Create a new tool in 30 seconds:

1. **Create `src/tools/my-tool.tool.ts`:**

```typescript
import { z } from 'zod';
import { defineTool } from './index.js';
import { textContent } from '../types/domain.js';

export default defineTool({
  name: 'my-tool',
  description: 'Does something useful for the LLM',
  inputSchema: z.object({
    param1: z.string().describe('First parameter'),
    param2: z.number().optional().describe('Optional number'),
  }),
  handler: async ({ param1, param2 }, context) => {
    // Your logic here
    return {
      content: [textContent(`Result: ${param1}`)],
    };
  },
});
```

2. **Create `tests/unit/tools/my-tool.tool.test.ts`**

3. **Done!** The tool is auto-registered on startup.

## Middleware Configuration

| Middleware | Env Var | Default | Description |
|------------|---------|---------|-------------|
| Auth | `API_KEY` | — | Required in production |
| Auth Mode | `AUTH_MODE` | `api-key` | `api-key` or `bearer` |
| Rate Limit | `RATE_LIMIT_RPM` | `60` | Requests per minute |
| Idempotency | `IDEMPOTENCY_TTL_MS` | `300000` | Cache TTL (5 min) |

## Observability Setup

### Local Development

```bash
# Start with observability sidecars
docker compose up

# View traces: http://localhost:16686 (Jaeger)
# View metrics: http://localhost:9090 (Prometheus)
```

### Production

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your OTLP collector:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
export OTEL_SERVICE_NAME=my-mcp-server
npm start
```

## Deployment

### Docker

```bash
docker build -t my-mcp-server .
docker run -p 8080:8080 -e API_KEY=your-key my-mcp-server
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `8080` | Listen port |
| `NODE_ENV` | No | `development` | Environment |
| `API_KEY` | Yes (prod) | — | Auth key |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins (`*` or comma-separated list) |
| `AUTH_BYPASS_IN_DEV` | No | `true` | Allow auth bypass outside production when no key is configured |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | — | OTLP endpoint |
| `OTEL_RESOURCE_ATTRIBUTES` | No | — | Resource attributes (e.g. `service.version=1.0.0`) |
| `SANITIZATION_DENY_PATTERNS` | No | — | Extra sanitization patterns (comma or newline-separated) |
| `LOG_LEVEL` | No | `info` | Log level |

## Project Structure

```
src/
├── config/          # Environment config (Zod validated)
├── middleware/      # Auth, rate-limit, idempotency, sanitization
├── observability/   # Logger, tracing, metrics
├── tools/           # MCP tools (*.tool.ts)
├── transports/      # StreamableHTTP, SSE
├── types/           # Shared types and schemas
├── index.ts         # Express entry point
└── server.ts        # MCP server factory
tests/
├── unit/            # Unit tests
└── e2e/             # End-to-end tests
docker/              # Docker compose configs
infra/               # Terraform modules plus example AWS/GCP root modules
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure tests pass: `npm test`
4. Submit a pull request

## License

MIT
