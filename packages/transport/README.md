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
- **SSE transport** — Legacy transport via `GET /mcp/sse` + `POST /mcp/messages`
- **Session lifecycle** — Creates, reuses, and cleans up MCP sessions per transport
- **Automatic cleanup** — Periodic eviction of expired sessions based on `SESSION_TIMEOUT_MS`
- **Transport metrics** — Records request counts and active session gauges via `@reaatech/mcp-server-observability`

## Quick Start

```typescript
import express from 'express';
import { mountStreamableHTTP, mountSSE } from '@reaatech/mcp-server-transport';
import { createMcpServer, getTools } from '@reaatech/mcp-server-server';

const app = express();
app.use(express.json());

const serverFactory = () => createMcpServer(getTools());

// Primary transport: StreamableHTTP
mountStreamableHTTP(app, serverFactory);

// Legacy transport: SSE
mountSSE(app, serverFactory);

app.listen(8080);
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

The `@reaatech/mcp-server-server` package mounts both transports automatically when you use `createApp()`:

```typescript
import { createApp } from '@reaatech/mcp-server-server';

const app = await createApp();
// StreamableHTTP mounted at POST /mcp, DELETE /mcp
// SSE mounted at GET /mcp/sse, POST /mcp/messages

app.listen(8080);
```

## Related Packages

- [`@reaatech/mcp-server-core`](https://www.npmjs.com/package/@reaatech/mcp-server-core) — Configuration and types
- [`@reaatech/mcp-server-observability`](https://www.npmjs.com/package/@reaatech/mcp-server-observability) — Transport metrics
- [`@reaatech/mcp-server-server`](https://www.npmjs.com/package/@reaatech/mcp-server-server) — MCP server framework

## License

[MIT](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
