import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestContext } from '@reaatech/mcp-server-core';
import { logger } from '@reaatech/mcp-server-observability';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { handleStreamableHTTPDelete, handleStreamableHTTPRequest } from './core.js';
import { DEFAULT_SSE_MESSAGES_PATH, handleSSEConnection, handleSSEMessage } from './sse-core.js';

// Re-export the shared session helpers and types so a Fastify-only consumer can
// import everything it needs from `@reaatech/mcp-server-transport/fastify`
// without also reaching for the Express-flavoured main entry.
export type {
  DeleteResult,
  RequestLogContext,
  SessionStore,
  StreamableSession,
} from './core.js';
export { clearAllSessions } from './core.js';
export { updateTransportSessionCount } from './session-metrics.js';
export { cleanupExpiredSSESessions, clearAllSSESessions } from './sse-core.js';

/**
 * Augment Fastify's request with the same `requestContext` field the Express
 * adapter relies on (see the `Express.Request` augmentation in
 * `./streamable-http.js`). This is the field this transport reads for
 * structured request logging.
 *
 * The `@reaatech/mcp-gateway-*` Fastify plugins separately decorate
 * `request.authContext` / `request.tenantId`; those fields coexist with
 * `requestContext` and are declared by the gateway packages, so a gateway
 * preHandler can populate tenant context that downstream code reads — this
 * transport neither sets nor clobbers them.
 */
declare module 'fastify' {
  interface FastifyRequest {
    requestContext?: RequestContext;
  }
}

/** Default maximum request body size for the Streamable HTTP route (10 MB). */
const DEFAULT_BODY_LIMIT = 10 * 1024 * 1024;

export interface FastifyStreamableHTTPOptions {
  /** Factory that produces a fresh `McpServer` for each new session. */
  serverFactory: () => McpServer;
  /** Path to mount the transport on. Defaults to `/mcp`. */
  path?: string;
  /**
   * Maximum request body size in bytes for `POST {path}`. Defaults to 10 MB so
   * it is never smaller than the Express path's typical `express.json()` limit.
   */
  bodyLimit?: number;
}

export interface FastifySSEOptions {
  /** Factory that produces a fresh `McpServer` for each new SSE session. */
  serverFactory: () => McpServer;
  /** Path that establishes the SSE stream. Defaults to `/mcp/sse`. */
  ssePath?: string;
  /** Path clients post messages back to. Defaults to `/mcp/messages`. */
  messagesPath?: string;
  /**
   * Maximum request body size in bytes for `POST {messagesPath}`. Defaults to
   * 10 MB, matching {@link FastifyStreamableHTTPOptions.bodyLimit}, so the SSE
   * messages route is not constrained by Fastify's smaller global default.
   */
  bodyLimit?: number;
}

function getRequestContext(request: FastifyRequest): RequestContext | undefined {
  return request.requestContext;
}

/**
 * Fastify plugin that mounts the MCP Streamable HTTP transport.
 *
 * Registers `POST {path}` (client→server messages, may return a JSON response or
 * a long-lived SSE stream) and `DELETE {path}` (session termination), reading and
 * writing the `mcp-session-id` header exactly as the Express adapter does. Both
 * adapters share the same session store, so `clearAllSessions()` clears sessions
 * created by either framework.
 *
 * The `POST` handler calls `reply.hijack()` before handing `reply.raw` to the SDK
 * transport so Fastify never tries to serialize or auto-close the response — the
 * transport owns the socket for both JSON and SSE replies.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import fastifyStreamableHTTP from '@reaatech/mcp-server-transport/fastify';
 *
 * const app = Fastify();
 * await app.register(fastifyStreamableHTTP, { serverFactory, path: '/mcp' });
 * await app.listen({ port: 8080 });
 * ```
 *
 * Registration order with the gateway plugins: register the gateway
 * auth / rate-limit / allowlist / audit / cache plugins first (they run as
 * `onRequest` / `preHandler` hooks and populate `request.authContext` /
 * `request.tenantId`), then register this transport, which handles the request.
 */
export const fastifyStreamableHTTP: FastifyPluginAsync<FastifyStreamableHTTPOptions> = async (
  fastify,
  opts,
) => {
  const { serverFactory } = opts;
  if (typeof serverFactory !== 'function') {
    throw new Error('fastifyStreamableHTTP requires a `serverFactory` function option');
  }
  const path = opts.path ?? '/mcp';
  const bodyLimit = opts.bodyLimit ?? DEFAULT_BODY_LIMIT;

  fastify.post(path, { bodyLimit }, async (request: FastifyRequest, reply: FastifyReply) => {
    const context = getRequestContext(request);
    // Hand the raw socket to the SDK transport. Fastify must not manage the
    // response: Streamable HTTP replies are JSON or a long-lived SSE stream.
    reply.hijack();
    await handleStreamableHTTPRequest(request.raw, reply.raw, request.body, serverFactory, {
      requestId: context?.requestId,
    });
  });

  fastify.delete(path, async (request: FastifyRequest, reply: FastifyReply) => {
    const context = getRequestContext(request);
    const sessionId = request.headers['mcp-session-id'] as string | undefined;
    const result = handleStreamableHTTPDelete(sessionId, { requestId: context?.requestId });
    return reply.code(result.status).send(result.body);
  });

  logger.info(`StreamableHTTP transport mounted (Fastify) on POST ${path}, DELETE ${path}`);
};

export default fastifyStreamableHTTP;

/**
 * Fastify plugin that mounts the legacy MCP SSE transport, mirroring the Express
 * `mountSSE`. Registers `GET {ssePath}` (establish the event stream) and
 * `POST {messagesPath}` (client→server messages). Shares the same SSE session
 * store as the Express adapter, so `clearAllSSESessions()` clears sessions from
 * either framework.
 *
 * Both routes call `reply.hijack()` before handing `reply.raw` to the SDK
 * transport: the `GET` reply is a long-lived `text/event-stream`, and the `POST`
 * reply is written directly by the transport core.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { fastifySSE } from '@reaatech/mcp-server-transport/fastify';
 *
 * const app = Fastify();
 * await app.register(fastifySSE, { serverFactory });
 * await app.listen({ port: 8080 });
 * ```
 */
export const fastifySSE: FastifyPluginAsync<FastifySSEOptions> = async (fastify, opts) => {
  const { serverFactory } = opts;
  if (typeof serverFactory !== 'function') {
    throw new Error('fastifySSE requires a `serverFactory` function option');
  }
  const ssePath = opts.ssePath ?? '/mcp/sse';
  const messagesPath = opts.messagesPath ?? DEFAULT_SSE_MESSAGES_PATH;
  const bodyLimit = opts.bodyLimit ?? DEFAULT_BODY_LIMIT;

  fastify.get(ssePath, async (request: FastifyRequest, reply: FastifyReply) => {
    const context = getRequestContext(request);
    reply.hijack();
    await handleSSEConnection(request.raw, reply.raw, messagesPath, serverFactory, {
      requestId: context?.requestId,
    });
  });

  fastify.post(
    messagesPath,
    { bodyLimit },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const context = getRequestContext(request);
      const sessionId = (request.query as { sessionId?: string } | undefined)?.sessionId;
      reply.hijack();
      await handleSSEMessage(sessionId, request.raw, reply.raw, request.body, {
        requestId: context?.requestId,
      });
    },
  );

  logger.info(`SSE transport mounted (Fastify) on GET ${ssePath}, POST ${messagesPath}`);
};

/**
 * Convenience wrapper that registers {@link fastifyStreamableHTTP} on an existing
 * Fastify instance. Equivalent to
 * `app.register(fastifyStreamableHTTP, { serverFactory, ...options })`.
 */
export async function mountStreamableHTTPFastify(
  app: FastifyInstance,
  serverFactory: () => McpServer,
  options: Omit<FastifyStreamableHTTPOptions, 'serverFactory'> = {},
): Promise<void> {
  await app.register(fastifyStreamableHTTP, { serverFactory, ...options });
}

/**
 * Convenience wrapper that registers {@link fastifySSE} on an existing Fastify
 * instance. Equivalent to
 * `app.register(fastifySSE, { serverFactory, ...options })`.
 */
export async function mountSSEFastify(
  app: FastifyInstance,
  serverFactory: () => McpServer,
  options: Omit<FastifySSEOptions, 'serverFactory'> = {},
): Promise<void> {
  await app.register(fastifySSE, { serverFactory, ...options });
}
