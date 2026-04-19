/**
 * Environment configuration with Zod validation.
 *
 * This module validates all environment variables at startup and
 * fails fast if required variables are missing or invalid.
 */

import { z } from 'zod';

const positiveInt = (
  name: string,
  defaultValue: string
): z.ZodType<number, z.ZodTypeDef, string | undefined> =>
  z
    .string()
    .default(defaultValue)
    .transform((val) => parseInt(val, 10))
    .refine((val) => !Number.isNaN(val) && val > 0, {
      message: `${name} must be a positive number`,
    });

const envSchema = z
  .object({
    /** Server port */
    PORT: z
      .string()
      .default('8080')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !Number.isNaN(val) && val > 0 && val <= 65535, {
        message: 'PORT must be a valid port number (1-65535)',
      }),

    /** Node environment */
    NODE_ENV: z
      .string()
      .default('development')
      .refine(
        (val): val is 'development' | 'production' | 'test' =>
          ['development', 'production', 'test'].includes(val),
        {
          message: "NODE_ENV must be one of: 'development', 'production', 'test'",
        }
      ),

    /** CORS allowed origins (* for all, comma-separated list) */
    CORS_ORIGIN: z.string().default('*'),

    /** API key for authentication (required in production) */
    API_KEY: z.string().optional(),

    /** Authentication mode: 'api-key' or 'bearer' */
    AUTH_MODE: z
      .string()
      .default('api-key')
      .refine((val): val is 'api-key' | 'bearer' => ['api-key', 'bearer'].includes(val)),

    /** Allow auth bypass outside production when no API key is configured */
    AUTH_BYPASS_IN_DEV: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),

    /** OpenTelemetry OTLP exporter endpoint */
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

    /** OpenTelemetry service name */
    OTEL_SERVICE_NAME: z.string().default('mcp-server'),

    /** Additional OpenTelemetry resource attributes */
    OTEL_RESOURCE_ATTRIBUTES: z.string().optional(),

    /** Idempotency cache TTL in milliseconds */
    IDEMPOTENCY_TTL_MS: positiveInt('IDEMPOTENCY_TTL_MS', '300000'),

    /** Rate limit requests per minute per client */
    RATE_LIMIT_RPM: positiveInt('RATE_LIMIT_RPM', '60'),

    /** Log level */
    LOG_LEVEL: z
      .string()
      .default('info')
      .refine(
        (val): val is 'debug' | 'info' | 'warn' | 'error' =>
          ['debug', 'info', 'warn', 'error'].includes(val),
        {
          message: "LOG_LEVEL must be one of: 'debug', 'info', 'warn', 'error'",
        }
      ),

    /** Session timeout in milliseconds */
    SESSION_TIMEOUT_MS: positiveInt('SESSION_TIMEOUT_MS', '1800000'),

    /** Optional comma/newline-separated additional sanitization patterns */
    SANITIZATION_DENY_PATTERNS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_KEY'],
        message: 'API_KEY is required when NODE_ENV=production',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables.
 * Throws if validation fails - fail fast on startup.
 */
function loadEnvConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.errors
      .map((err) => `  - ${err.path.join('.')}: ${err.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return parsed.data;
}

/**
 * Cached validated environment configuration.
 */
let cachedEnvConfig: EnvConfig | undefined;

/**
 * Get the validated environment configuration.
 * The result is cached for runtime use and can be reset in tests.
 */
export function getEnvConfig(): EnvConfig {
  cachedEnvConfig ??= loadEnvConfig();
  return cachedEnvConfig;
}

/**
 * Reset the cached env config.
 * Primarily for tests that mutate process.env.
 */
export function resetEnvConfigCache(): void {
  cachedEnvConfig = undefined;
}

/**
 * Backwards-compatible env accessor.
 */
export const envConfig = new Proxy({} as EnvConfig, {
  get(_target, property: keyof EnvConfig) {
    return getEnvConfig()[property];
  },
});

export function isProduction(): boolean {
  return envConfig.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return envConfig.NODE_ENV === 'development';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return envConfig.NODE_ENV === 'test';
}
