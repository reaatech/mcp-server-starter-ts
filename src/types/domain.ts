/**
 * Shared domain types and Zod schemas for the MCP server.
 *
 * This module defines the core types used across the application,
 * including tool input/output schemas and common interfaces.
 */

import { z } from 'zod';

/**
 * Type inference helper for tool inputs
 */
export type ToolInput<T extends z.ZodType> = z.infer<T>;

/**
 * Standard MCP content block types
 */
export const TextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const ImageContentSchema = z.object({
  type: z.literal('image'),
  data: z.string(),
  mimeType: z.string(),
});

export const ResourceContentSchema = z.object({
  type: z.literal('resource'),
  uri: z.string(),
  mimeType: z.string().optional(),
  text: z.string().optional(),
  blob: z.string().optional(),
});

export const ContentBlockSchema = z.union([
  TextContentSchema,
  ImageContentSchema,
  ResourceContentSchema,
]);

/**
 * Standard MCP tool response structure
 */
export const ToolResponseSchema = z.object({
  content: z.array(ContentBlockSchema),
  isError: z.boolean().optional(),
});

export type ToolResponse = z.infer<typeof ToolResponseSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

/**
 * Helper to create a text content block
 */
export function textContent(text: string): ContentBlock {
  return { type: 'text', text };
}

/**
 * Helper to create an error response
 */
export function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

/**
 * Server health check response
 */
export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  version: z.string(),
  environment: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/**
 * Request context passed through middleware pipeline
 */
export interface RequestContext {
  requestId: string;
  sessionId?: string;
  idempotencyKey?: string;
  apiKey?: string;
  ipAddress?: string;
}

/**
 * Tool execution context available to handlers
 */
export interface ToolContext {
  request: RequestContext;
  session?: SessionData;
}

/**
 * Session data structure
 */
export interface SessionData {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}

/**
 * Rate limit state per client
 */
export interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

/**
 * Idempotency cache entry
 */
export interface IdempotencyEntry {
  key: string;
  response: unknown;
  statusCode: number;
  createdAt: number;
  ttl: number;
}
