import { describe, expect, it } from 'vitest';
import { authMiddleware } from './index.js';

describe('auth', () => {
  it('exports authMiddleware function', () => {
    const middleware = authMiddleware();
    expect(typeof middleware).toBe('function');
  });
});
