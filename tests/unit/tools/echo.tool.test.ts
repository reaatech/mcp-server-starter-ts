/**
 * Unit tests for echo tool
 */

import echoTool from '../../../src/tools/echo.tool.js';

describe('echo tool', () => {
  describe('handler', () => {
    it('should echo back the input message', async () => {
      const result = await echoTool.handler(
        { message: 'Hello, world!' },
        { request: { requestId: 'test-id' } }
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0];
      expect(content).toBeDefined();
      if (content) {
        expect(content.type).toBe('text');
        if (content.type === 'text') {
          expect(content.text).toBe('Hello, world!');
        }
      }
    });

    it('should handle empty string', async () => {
      const result = await echoTool.handler({ message: '' }, { request: { requestId: 'test-id' } });

      const content = result.content[0];
      expect(content).toBeDefined();
      if (content?.type === 'text') {
        expect(content.text).toBe('');
      }
    });

    it('should handle Unicode characters', async () => {
      const result = await echoTool.handler(
        { message: '你好世界 🌍' },
        { request: { requestId: 'test-id' } }
      );

      const content = result.content[0];
      expect(content).toBeDefined();
      if (content?.type === 'text') {
        expect(content.text).toBe('你好世界 🌍');
      }
    });

    it('should handle special characters', async () => {
      const result = await echoTool.handler(
        { message: '<script>alert("xss")</script>' },
        { request: { requestId: 'test-id' } }
      );

      const content = result.content[0];
      expect(content).toBeDefined();
      if (content?.type === 'text') {
        expect(content.text).toBe('<script>alert("xss")</script>');
      }
    });

    it('should handle multiline messages', async () => {
      const result = await echoTool.handler(
        { message: 'Line 1\nLine 2\nLine 3' },
        { request: { requestId: 'test-id' } }
      );

      const content = result.content[0];
      expect(content).toBeDefined();
      if (content?.type === 'text') {
        expect(content.text).toBe('Line 1\nLine 2\nLine 3');
      }
    });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(echoTool.name).toBe('echo');
    });

    it('should have description', () => {
      expect(echoTool.description).toBeTruthy();
      expect(echoTool.description.length).toBeGreaterThan(0);
    });

    it('should have input schema with message field', () => {
      const schema = echoTool.inputSchema;
      const parsed = schema.safeParse({ message: 'test' });
      expect(parsed.success).toBe(true);
    });

    it('should reject missing message', () => {
      const schema = echoTool.inputSchema;
      const parsed = schema.safeParse({});
      expect(parsed.success).toBe(false);
    });

    it('should reject non-string message', () => {
      const schema = echoTool.inputSchema;
      const parsed = schema.safeParse({ message: 123 });
      expect(parsed.success).toBe(false);
    });
  });
});
