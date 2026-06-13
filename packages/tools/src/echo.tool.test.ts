import { describe, expect, it } from 'vitest';
import echoTool from './echo.tool.js';

const mockContext = { request: { requestId: 'test' } };

describe('echo tool', () => {
  it('has the correct name and description', () => {
    expect(echoTool.name).toBe('echo');
    expect(echoTool.description).toContain('Echo');
  });

  it('has a valid input schema', () => {
    const result = echoTool.inputSchema.safeParse({ message: 'hello' });
    expect(result.success).toBe(true);
  });

  it('rejects missing message', () => {
    const result = echoTool.inputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('echoes the input message', async () => {
    const result = await echoTool.handler({ message: 'hello world' }, mockContext);
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toEqual({ type: 'text', text: 'hello world' });
  });

  it('converts non-string message to string', async () => {
    const result = await echoTool.handler({ message: 42 }, mockContext);
    expect(result.content[0].text).toBe('42');
  });

  it('handles empty string message', async () => {
    const result = await echoTool.handler({ message: '' }, mockContext);
    expect(result.content[0].text).toBe('');
  });
});
