/**
 * Structured logging with pino.
 *
 * Provides a consistent logging interface across the application
 * with automatic request_id correlation and PII redaction.
 */

import { createHash } from 'node:crypto';
import pino from 'pino';
import { envConfig, isDevelopment } from '../config/env.js';
import type { RequestContext } from '../types/domain.js';

/**
 * Fields that should be redacted from logs to prevent PII leakage.
 */
const REDACTED_FIELDS = [
  'apiKey',
  'password',
  'secret',
  'token',
  'authorization',
  'x-api-key',
  'email',
  'phone',
  'ssn',
  'creditCard',
];

/**
 * Create the base pino logger instance.
 */
function createLogger(): pino.Logger {
  const options: pino.LoggerOptions = {
    level: envConfig.LOG_LEVEL,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: [
        ...REDACTED_FIELDS.map((field) => `$.${field}`),
        ...REDACTED_FIELDS.map((field) => `*.${field}`),
      ],
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (isDevelopment() && !process.env.JEST_WORKER_ID) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  return pino(options);
}

/**
 * Base logger instance.
 */
export const logger = createLogger();

/**
 * Create a child logger with request context.
 * This should be called at the start of each request to ensure
 * all logs within that request include the request_id.
 */
export function createRequestLogger(
  context: RequestContext,
  additionalFields?: Record<string, unknown>
): pino.Logger {
  const childFields: Record<string, unknown> = {
    request_id: context.requestId,
    session_id: context.sessionId,
    ...additionalFields,
  };

  return logger.child(childFields);
}

/**
 * Log a tool execution event with standardized fields.
 */
export function logToolExecution(params: {
  toolName: string;
  action: string;
  durationMs: number;
  success: boolean;
  error?: string;
  context: RequestContext;
}): void {
  const { toolName, action, durationMs, success, error, context } = params;

  if (success) {
    logger.info(
      {
        tool: toolName,
        action,
        durationMs,
        request_id: context.requestId,
      },
      'Tool execution completed'
    );
  } else {
    logger.error(
      {
        tool: toolName,
        action,
        durationMs,
        error,
        request_id: context.requestId,
      },
      'Tool execution failed'
    );
  }
}

/**
 * Log a middleware event with standardized fields.
 */
export function logMiddlewareEvent(params: {
  middleware: string;
  action: string;
  success: boolean;
  details?: Record<string, unknown>;
  context?: RequestContext | undefined;
}): void {
  const { middleware, action, success, details, context } = params;

  const baseFields: Record<string, unknown> = {
    middleware,
    action,
  };

  if (context?.requestId) {
    baseFields.request_id = context.requestId;
  }

  if (details) {
    Object.assign(baseFields, details);
  }

  if (success) {
    logger.debug(baseFields, `Middleware ${middleware} ${action}`);
  } else {
    logger.warn(baseFields, `Middleware ${middleware} ${action}`);
  }
}

export function safeLog(fields: { event: string; userId?: string; [key: string]: unknown }): void {
  const safeFields: Record<string, unknown> = { ...fields };

  // Hash any userId field to prevent PII in logs
  if (fields.userId) {
    safeFields.userId = createHash('sha256').update(fields.userId).digest('hex').slice(0, 16);
  }

  logger.info(safeFields, fields.event);
}
