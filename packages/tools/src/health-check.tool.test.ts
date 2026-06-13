import { afterEach, describe, expect, it, vi } from 'vitest';
import healthCheckTool from './health-check.tool.js';

const mockContext = { request: { requestId: 'test' } };

describe('health-check tool', () => {
  it('has the correct name and description', () => {
    expect(healthCheckTool.name).toBe('health-check');
    expect(healthCheckTool.description).toContain('health');
  });

  it('has an empty input schema that accepts any object', () => {
    const result = healthCheckTool.inputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('returns a health check response with expected fields', async () => {
    const result = await healthCheckTool.handler({}, mockContext);
    expect(result.content).toHaveLength(1);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('healthy');
    expect(payload.name).toBeDefined();
    expect(payload.version).toBeDefined();
    expect(payload.environment).toBeDefined();
    expect(payload.uptime).toBeGreaterThanOrEqual(0);
    expect(payload.uptimeHuman).toBeDefined();
    expect(payload.timestamp).toBeDefined();
    expect(payload.memory).toBeDefined();
    expect(payload.memory.heapUsed).toBeGreaterThan(0);
    expect(payload.checks).toEqual({ readiness: 'ready', liveness: 'alive' });
  });

  it('returns uptimeHuman in a readable format', async () => {
    const result = await healthCheckTool.handler({}, mockContext);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.uptimeHuman).toMatch(/\d+s$/);
  });

  it('returns an ISO timestamp', async () => {
    const result = await healthCheckTool.handler({}, mockContext);
    const payload = JSON.parse(result.content[0].text);
    expect(new Date(payload.timestamp).toISOString()).toBe(payload.timestamp);
  });
});

describe('formatUptime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats uptime with minutes when < 1 hour', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(125);
    const result = await healthCheckTool.handler({}, mockContext);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.uptimeHuman).toMatch(/^2m \d+s$/);
  });

  it('formats uptime with hours when >= 1 hour', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(3661);
    const result = await healthCheckTool.handler({}, mockContext);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.uptimeHuman).toBe('1h 1m 1s');
  });

  it('formats uptime with days when >= 1 day', async () => {
    vi.spyOn(process, 'uptime').mockReturnValue(90061);
    const result = await healthCheckTool.handler({}, mockContext);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.uptimeHuman).toBe('1d 1h 1m 1s');
  });
});
