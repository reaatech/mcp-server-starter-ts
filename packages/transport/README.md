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
- **SSE transport** — Legacy transport via `GET /mcp/sse` + `POST /mcp/messages` (Express & Fastify)
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

The Fastify adapters live on the `@reaatech/mcp-server-transport/fastify` subpath
(matching the `@reaatech/mcp-gateway-*` packages' `./fastify` convention). They are
also re-exported from the package root for convenience.

```typescript
import Fastify from 'fastify';
import fastifyStreamableHTTP, { fastifySSE } from '@reaatech/mcp-server-transport/fastify';
import { createMcpServer, getTools } from '@reaatech/mcp-server-engine';

const app = Fastify();

const serverFactory = () => createMcpServer(getTools());

// Primary transport: StreamableHTTP (POST /mcp, DELETE /mcp).
// `fastifyStreamableHTTP` is exported as both the default and a named export.
await app.register(fastifyStreamableHTTP, { serverFactory, path: '/mcp' });

// Legacy transport: SSE (GET /mcp/sse, POST /mcp/messages)
await app.register(fastifySSE, { serverFactory });

await app.listen({ port: 8080 });
```

Fastify's built-in JSON body parser handles `POST /mcp`; the plugin calls
`reply.hijack()` and hands the raw socket to the transport so Fastify never tries
to serialize or auto-close the (possibly long-lived SSE) response. Both Fastify and
Express adapters share the same session store, so `clearAllSessions()` /
`clearAllSSESessions()` clear sessions created by either framework.

#### Composing with the `@reaatech/mcp-gateway-*` Fastify plugins

The gateway plugins run as `onRequest` / `preHandler` hooks and decorate
`request.authContext` / `request.tenantId`; this transport reads
`request.requestContext` for structured logging and never sets or clobbers the
gateway fields. Register the gateway plugins **before** the transport so tenant
context is resolved before a request is handled:

```typescript
import Fastify from 'fastify';
import { fastifyAuth } from '@reaatech/mcp-gateway-auth/fastify';
import { fastifyRateLimit } from '@reaatech/mcp-gateway-rate-limit/fastify';
import { fastifyAllowlist } from '@reaatech/mcp-gateway-allowlist/fastify';
import { fastifyAudit } from '@reaatech/mcp-gateway-audit/fastify';
import { fastifyCache } from '@reaatech/mcp-gateway-cache/fastify';
import fastifyStreamableHTTP from '@reaatech/mcp-server-transport/fastify';

const app = Fastify();

// Gateway preHandlers, in order: auth → rate-limit → allowlist → audit → cache
await app.register(fastifyAuth, { /* ... */ });
await app.register(fastifyRateLimit, { /* ... */ });
await app.register(fastifyAllowlist, { /* ... */ });
await app.register(fastifyAudit, { /* ... */ });
await app.register(fastifyCache, { /* ... */ });

// …then the transport, which handles the request.
await app.register(fastifyStreamableHTTP, { serverFactory });
```

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

Mounts the Streamable HTTP transport on a Fastify application. Import it from the
`@reaatech/mcp-server-transport/fastify` subpath (it is the module's default export
and is also available as a named export, and re-exported from the package root):

```typescript
import fastifyStreamableHTTP from '@reaatech/mcp-server-transport/fastify';

await app.register(fastifyStreamableHTTP, {
  serverFactory: () => createMcpServer(tools),
  path: '/mcp',           // optional, defaults to '/mcp'
  bodyLimit: 10 * 1024 * 1024, // optional, defaults to 10 MB
});
```

A convenience wrapper `mountStreamableHTTPFastify(app, serverFactory, options?)` is
also exported for parity with the Express API:

```typescript
import { mountStreamableHTTPFastify } from '@reaatech/mcp-server-transport/fastify';

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

### `fastifySSE` (Fastify plugin)

Mounts the legacy SSE transport on a Fastify application, mirroring the Express
`mountSSE`. Imported from the same `@reaatech/mcp-server-transport/fastify` subpath:

```typescript
import { fastifySSE } from '@reaatech/mcp-server-transport/fastify';

await app.register(fastifySSE, {
  serverFactory: () => createMcpServer(tools),
  ssePath: '/mcp/sse',          // optional, defaults to '/mcp/sse'
  messagesPath: '/mcp/messages', // optional, defaults to '/mcp/messages'
  bodyLimit: 10 * 1024 * 1024,   // optional, defaults to 10 MB
});
```

A convenience wrapper `mountSSEFastify(app, serverFactory, options?)` is also
exported. Both routes call `reply.hijack()` and hand `reply.raw` to the SDK
transport; the SSE session store is shared with the Express adapter.

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `serverFactory` | _(required)_ | `() => McpServer` invoked once per new SSE session |
| `ssePath` | `/mcp/sse` | Path that establishes the SSE stream |
| `messagesPath` | `/mcp/messages` | Path clients post messages back to |
| `bodyLimit` | `10485760` (10 MB) | Max request body size for `POST {messagesPath}` |

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
