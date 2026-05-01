import { z } from 'zod';

export type ToolInput<T extends z.ZodType> = z.infer<T>;

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

export const ToolResponseSchema = z.object({
  content: z.array(ContentBlockSchema),
  isError: z.boolean().optional(),
});

export type ToolResponse = z.infer<typeof ToolResponseSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export function textContent(text: string): ContentBlock {
  return { type: 'text', text };
}

export function errorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: `Error: ${message}` }],
    isError: true,
  };
}

export const HealthStatusSchema = z.object({
  status: z.enum(['healthy', 'unhealthy']),
  version: z.string(),
  environment: z.string(),
  uptime: z.number(),
  timestamp: z.string(),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;

export interface RequestContext {
  requestId: string;
  sessionId?: string;
  idempotencyKey?: string;
  apiKey?: string;
  ipAddress?: string;
}

export interface ToolContext {
  request: RequestContext;
  session?: SessionData;
}

export interface SessionData {
  id: string;
  createdAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}

export interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

export interface IdempotencyEntry {
  key: string;
  response: unknown;
  statusCode: number;
  createdAt: number;
  ttl: number;
}
