# Echo

## Capability

Basic echo capability that returns the input message back to the caller — use as a template for building new skills.

## MCP Tools

| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `echo` | `{ message: string }` | `{ text: string }` | None |

### Tool Details

**Package:** `@reaatech/mcp-server-tools`
**Source:** `packages/tools/src/echo.tool.ts`

**Input Schema (Zod):**
```typescript
z.object({
  message: z.string().describe('The message to echo back'),
})
```

**Output:**
```typescript
{
  content: [{ type: 'text', text: string }]
}
```

## Usage Examples

### Example 1: Basic usage

- **User intent:** Test that the MCP connection is working
- **Tool call:**
  ```json
  {
    "method": "tools/call",
    "params": {
      "name": "echo",
      "arguments": { "message": "Hello, world!" }
    }
  }
  ```
- **Expected response:**
  ```json
  {
    "result": {
      "content": [{ "type": "text", "text": "Hello, world!" }]
    }
  }
  ```

### Example 2: Echo with special characters

- **User intent:** Verify handling of Unicode and special characters
- **Tool call:**
  ```json
  {
    "method": "tools/call",
    "params": {
      "name": "echo",
      "arguments": { "message": "Test: 你好世界 🌍 <script>alert('xss')</script>" }
    }
  }
  ```
- **Expected response:**
  ```json
  {
    "result": {
      "content": [{ "type": "text", "text": "Test: 你好世界 🌍 alert('xss')" }]
    }
  }
  ```
  Note: The sanitization middleware in `@reaatech/mcp-server-engine` strips dangerous patterns like `<script>` tags from the input before it reaches the tool.

## Error Handling

### Known Failure Modes

| Error | Cause | Recovery |
|-------|-------|----------|
| `ValidationError` | Missing or invalid `message` field | Client should provide a valid string |
| `RateLimitError` | Too many requests (if rate limiting enabled) | Retry after delay |

### Recovery Strategies

- For validation errors, check that the input matches the Zod schema
- For rate limit errors, implement exponential backoff

### Escalation Paths

- If the echo tool fails consistently, check server health via the `/health` endpoint
- Review structured logs for the `request_id` associated with the failure

## Security Considerations

### PII Handling

- The echo tool reflects input back verbatim — do not send sensitive data
- Logs are automatically redacted by the pino logger in `@reaatech/mcp-server-observability`, but avoid sending PII in tool arguments

### Permission Requirements

- No special permissions required
- Auth middleware applies if `API_KEY` is configured

### Audit Logging

- All echo tool calls are logged with `tool: 'echo'` and `request_id`
- Input message is NOT logged (sanitized by default logger configuration)
