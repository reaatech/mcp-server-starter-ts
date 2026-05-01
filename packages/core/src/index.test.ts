import { describe, expect, it } from 'vitest';
import { APP_VERSION, SERVICE_NAME, envConfig, errorResponse, textContent } from './index.js';

describe('core', () => {
  it('exports textContent helper', () => {
    const content = textContent('hello');
    expect(content).toEqual({ type: 'text', text: 'hello' });
  });

  it('exports errorResponse helper', () => {
    const response = errorResponse('something went wrong');
    expect(response.isError).toBe(true);
    expect(response.content[0].type).toBe('text');
  });

  it('exports version constants', () => {
    expect(APP_VERSION).toBeDefined();
    expect(SERVICE_NAME).toBe('mcp-server-starter-ts');
  });

  it('exports env config proxy', () => {
    expect(envConfig).toBeDefined();
    expect(envConfig.NODE_ENV).toBe('test');
  });
});
