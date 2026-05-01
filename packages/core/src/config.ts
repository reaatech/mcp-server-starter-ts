import { z } from 'zod';

import type { ZodDefault, ZodEffects, ZodNumber } from 'zod';

const positiveInt = (
  name: string,
  defaultValue: string,
): ZodEffects<ZodDefault<ZodNumber>, number, unknown> =>
  z.coerce
    .number()
    .default(Number.parseInt(defaultValue, 10))
    .refine((val) => !Number.isNaN(val) && val > 0, {
      message: `${name} must be a positive number`,
    });

const envSchema = z
  .object({
    PORT: z
      .string()
      .default('8080')
      .transform((val) => Number.parseInt(val, 10))
      .refine((val) => !Number.isNaN(val) && val > 0 && val <= 65535, {
        message: 'PORT must be a valid port number (1-65535)',
      }),

    NODE_ENV: z
      .string()
      .default('development')
      .refine(
        (val): val is 'development' | 'production' | 'test' =>
          ['development', 'production', 'test'].includes(val),
        {
          message: "NODE_ENV must be one of: 'development', 'production', 'test'",
        },
      ),

    CORS_ORIGIN: z.string().default('*'),

    API_KEY: z.string().optional(),

    AUTH_MODE: z
      .string()
      .default('api-key')
      .refine((val): val is 'api-key' | 'bearer' => ['api-key', 'bearer'].includes(val)),

    AUTH_BYPASS_IN_DEV: z
      .string()
      .default('true')
      .transform((val) => val === 'true'),

    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),

    OTEL_SERVICE_NAME: z.string().default('mcp-server'),

    OTEL_RESOURCE_ATTRIBUTES: z.string().optional(),

    IDEMPOTENCY_TTL_MS: positiveInt('IDEMPOTENCY_TTL_MS', '300000'),

    RATE_LIMIT_RPM: positiveInt('RATE_LIMIT_RPM', '60'),

    LOG_LEVEL: z
      .string()
      .default('info')
      .refine(
        (val): val is 'debug' | 'info' | 'warn' | 'error' =>
          ['debug', 'info', 'warn', 'error'].includes(val),
        {
          message: "LOG_LEVEL must be one of: 'debug', 'info', 'warn', 'error'",
        },
      ),

    SESSION_TIMEOUT_MS: positiveInt('SESSION_TIMEOUT_MS', '1800000'),

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

function loadEnvConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errors = parsed.error.issues
      .map(
        (err: { path: PropertyKey[]; message: string }) =>
          `  - ${err.path.join('.')}: ${err.message}`,
      )
      .join('\n');
    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return parsed.data;
}

let cachedEnvConfig: EnvConfig | undefined;

export function getEnvConfig(): EnvConfig {
  cachedEnvConfig ??= loadEnvConfig();
  return cachedEnvConfig;
}

export function resetEnvConfigCache(): void {
  cachedEnvConfig = undefined;
}

export const envConfig = new Proxy({} as EnvConfig, {
  get(_target, property: keyof EnvConfig) {
    return getEnvConfig()[property];
  },
});

export function isProduction(): boolean {
  return envConfig.NODE_ENV === 'production';
}

export function isDevelopment(): boolean {
  return envConfig.NODE_ENV === 'development';
}

export function isTest(): boolean {
  return envConfig.NODE_ENV === 'test';
}
