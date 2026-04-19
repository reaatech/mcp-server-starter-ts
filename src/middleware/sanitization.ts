/**
 * Input sanitization middleware.
 *
 * Strips known prompt-injection patterns from string inputs
 * to tool calls. Provides defense-in-depth against injection attacks.
 */

import type { Request, Response, NextFunction } from 'express';
import { envConfig } from '../config/env.js';
import { logMiddlewareEvent } from '../observability/logger.js';

/**
 * Known prompt-injection patterns to strip from inputs.
 * These are common vectors used in prompt injection attacks.
 */
const INJECTION_PATTERNS: { pattern: RegExp; description: string }[] = [
  // Script injection
  {
    pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    description: 'script tags',
  },
  // JavaScript protocol
  {
    pattern: /javascript\s*:/gi,
    description: 'javascript: protocol',
  },
  // Event handlers
  {
    pattern: /on\w+\s*=\s*["'][^"']*["']/gi,
    description: 'inline event handlers',
  },
  {
    pattern: /on\w+\s*=\s*[^\s"'][^\s]*/gi,
    description: 'inline event handlers (unquoted)',
  },
  // Iframe injection
  {
    pattern: /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
    description: 'iframe tags',
  },
  // Object/embed injection
  {
    pattern: /<(object|embed|applet)\b[^<]*<\/\1>/gi,
    description: 'object/embed/applet tags',
  },
  // Data URI with potential script
  {
    pattern: /data\s*:\s*(text\/html|application\/xhtml\+xml)/gi,
    description: 'data URI with HTML',
  },
  // SVG with script
  {
    pattern: /<svg[^>]*>[\s\S]*?<script/gi,
    description: 'SVG with script',
  },
  // Common prompt injection phrases (case-insensitive)
  {
    pattern: /\bignore\s+previous\s+instructions\b/gi,
    description: 'prompt injection phrase',
  },
  {
    pattern: /\bforget\s+all\s+(previous|prior)\s+instructions\b/gi,
    description: 'prompt injection phrase',
  },
  {
    pattern: /\byou\s+are\s+now\s+in\s+developer\s+mode\b/gi,
    description: 'developer mode injection',
  },
  {
    pattern: /\bsystem:\s*override\b/gi,
    description: 'system override injection',
  },
];

/**
 * Sanitize a string by removing known injection patterns.
 * Returns the sanitized string and a list of patterns that were stripped.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function sanitizeString(
  input: string,
  patterns: { pattern: RegExp; description: string }[] = [
    ...INJECTION_PATTERNS,
    ...getConfiguredPatterns(),
  ]
): { sanitized: string; stripped: string[] } {
  const stripped: string[] = [];
  let sanitized = input;

  for (const { pattern, description } of patterns) {
    const matches = sanitized.match(pattern);
    if (matches && matches.length > 0) {
      stripped.push(description);
      sanitized = sanitized.replace(pattern, '');
    }
  }

  return { sanitized, stripped };
}

/**
 * Recursively sanitize all string values in an object.
 */
export function sanitizeObject(
  obj: unknown,
  patterns: { pattern: RegExp; description: string }[]
): { sanitized: unknown; stripped: string[] } {
  const allStripped: string[] = [];

  function process(value: unknown): unknown {
    if (typeof value === 'string') {
      const { sanitized, stripped } = sanitizeString(value, patterns);
      allStripped.push(...stripped);
      return sanitized;
    }

    if (Array.isArray(value)) {
      return value.map((item) => process(item));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        result[key] = process(val);
      }
      return result;
    }

    return value;
  }

  const sanitized = process(obj);
  return { sanitized, stripped: allStripped };
}

/**
 * Input sanitization middleware.
 *
 * Scans request body for string inputs and strips known
 * prompt-injection patterns. Logs sanitization events
 * without logging the raw input content.
 */
export function sanitizationMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const context = req.requestContext;

    if (!req.body || typeof req.body !== 'object') {
      next();
      return;
    }

    const patterns = [...INJECTION_PATTERNS, ...getConfiguredPatterns()];
    const { sanitized, stripped } = sanitizeObject(req.body, patterns);

    if (stripped.length > 0) {
      logMiddlewareEvent({
        middleware: 'sanitization',
        action: 'patterns stripped',
        success: false,
        details: {
          patternsStripped: stripped,
          patternCount: stripped.length,
        },
        ...(context && { context }),
      });

      // Replace request body with sanitized version
      req.body = sanitized;
    }

    next();
  };
}

/**
 * Export patterns for testing
 */
export { INJECTION_PATTERNS };

/**
 * Get configured deny-list patterns from environment
 */
export function getConfiguredPatterns(): { pattern: RegExp; description: string }[] {
  const configured =
    envConfig.SANITIZATION_DENY_PATTERNS?.split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean) ?? [];

  return configured.map((value) => ({
    pattern: new RegExp(escapeRegExp(value), 'gi'),
    description: `configured deny-list pattern: ${value}`,
  }));
}
