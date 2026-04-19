# Health Check

## Capability
Inspect the MCP server's runtime health, readiness, liveness, uptime, version, and memory usage.

## MCP Tools
| Tool | Input Schema | Output | Rate Limit |
|------|-------------|--------|------------|
| `health-check` | `{}` | Health payload as JSON text | Standard middleware limit |

## Usage Examples

### Example 1: Verify the server is healthy
- **User intent:** Confirm the MCP server is ready to handle requests
- **Tool call:**
  ```json
  {
    "method": "tools/call",
    "params": {
      "name": "health-check",
      "arguments": {}
    }
  }
  ```
- **Expected response:** JSON text describing `status`, `checks`, `uptime`, `version`, `environment`, and `memory`

## Error Handling

### Known Failure Modes
| Error | Cause | Recovery |
|-------|-------|----------|
| `TransportError` | MCP transport is unavailable | Reconnect and retry |
| `ServerError` | Internal server error while collecting health data | Inspect logs with the correlated `request_id` |

### Recovery Strategies
- Retry once after reconnecting the client session
- If failures continue, check `/health`, `/ready`, and `/live`

### Escalation Paths
- Review structured logs and traces using the request ID
- Restart the server if readiness or liveness checks degrade

## Security Considerations

### PII Handling
- The tool returns process health metadata only and should not expose user data

### Permission Requirements
- Protected by the same auth middleware as other MCP tools when auth is enabled

### Audit Logging
- Calls are logged with tool name and request correlation metadata
