import { describe, expect, it } from 'vitest';
import { logger } from './index.js';

describe('observability', () => {
  it('exports a pino logger instance', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});
