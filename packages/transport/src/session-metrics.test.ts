import { describe, expect, it } from 'vitest';
import { updateTransportSessionCount } from './index.js';

describe('transport', () => {
  it('exports session metrics function', () => {
    expect(typeof updateTransportSessionCount).toBe('function');
  });
});
