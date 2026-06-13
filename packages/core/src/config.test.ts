import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  envConfig,
  getEnvConfig,
  isDevelopment,
  isProduction,
  isTest,
  resetEnvConfigCache,
} from './config.js';

const ENV_KEYS = [
  'PORT',
  'NODE_ENV',
  'CORS_ORIGIN',
  'API_KEY',
  'AUTH_MODE',
  'AUTH_BYPASS_IN_DEV',
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'OTEL_SERVICE_NAME',
  'OTEL_RESOURCE_ATTRIBUTES',
  'IDEMPOTENCY_TTL_MS',
  'RATE_LIMIT_RPM',
  'LOG_LEVEL',
  'SESSION_TIMEOUT_MS',
  'SANITIZATION_DENY_PATTERNS',
] as const;

let initialEnv: Partial<Record<string, string | undefined>>;

beforeEach(() => {
  initialEnv = {};
  for (const key of ENV_KEYS) {
    initialEnv[key] = process.env[key];
  }
  resetEnvConfigCache();
});

afterEach(() => {
  for (const [key, value] of Object.entries(initialEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  resetEnvConfigCache();
});

describe('getEnvConfig', () => {
  it('returns default values', () => {
    const config = getEnvConfig();
    expect(config.PORT).toBe(8080);
    expect(config.CORS_ORIGIN).toBe('*');
    expect(config.AUTH_MODE).toBe('api-key');
    expect(config.AUTH_BYPASS_IN_DEV).toBe(true);
    expect(config.OTEL_SERVICE_NAME).toBe('mcp-server');
    expect(config.IDEMPOTENCY_TTL_MS).toBe(300000);
    expect(config.RATE_LIMIT_RPM).toBe(60);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.SESSION_TIMEOUT_MS).toBe(1800000);
  });

  it('reads values from environment variables', () => {
    process.env.PORT = '3000';
    process.env.CORS_ORIGIN = 'http://example.com';
    process.env.AUTH_MODE = 'bearer';
    process.env.LOG_LEVEL = 'debug';
    process.env.IDEMPOTENCY_TTL_MS = '60000';
    process.env.RATE_LIMIT_RPM = '120';
    process.env.SESSION_TIMEOUT_MS = '3600000';
    process.env.AUTH_BYPASS_IN_DEV = 'false';
    process.env.OTEL_SERVICE_NAME = 'my-service';
    resetEnvConfigCache();

    const config = getEnvConfig();
    expect(config.PORT).toBe(3000);
    expect(config.CORS_ORIGIN).toBe('http://example.com');
    expect(config.AUTH_MODE).toBe('bearer');
    expect(config.LOG_LEVEL).toBe('debug');
    expect(config.IDEMPOTENCY_TTL_MS).toBe(60000);
    expect(config.RATE_LIMIT_RPM).toBe(120);
    expect(config.SESSION_TIMEOUT_MS).toBe(3600000);
    expect(config.AUTH_BYPASS_IN_DEV).toBe(false);
    expect(config.OTEL_SERVICE_NAME).toBe('my-service');
  });

  it('accepts optional env vars', () => {
    process.env.API_KEY = 'sk-test';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://otel.example.com:4318';
    process.env.OTEL_RESOURCE_ATTRIBUTES = 'service.version=1.0';
    process.env.SANITIZATION_DENY_PATTERNS = '<script>,alert(';
    resetEnvConfigCache();

    const config = getEnvConfig();
    expect(config.API_KEY).toBe('sk-test');
    expect(config.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://otel.example.com:4318');
    expect(config.OTEL_RESOURCE_ATTRIBUTES).toBe('service.version=1.0');
    expect(config.SANITIZATION_DENY_PATTERNS).toBe('<script>,alert(');
  });

  it('caches the config singleton', () => {
    const config1 = getEnvConfig();
    const config2 = getEnvConfig();
    expect(config1).toBe(config2);
  });

  it('creates new config after cache reset', () => {
    const config1 = getEnvConfig();
    resetEnvConfigCache();
    const config2 = getEnvConfig();
    expect(config1).not.toBe(config2);
  });
});

describe('PORT validation', () => {
  it('rejects PORT > 65535', () => {
    process.env.PORT = '65536';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('rejects PORT <= 0', () => {
    process.env.PORT = '0';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('rejects non-numeric PORT', () => {
    process.env.PORT = 'abc';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('accepts valid port 443', () => {
    process.env.PORT = '443';
    resetEnvConfigCache();
    expect(getEnvConfig().PORT).toBe(443);
  });
});

describe('NODE_ENV validation', () => {
  it('rejects invalid NODE_ENV', () => {
    process.env.NODE_ENV = 'staging';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('accepts development', () => {
    process.env.NODE_ENV = 'development';
    resetEnvConfigCache();
    expect(getEnvConfig().NODE_ENV).toBe('development');
  });

  it('accepts production', () => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'sk-xxx';
    resetEnvConfigCache();
    expect(getEnvConfig().NODE_ENV).toBe('production');
  });

  it('accepts test', () => {
    process.env.NODE_ENV = 'test';
    resetEnvConfigCache();
    expect(getEnvConfig().NODE_ENV).toBe('test');
  });
});

describe('production requires API_KEY', () => {
  it('rejects production without API_KEY', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.API_KEY;
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow('API_KEY is required');
  });
});

describe('AUTH_MODE validation', () => {
  it('rejects invalid auth mode', () => {
    process.env.AUTH_MODE = 'oauth';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });
});

describe('LOG_LEVEL validation', () => {
  it('rejects invalid log level', () => {
    process.env.LOG_LEVEL = 'trace';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });
});

describe('AUTH_BYPASS_IN_DEV', () => {
  it('parses true string', () => {
    process.env.AUTH_BYPASS_IN_DEV = 'true';
    resetEnvConfigCache();
    expect(getEnvConfig().AUTH_BYPASS_IN_DEV).toBe(true);
  });

  it('parses false string', () => {
    process.env.AUTH_BYPASS_IN_DEV = 'false';
    resetEnvConfigCache();
    expect(getEnvConfig().AUTH_BYPASS_IN_DEV).toBe(false);
  });

  it('defaults to true', () => {
    const config = getEnvConfig();
    expect(config.AUTH_BYPASS_IN_DEV).toBe(true);
  });
});

describe('OTEL endpoint validation', () => {
  it('rejects invalid URL for OTEL endpoint', () => {
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'not-a-valid-url';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });
});

describe('positiveInt fields', () => {
  it('rejects negative IDEMPOTENCY_TTL_MS', () => {
    process.env.IDEMPOTENCY_TTL_MS = '-1';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('rejects zero IDEMPOTENCY_TTL_MS', () => {
    process.env.IDEMPOTENCY_TTL_MS = '0';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('rejects non-numeric RATE_LIMIT_RPM', () => {
    process.env.RATE_LIMIT_RPM = 'abc';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('rejects non-positive SESSION_TIMEOUT_MS', () => {
    process.env.SESSION_TIMEOUT_MS = '-100';
    resetEnvConfigCache();
    expect(() => getEnvConfig()).toThrow();
  });

  it('accepts valid positiveInt values', () => {
    process.env.IDEMPOTENCY_TTL_MS = '5000';
    process.env.RATE_LIMIT_RPM = '30';
    process.env.SESSION_TIMEOUT_MS = '900000';
    resetEnvConfigCache();

    const config = getEnvConfig();
    expect(config.IDEMPOTENCY_TTL_MS).toBe(5000);
    expect(config.RATE_LIMIT_RPM).toBe(30);
    expect(config.SESSION_TIMEOUT_MS).toBe(900000);
  });
});

describe('envConfig proxy', () => {
  it('provides direct property access to env config', () => {
    expect(envConfig.NODE_ENV).toBe('test');
    expect(envConfig.PORT).toBe(8080);
  });
});

describe('environment helpers', () => {
  describe('isProduction', () => {
    it('returns true when NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'sk-xxx';
      resetEnvConfigCache();
      expect(isProduction()).toBe(true);
    });

    it('returns false when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      resetEnvConfigCache();
      expect(isProduction()).toBe(false);
    });

    it('returns false when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      resetEnvConfigCache();
      expect(isProduction()).toBe(false);
    });
  });

  describe('isDevelopment', () => {
    it('returns true when NODE_ENV=development', () => {
      process.env.NODE_ENV = 'development';
      resetEnvConfigCache();
      expect(isDevelopment()).toBe(true);
    });

    it('returns false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'sk-xxx';
      resetEnvConfigCache();
      expect(isDevelopment()).toBe(false);
    });

    it('returns false when NODE_ENV is test', () => {
      process.env.NODE_ENV = 'test';
      resetEnvConfigCache();
      expect(isDevelopment()).toBe(false);
    });
  });

  describe('isTest', () => {
    it('returns true when NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';
      resetEnvConfigCache();
      expect(isTest()).toBe(true);
    });

    it('returns false when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'sk-xxx';
      resetEnvConfigCache();
      expect(isTest()).toBe(false);
    });

    it('returns false when NODE_ENV is development', () => {
      process.env.NODE_ENV = 'development';
      resetEnvConfigCache();
      expect(isTest()).toBe(false);
    });
  });
});
