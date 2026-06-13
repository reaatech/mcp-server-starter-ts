# @reaatech/mcp-server-transport

## 1.1.0

### Minor Changes

- Make the Streamable HTTP transport framework-agnostic.

  - Extracted the session-management and dispatch logic into a framework-neutral core that operates on raw Node `req`/`res` + parsed body, exported as `handleStreamableHTTPRequest` / `handleStreamableHTTPDelete`. The periodic session-eviction sweeps are also exported as `cleanupExpiredSessions(timeoutMs)` (Streamable HTTP) and `cleanupExpiredSSESessions(timeoutMs)` (SSE).
  - Added first-class Fastify support via the `fastifyStreamableHTTP` plugin (and a `mountStreamableHTTPFastify` convenience wrapper). The handler calls `reply.hijack()` and hands `reply.raw` to the SDK transport so Fastify never manages JSON or SSE responses.
  - The existing Express `mountStreamableHTTP(app, serverFactory)` API is unchanged and now delegates to the shared core; sessions are shared across adapters.
  - Relaxed `zod` from a hard `^4.4.3` dependency to an optional peer range `^3.23 || ^4`, so consumers are no longer forced onto zod 4. `express` and `fastify` are now declared as optional peers.

## 1.0.1

### Patch Changes

- Updated dependencies [[`05350bd`](https://github.com/reaatech/mcp-server-starter-ts/commit/05350bd317572aa3313299d5a05178f32bb4aede)]:
  - @reaatech/mcp-server-core@1.0.1
  - @reaatech/mcp-server-observability@1.1.0
