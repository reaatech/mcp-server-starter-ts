# @reaatech/mcp-server-transport

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-server-transport.svg)](https://www.npmjs.com/package/@reaatech/mcp-server-transport)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-server-starter-ts/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

MCP transport implementations (Streamable HTTP, SSE) with session management. Mounts MCP transport handlers onto an Express application, managing session lifecycle, automatic cleanup, and transport-level metrics.

## Installation

```bash
npm install @reaatech/mcp-server-transport
# or
pnpm add @reaatech/mcp-server-transport
```

## Feature Overview

- **Streamable HTTP transport** — Primary transport via `POST /mcp`, session-aware via `Mcp-Session-Id` header
- **Framework-agnostic core** — Session management + dispatch operate on raw Node `req`/`res`; thin adapters wrap your HTTP framework
- **Express & Fastify adapters** — First-class support for both, sharing the same session store
- **SSE transport** — Legacy transport via `GET /mcp/sse` + `POST /mcp/messages` (Express)
- **Session lifecycle** — Creates, reuses, and cleans up MCP sessions per transport
- **Automatic cleanup** — Periodic eviction of expired sessions based on `SESSION_TIMEOUT_MS`
- **Transport metrics** — Records request counts and active session gauges via `@reaatech/mcp-server-observability`

## Quick Start

### Express

```typescript
import express from 'express';
import { mountStreamableHTTP, mountSSE } from '@reaatech/mcp-server-transport';
import { createMcpServer, getTools } from '@reaatech/mcp-server-engine';

const app = express();
app.use(express.json());

const serverFactory = () => createMcpServer(getTools());

// Primary transport: StreamableHTTP
mountStreamableHTTP(app, serverFactory);

// Legacy transport: SSE
mountSSE(app, serverFactory);

app.listen(8080);
```

### Fastify

```typescript
import Fastify from 'fastify';
import { fastifyStreamableHTTP } from '@reaatech/mcp-server-transport';
import { createMcpServer, getTools } from '@reaatech/mcp-server-engine';

const app = Fastify();

const serverFactory = () => createMcpServer(getTools());

// Primary transport: StreamableHTTP (POST /mcp, DELETE /mcp)
await app.register(fastifyStreamableHTTP, { serverFactory, path: '/mcp' });

await app.listen({ port: 8080 });
```

Fastify's built-in JSON body parser handles `POST /mcp`; the plugin calls
`reply.hijack()` and hands the raw socket to the transport so Fastify never tries
to serialize or auto-close the (possibly long-lived SSE) response.

## API Reference

### `mountStreamableHTTP(app, serverFactory)`

Mounts the Streamable HTTP transport on an Express application.

```typescript
import { mountStreamableHTTP } from '@reaatech/mcp-server-transport';

mountStreamableHTTP(app, () => createMcpServer(tools));
```

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` | Send an MCP request, receive a JSON-RPC response |
| `DELETE` | `/mcp` | Terminate an MCP session by `Mcp-Session-Id` header |

#### Session Behavior

- **New sessions**: Created when no `Mcp-Session-Id` header is present. Server manages a per-session `StreamableHTTPServerTransport` and `McpServer` instance.
- **Session reuse**: Existing sessions are reused when a matching `Mcp-Session-Id` header is provided.
- **Cleanup**: Sessions idle longer than `SESSION_TIMEOUT_MS` are automatically closed and removed.

### `fastifyStreamableHTTP` (Fastify plugin)

Mounts the Streamable HTTP transport on a Fastify application. Register it like any
other plugin:

```typescript
import { fastifyStreamableHTTP } from '@reaatech/mcp-server-transport';

await app.register(fastifyStreamableHTTP, {
  serverFactory: () => createMcpServer(tools),
  path: '/mcp',           // optional, defaults to '/mcp'
  bodyLimit: 10 * 1024 * 1024, // optional, defaults to 10 MB
});
```

A convenience wrapper `mountStreamableHTTPFastify(app, serverFactory, options?)` is
also exported for parity with the Express API:

```typescript
import { mountStreamableHTTPFastify } from '@reaatech/mcp-server-transport';

await mountStreamableHTTPFastify(app, () => createMcpServer(tools), { path: '/mcp' });
```

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `serverFactory` | _(required)_ | `() => McpServer` invoked once per new session |
| `path` | `/mcp` | Path to mount `POST`/`DELETE` on |
| `bodyLimit` | `10485760` (10 MB) | Max request body size for `POST {path}` |

The endpoints, headers (`Mcp-Session-Id`), and session behavior are identical to
the Express adapter — both share the same session store, so `clearAllSessions()`
clears sessions created by either framework.

### `mountSSE(app, serverFactory)`

Mounts the SSE (Server-Sent Events) transport on an Express application.

```typescript
import { mountSSE } from '@reaatech/mcp-server-transport';

mountSSE(app, () => createMcpServer(tools));
```

#### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/mcp/sse` | Establish an SSE stream. Returns `text/event-stream`. |
| `POST` | `/mcp/messages?sessionId=<id>` | Send an MCP request to an existing SSE session |

#### SSE Headers

- `Content-Type: text/event-stream`
- `Cache-Control: no-cache`
- `Connection: keep-alive`
- `X-Accel-Buffering: no` — for nginx reverse proxy compatibility

### `clearAllSessions()` / `clearAllSSESessions()`

Clear all active sessions. Primarily for testing.

```typescript
import { clearAllSessions, clearAllSSESessions } from '@reaatech/mcp-server-transport';

clearAllSessions();    // Clear StreamableHTTP sessions
clearAllSSESessions(); // Clear SSE sessions
```

### `updateTransportSessionCount(transport, count)`

Update the active session gauge for a transport type. Called internally by session lifecycle hooks.

```typescript
import { updateTransportSessionCount } from '@reaatech/mcp-server-transport';

updateTransportSessionCount('streamable-http', 42);
updateTransportSessionCount('sse', 7);
```

## Configuration

Uses environment variables from `@reaatech/mcp-server-core`:

| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_TIMEOUT_MS` | `1800000` (30 min) | Session expiry in milliseconds |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OpenTelemetry endpoint for transport metrics |

## Integration with the Server

The `@reaatech/mcp-server-engine` package mounts both transports automatically when you use `createApp()`:

```typescript
import { createApp } from '@reaatech/mcp-server-engine';

const app = await createApp();
// StreamableHTTP mounted at POST /mcp, DELETE /mcp
// SSE mounted at GET /mcp/sse, POST /mcp/messages

app.listen(8080);
```

## Related Packages

- [`@reaatech/mcp-server-core`](https://www.npmjs.com/package/@reaatech/mcp-server-core) — Configuration and types
- [`@reaatech/mcp-server-observability`](https://www.npmjs.com/package/@reaatech/mcp-server-observability) — Transport metrics
- [`@reaatech/mcp-server-engine`](https://www.npmjs.com/package/@reaatech/mcp-server-engine) — MCP server framework

## License

[MIT](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
