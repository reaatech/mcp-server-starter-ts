/**
 * Unit tests for health-check tool
 */

import healthCheckTool from '../../../src/tools/health-check.tool.js';

describe('health-check tool', () => {
  describe('handler', () => {
    it('should return server status', async () => {
      const result = await healthCheckTool.handler({}, { request: { requestId: 'test-id' } });

      expect(result.content).toHaveLength(1);
      const content = result.content[0];
      expect(content).toBeDefined();
      if (content) {
        expect(content.type).toBe('text');
        if (content.type === 'text') {
          const data = JSON.parse(content.text);
          expect(data).toHaveProperty('status');
          expect(data).toHaveProperty('uptime');
          expect(data).toHaveProperty('version');
          expect(data).toHaveProperty('timestamp');
          expect(data.status).toBe('healthy');
        }
      }
    });

    it('should return positive uptime', async () => {
      const result = await healthCheckTool.handler({}, { request: { requestId: 'test-id' } });

      const content = result.content[0];
      expect(content).toBeDefined();
      if (content?.type === 'text') {
        const data = JSON.parse(content.text);
        expect(data.uptime).toBeGreaterThanOrEqual(0);
      }
    });

    it('should include memory usage', async () => {
      const result = await healthCheckTool.handler({}, { request: { requestId: 'test-id' } });

      const content = result.content[0];
      expect(content).toBeDefined();
      if (content?.type === 'text') {
        const data = JSON.parse(content.text);
        expect(data).toHaveProperty('memory');
        expect(data.memory).toHaveProperty('heapUsed');
        expect(data.memory).toHaveProperty('rss');
      }
    });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(healthCheckTool.name).toBe('health-check');
    });

    it('should have description', () => {
      expect(healthCheckTool.description).toBeTruthy();
    });

    it('should have empty input schema', () => {
      const schema = healthCheckTool.inputSchema;
      const parsed = schema.safeParse({});
      expect(parsed.success).toBe(true);
    });
  });
});
