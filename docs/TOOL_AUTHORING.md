# Tool Authoring Guide

This guide covers best practices for creating MCP tools in `mcp-server-starter-ts`.

## Quick Start

Create a new tool file at `src/tools/my-tool.tool.ts`:

```typescript
import { z } from 'zod';
import { defineTool } from './index.js';
import { textContent } from '../types/domain.js';

export default defineTool({
  name: 'my-tool',
  description: 'Describes what this tool does for the LLM',
  inputSchema: z.object({
    param1: z.string().describe('Description for the LLM'),
    param2: z.number().optional().describe('Optional parameter'),
  }),
  handler: async ({ param1, param2 }, context) => {
    // Your implementation here
    return {
      content: [textContent(`Result: ${param1}`)],
    };
  },
});
```

## Schema Design Best Practices

### 1. Use Descriptive Field Names

```typescript
// ✅ Good
inputSchema: z.object({
  userId: z.string().uuid('Must be a valid UUID'),
  startDate: z.string().datetime('ISO 8601 datetime required'),
})

// ❌ Bad
inputSchema: z.object({
  id: z.string(),
  date: z.string(),
})
```

### 2. Always Include Descriptions

LLMs rely on descriptions to understand when to use your tool:

```typescript
inputSchema: z.object({
  query: z.string().describe('Search query for finding documents'),
  limit: z.number().min(1).max(100).describe('Number of results to return'),
})
```

### 3. Use Appropriate Zod Validators

```typescript
inputSchema: z.object({
  email: z.string().email('Invalid email format'),
  age: z.number().int().min(0).max(120),
  tags: z.array(z.string()).max(10).describe('Up to 10 tags'),
  metadata: z.record(z.unknown()).optional(),
})
```

## Error Handling Patterns

### Always Return Structured Responses

```typescript
handler: async (input, context) => {
  try {
    const result = await performAction(input);
    return {
      content: [textContent(JSON.stringify(result))],
    };
  } catch (error) {
    logger.error({ err: error, input }, 'Tool execution failed');
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }],
      isError: true,
    };
  }
}
```

### Never Throw Unhandled Errors

Unhandled errors break the MCP protocol. Always catch and return structured error responses.

## Testing Patterns

### Unit Tests

Create `tests/unit/tools/my-tool.tool.test.ts`:

```typescript
import myTool from '../../../src/tools/my-tool.tool.js';

describe('my-tool', () => {
  it('should handle valid input', async () => {
    const result = await myTool.handler(
      { param1: 'test', param2: 42 },
      { request: { requestId: 'test' } }
    );
    expect(result.content[0].text).toContain('Result: test');
  });

  it('should validate input schema', async () => {
    const result = myTool.inputSchema.safeParse({ invalid: 'data' });
    expect(result.success).toBe(false);
  });
});
```

## Performance Considerations

### 1. Keep Tools Focused

Each tool should do one thing well. Split complex operations into multiple tools.

### 2. Set Appropriate Timeouts

Tools inherit the server timeout (default 60s). For long-running operations, consider:
- Returning a job ID for async polling
- Using streaming responses
- Breaking work into smaller chunks

### 3. Cache When Appropriate

For read-only operations that don't change frequently, consider caching results.

## Security Considerations

### 1. Never Trust Input

The transport middleware already sanitizes common prompt-injection strings before tool handlers run. Only add extra tool-level sanitization when you are handling a sensitive format or sink such as shell commands, SQL, or filesystem paths.

### 2. Avoid PII in Logs

Use the logger utilities that automatically redact sensitive data:

```typescript
import { logger } from '../observability/logger.js';
logger.info({ userId: hash(input.userId) }, 'Action performed');
```

### 3. Implement Proper Authorization

If your tool accesses user data, verify the user has permission:

```typescript
handler: async (input, context) => {
  const user = await getUser(context.session.userId);
  if (!user.canAccess(input.resourceId)) {
    return { content: [textContent('Access denied')], isError: true };
  }
  // ...
}
```

## Tool Registration

Tools are auto-discovered from `src/tools/*.tool.ts` files. No manual registration needed!

Just ensure your file:
1. Is named `*.tool.ts`
2. Has a default export that uses `defineTool()`
3. Is in the `src/tools/` directory
