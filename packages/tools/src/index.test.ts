import { describe, expect, it } from 'vitest';

describe('package entry point', () => {
  it('exports all public API members', async () => {
    const mod = await import('./index.js');
    expect(mod.clearTools).toBeTypeOf('function');
    expect(mod.defineTool).toBeTypeOf('function');
    expect(mod.discoverTools).toBeTypeOf('function');
    expect(mod.getTool).toBeTypeOf('function');
    expect(mod.getTools).toBeTypeOf('function');
    expect(mod.registerTool).toBeTypeOf('function');
  });
});
