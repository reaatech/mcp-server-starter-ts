import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import type { ToolContext } from '@reaatech/mcp-server-core';
import { SERVER_INFO } from '@reaatech/mcp-server-core';
import {
  logger,
  recordError,
  recordToolInvocation,
  withSpan,
} from '@reaatech/mcp-server-observability';
import type { ToolDefinition } from '@reaatech/mcp-server-tools';

export function createMcpServer(tools: ToolDefinition[]): McpServer {
  const server = new McpServer(
    {
      name: SERVER_INFO.name,
      version: SERVER_INFO.version,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );
  const registerTool = server.tool.bind(server) as (...args: unknown[]) => void;

  for (const tool of tools) {
    registerTool(
      tool.name,
      tool.description,
      tool.inputSchema.shape,
      async (args: unknown, extra: { requestId?: string; sessionId?: string }) => {
        const startTime = Date.now();
        const requestId = extra.requestId;

        try {
          logger.debug(
            {
              tool: tool.name,
              request_id: requestId,
            },
            'Tool execution started',
          );

          const result = await withSpan(
            `mcp.tool.${tool.name}`,
            async () =>
              tool.handler(
                args as Record<string, unknown>,
                {
                  request: {
                    requestId: requestId ?? 'unknown',
                    ...(typeof extra.sessionId === 'string' && {
                      sessionId: extra.sessionId,
                    }),
                  },
                } as ToolContext,
              ),
            {
              'mcp.tool.name': tool.name,
              'mcp.request.id': requestId ?? 'unknown',
            },
          );

          const durationMs = Date.now() - startTime;
          recordToolInvocation({
            toolName: tool.name,
            status: result.isError ? 'error' : 'success',
            durationMs,
          });

          logger.info(
            {
              tool: tool.name,
              durationMs,
              request_id: requestId,
            },
            'Tool execution completed',
          );

          const content: ContentBlock[] = result.content.map((c) => {
            if (c.type === 'text') {
              return { type: 'text', text: c.text };
            }
            if (c.type === 'image') {
              return {
                type: 'image',
                data: c.data,
                mimeType: c.mimeType,
              };
            }
            if ('uri' in c && c.uri) {
              if (c.blob !== undefined) {
                return {
                  type: 'resource',
                  resource: {
                    uri: c.uri,
                    blob: c.blob,
                    ...(c.mimeType && { mimeType: c.mimeType }),
                  },
                } as ContentBlock;
              }
              return {
                type: 'resource',
                resource: {
                  uri: c.uri,
                  text: c.text ?? '',
                  ...(c.mimeType && { mimeType: c.mimeType }),
                },
              } as ContentBlock;
            }
            if ('resource' in c) {
              return c as ContentBlock;
            }
            return c as unknown as ContentBlock;
          });

          return {
            content,
            ...(result.isError && { isError: true }),
          };
        } catch (error) {
          const durationMs = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          recordToolInvocation({
            toolName: tool.name,
            status: 'error',
            durationMs,
          });
          recordError({
            errorType: 'tool_execution',
            toolName: tool.name,
          });

          logger.error(
            {
              tool: tool.name,
              durationMs,
              error: errorMessage,
              request_id: requestId,
            },
            'Tool execution failed',
          );

          return {
            content: [{ type: 'text' as const, text: `Error: ${errorMessage}` }],
            isError: true,
          };
        }
      },
    );
  }

  logger.info(
    {
      toolCount: tools.length,
      tools: tools.map((t) => t.name),
    },
    'MCP server created with tools',
  );

  return server;
}

export function getServerVersion(): string {
  return SERVER_INFO.version;
}

export function getServerName(): string {
  return SERVER_INFO.name;
}
