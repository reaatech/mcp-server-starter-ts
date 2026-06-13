import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestContext } from '@reaatech/mcp-server-core';
import { logger } from '@reaatech/mcp-server-observability';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { handleStreamableHTTPDelete, handleStreamableHTTPRequest } from './core.js';

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

function getRequestContext(request: FastifyRequest): RequestContext | undefined {
  return (request as FastifyRequest & { requestContext?: RequestContext }).requestContext;
}

/**
 * Fastify plugin that mounts the MCP Streamable HTTP transport.
 *
 * Registers `POST {path}` (client→server messages, may return a JSON response or
 * a long-lived SSE stream) and `DELETE {path}` (session termination), reading and
 * writing the `mcp-session-id` header exactly as the Express adapter does.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import { fastifyStreamableHTTP } from '@reaatech/mcp-server-transport';
 *
 * const app = Fastify();
 * await app.register(fastifyStreamableHTTP, { serverFactory, path: '/mcp' });
 * await app.listen({ port: 8080 });
 * ```
 *
 * The `POST` handler calls `reply.hijack()` before handing `reply.raw` to the SDK
 * transport so Fastify never tries to serialize or auto-close the response — the
 * transport owns the socket for both JSON and SSE replies.
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
