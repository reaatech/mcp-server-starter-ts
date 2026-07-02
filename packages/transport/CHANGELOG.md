# @reaatech/mcp-server-transport

## 1.2.1

### Patch Changes

- Updated dependencies [e0ffe61]
- Updated dependencies [61af2f6]
  - @reaatech/mcp-server-core@1.1.0
  - @reaatech/mcp-server-observability@1.2.0

## 1.2.0

### Minor Changes

- [#30](https://github.com/reaatech/mcp-server-starter-ts/pull/30) [`e6dded8`](https://github.com/reaatech/mcp-server-starter-ts/commit/e6dded8cd5833c28ba8e7a1586de49e158210bf9) Thanks [@reaatech](https://github.com/reaatech)! - Add a first-class `@reaatech/mcp-server-transport/fastify` subpath export, matching the `@reaatech/mcp-gateway-*` packages' `./fastify` convention so the two compose.

  - New `./fastify` subpath (dual ESM/CJS + types) exporting `fastifyStreamableHTTP` as **both the default and a named export**, plus a parallel `fastifySSE` plugin mirroring the Express `mountSSE`. Options are `{ serverFactory, path? }` (default `/mcp`) for Streamable HTTP and `{ serverFactory, ssePath?, messagesPath? }` for SSE. `mountStreamableHTTPFastify` / `mountSSEFastify` convenience wrappers are also provided.
  - Both Fastify and Express adapters reuse the same SDK `StreamableHTTPServerTransport`, the same session store, and identical `updateTransportSessionCount` accounting. The Fastify handlers call `reply.hijack()` before passing the raw socket to the transport so Fastify never serializes or auto-closes a JSON or long-lived SSE response. The POST body limit defaults to 10 MB (never smaller than the Express path).
  - The SSE session lifecycle is extracted into a framework-agnostic core (`sse-core`) shared by both adapters, mirroring the existing Streamable HTTP core.
  - The Fastify request is augmented with `requestContext` (the equivalent of the existing `Express.Request.requestContext` augmentation) for structured logging. This coexists with the `authContext` / `tenantId` fields the gateway Fastify plugins decorate. The README documents the recommended registration order (gateway auth/rate-limit/allowlist/audit/cache preHandlers, then this transport).

  Backward compatible and purely additive: the Express `mountStreamableHTTP` / `mountSSE` APIs and the `zod` peer range (`^3.23 || ^4`) are unchanged.

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
