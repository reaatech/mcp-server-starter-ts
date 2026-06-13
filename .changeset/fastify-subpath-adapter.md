---
"@reaatech/mcp-server-transport": minor
---

Add a first-class `@reaatech/mcp-server-transport/fastify` subpath export, matching the `@reaatech/mcp-gateway-*` packages' `./fastify` convention so the two compose.

- New `./fastify` subpath (dual ESM/CJS + types) exporting `fastifyStreamableHTTP` as **both the default and a named export**, plus a parallel `fastifySSE` plugin mirroring the Express `mountSSE`. Options are `{ serverFactory, path? }` (default `/mcp`) for Streamable HTTP and `{ serverFactory, ssePath?, messagesPath? }` for SSE. `mountStreamableHTTPFastify` / `mountSSEFastify` convenience wrappers are also provided.
- Both Fastify and Express adapters reuse the same SDK `StreamableHTTPServerTransport`, the same session store, and identical `updateTransportSessionCount` accounting. The Fastify handlers call `reply.hijack()` before passing the raw socket to the transport so Fastify never serializes or auto-closes a JSON or long-lived SSE response. The POST body limit defaults to 10 MB (never smaller than the Express path).
- The SSE session lifecycle is extracted into a framework-agnostic core (`sse-core`) shared by both adapters, mirroring the existing Streamable HTTP core.
- The Fastify request is augmented with `requestContext` (the equivalent of the existing `Express.Request.requestContext` augmentation) for structured logging. This coexists with the `authContext` / `tenantId` fields the gateway Fastify plugins decorate. The README documents the recommended registration order (gateway auth/rate-limit/allowlist/audit/cache preHandlers, then this transport).

Backward compatible and purely additive: the Express `mountStreamableHTTP` / `mountSSE` APIs and the `zod` peer range (`^3.23 || ^4`) are unchanged.
