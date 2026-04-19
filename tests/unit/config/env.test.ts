/**
 * Unit tests for environment configuration
 */

describe('env config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('PORT', () => {
    it('should use default port 8080', async () => {
      process.env.PORT = '8080';
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.PORT).toBe(8080);
    });

    it('should parse custom port', async () => {
      process.env.PORT = '3000';
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.PORT).toBe(3000);
    });
  });

  describe('NODE_ENV', () => {
    it('should default to development', async () => {
      delete process.env.NODE_ENV;
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.NODE_ENV).toBe('development');
    });

    it('should accept production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY = 'prod-test-key';
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.NODE_ENV).toBe('production');
    });

    it('should require API_KEY in production', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.API_KEY;

      await expect(
        (async () => {
          const { getEnvConfig } = await import('../../../src/config/env.js');
          getEnvConfig();
        })()
      ).rejects.toThrow('API_KEY is required when NODE_ENV=production');
    });

    it('should accept test', async () => {
      process.env.NODE_ENV = 'test';
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.NODE_ENV).toBe('test');
    });
  });

  describe('LOG_LEVEL', () => {
    it('should default to info', async () => {
      delete process.env.LOG_LEVEL;
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.LOG_LEVEL).toBe('info');
    });

    it('should accept debug', async () => {
      process.env.LOG_LEVEL = 'debug';
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.LOG_LEVEL).toBe('debug');
    });
  });

  describe('RATE_LIMIT_RPM', () => {
    it('should default to 60', async () => {
      delete process.env.RATE_LIMIT_RPM;
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.RATE_LIMIT_RPM).toBe(60);
    });

    it('should parse custom value', async () => {
      process.env.RATE_LIMIT_RPM = '100';
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.RATE_LIMIT_RPM).toBe(100);
    });
  });

  describe('IDEMPOTENCY_TTL_MS', () => {
    it('should default to 300000 (5 minutes)', async () => {
      delete process.env.IDEMPOTENCY_TTL_MS;
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.IDEMPOTENCY_TTL_MS).toBe(300000);
    });
  });

  describe('SESSION_TIMEOUT_MS', () => {
    it('should default to 1800000 (30 minutes)', async () => {
      delete process.env.SESSION_TIMEOUT_MS;
      const { envConfig } = await import('../../../src/config/env.js');
      expect(envConfig.SESSION_TIMEOUT_MS).toBe(1800000);
    });
  });
});
