# @reaatech/mcp-server-auth

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-server-auth.svg)](https://www.npmjs.com/package/@reaatech/mcp-server-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-server-starter-ts/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

Pluggable authentication middleware for MCP servers. Provides API key and Bearer token validation with timing-safe comparison, plus a development-mode bypass.

## Installation

```bash
npm install @reaatech/mcp-server-auth
# or
pnpm add @reaatech/mcp-server-auth
```

## Feature Overview

- **API key authentication** — Validate against a shared secret via `x-api-key` header
- **Bearer token authentication** — Validate via `Authorization: Bearer` header
- **Constant-time comparison** — Uses `crypto.timingSafeEqual` to prevent timing attacks
- **Dev mode bypass** — Automatically skips auth in non-production when no `API_KEY` is configured
- **Minimal dependency** — Only depends on `@reaatech/mcp-server-core` for config and types

## Quick Start

```typescript
import express from 'express';
import { authMiddleware } from '@reaatech/mcp-server-auth';

const app = express();
app.use(authMiddleware());

app.listen(8080);
```

## API Reference

### `authMiddleware()`

Returns an Express middleware function that validates incoming requests.

```typescript
import { authMiddleware } from '@reaatech/mcp-server-auth';

app.use(authMiddleware());
```

#### Authentication Logic

- **Production with `API_KEY` set**: validates `x-api-key` or `Authorization: Bearer` header
- **Production without `API_KEY`**: returns 500 — misconfigured
- **Development without `API_KEY`** (and `AUTH_BYPASS_IN_DEV=true`): pass-through
- **Invalid credentials**: returns 401 with `WWW-Authenticate` header

#### Request Context

On successful authentication, the middleware attaches a `RequestContext` to `req.requestContext`:

```typescript
interface RequestContext {
  requestId: string;
  sessionId?: string;
  idempotencyKey?: string;
  apiKey?: string;   // Set to '[REDACTED]' after auth
  ipAddress?: string;
}
```

This context is consumed by downstream middleware (`rate-limit`, `idempotency`, `sanitization`) and tool handlers.

## Configuration

All configuration is read from `@reaatech/mcp-server-core`'s validated environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `API_KEY` | — | Shared secret (required in production) |
| `AUTH_MODE` | `api-key` | `api-key` or `bearer` |
| `AUTH_BYPASS_IN_DEV` | `true` | Skip auth in dev when no key configured |

### Production Example

```bash
export NODE_ENV=production
export API_KEY=sk-secret-key
export AUTH_MODE=api-key
```

### Development Example

```bash
# No API_KEY set — auth is bypassed automatically
export NODE_ENV=development
```

## Integration with the Server

```typescript
import { createApp } from '@reaatech/mcp-server-engine';
// authMiddleware() is called automatically inside createApp()

const app = await createApp();
app.listen(8080);
```

The server framework applies `authMiddleware()` as the first step in the middleware pipeline, before rate limiting, idempotency, and sanitization.

## Related Packages

- [`@reaatech/mcp-server-core`](https://www.npmjs.com/package/@reaatech/mcp-server-core) — Configuration and shared types
- [`@reaatech/mcp-server-engine`](https://www.npmjs.com/package/@reaatech/mcp-server-engine) — MCP server framework

## License

[MIT](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
