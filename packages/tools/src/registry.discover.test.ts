import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { discoverTools } from './registry.js';

const toolsDir = path.resolve(process.cwd(), 'src/tools');
const testToolPath = path.join(toolsDir, 'my-test.tool.ts');
const testToolContent = `
import { textContent } from '@reaatech/mcp-server-core';
import { z } from 'zod';
import { defineTool } from '../registry.js';
export default defineTool({
  name: 'my-test',
  description: 'A test tool discovered from filesystem',
  inputSchema: z.object({}),
  handler: async () => ({ content: [textContent('custom')] }),
});
`;

const mockContext = { request: { requestId: 'test' } };

describe('discoverTools with filesystem discovery', () => {
  beforeAll(async () => {
    await mkdir(toolsDir, { recursive: true });
    await writeFile(testToolPath, testToolContent);
  });

  afterAll(async () => {
    await rm(testToolPath);
    await rm(toolsDir, { recursive: true, force: true });
  });

  it('discovers built-in tools and custom tool from filesystem', async () => {
    const tools = await discoverTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toContain('echo');
    expect(names).toContain('health-check');
    expect(names).toContain('my-test');
  });

  it('registers filesystem-discovered tools', async () => {
    const tools = await discoverTools();
    const myTest = tools.find((t) => t.name === 'my-test');
    expect(myTest).toBeDefined();
    expect(myTest?.description).toBe('A test tool discovered from filesystem');
  });

  it('custom tool handler works', async () => {
    const tools = await discoverTools();
    const myTest = tools.find((t) => t.name === 'my-test');
    if (!myTest) throw new Error('Expected my-test tool to be discovered');
    const result = await myTest.handler({}, mockContext);
    expect(result.content[0]).toEqual({ type: 'text', text: 'custom' });
  });

  it('excludes .d.ts files from discovery', async () => {
    const dtsPath = path.join(toolsDir, 'ignored.d.ts');
    await writeFile(dtsPath, 'export type Foo = string;');
    const tools = await discoverTools();
    const names = tools.map((t) => t.name);
    expect(names).not.toContain('ignored');
    await rm(dtsPath);
  });
});
