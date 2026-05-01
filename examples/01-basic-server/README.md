# Example: 01-basic-server

Minimal MCP server that starts with the full middleware pipeline and built-in tools.

## Run

```bash
pnpm dev
```

The server will be available at `http://localhost:8080`.

### Endpoints

- `GET /health` — Health check
- `GET /ready` — Readiness check
- `GET /live` — Liveness check
- `POST /mcp` — Streamable HTTP MCP transport
- `DELETE /mcp` — End MCP session
- `GET /mcp/sse` — SSE transport
- `POST /mcp/messages` — SSE message handling
