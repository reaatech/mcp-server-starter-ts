# @reaatech/mcp-server-tools

[![npm version](https://img.shields.io/npm/v/@reaatech/mcp-server-tools.svg)](https://www.npmjs.com/package/@reaatech/mcp-server-tools)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/reaatech/mcp-server-starter-ts/ci.yml?branch=main&label=CI)](https://github.com/reaatech/mcp-server-starter-ts/actions/workflows/ci.yml)

> **Status:** Pre-1.0 — APIs may change in minor versions. Pin to a specific version in production.

MCP tool registry, discovery, and built-in tools for the MCP server framework. Provides a type-safe `defineTool()` helper, an in-memory registry, filesystem auto-discovery of `.tool.ts` files, and built-in `echo` and `health-check` tools.

## Installation

```bash
npm install @reaatech/mcp-server-tools
# or
pnpm add @reaatech/mcp-server-tools
```

## Feature Overview

- **Type-safe tool definitions** — `defineTool()` with Zod input schemas and typed handlers
- **In-memory registry** — Register, query, and clear tools at runtime
- **Auto-discovery** — Scans directories for `.tool.ts` files and registers them at startup
- **Built-in tools** — `echo` (connectivity test) and `health-check` (server diagnostics) ship by default
- **Tool context** — Handlers receive `ToolContext` with request metadata and session data

## Quick Start

### Creating a Tool

```typescript
import { defineTool } from '@reaatech/mcp-server-tools';
import { z } from 'zod';
import { textContent } from '@reaatech/mcp-server-core';

export default defineTool({
  name: 'my-tool',
  description: 'Does something useful for the LLM',
  inputSchema: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().optional().describe('Max results'),
  }),
  handler: async ({ query, limit }, context) => {
    // context.request.requestId, context.request.sessionId, etc.
    const result = await search(query, limit ?? 10);
    return {
      content: [textContent(JSON.stringify(result))],
    };
  },
});
```

### Registering Tools

```typescript
import { registerTool, getTools, getTool, discoverTools, clearTools } from '@reaatech/mcp-server-tools';

// Manual registration
registerTool(myTool);

// Look up tools
const allTools = getTools();
const specificTool = getTool('my-tool');

// Auto-discovery (scans for *.tool.ts files)
const discovered = await discoverTools();

// Clean up (for testing)
clearTools();
```

## API Reference

### `ToolDefinition`

```typescript
interface ToolDefinition {
  name: string;                                              // Unique tool identifier
  description: string;                                       // Human-readable for the LLM
  inputSchema: z.ZodObject<z.ZodRawShape>;                   // Zod schema for input validation
  handler: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResponse>;
}
```

### `defineTool(def: ToolDefinition): ToolDefinition`

Type-safe helper for defining a tool. Returns the definition unchanged — useful for the `export default` auto-discovery pattern.

```typescript
export default defineTool({
  name: 'my-tool',
  description: '...',
  inputSchema: z.object({ ... }),
  handler: async (args) => { ... },
});
```

### `registerTool(tool: ToolDefinition): void`

Add a tool to the in-memory registry. Throws if a tool with the same name is already registered.

### `getTools(): ToolDefinition[]`

Returns a copy of all registered tools.

### `getTool(name: string): ToolDefinition | undefined`

Look up a specific tool by name. Returns `undefined` if not found.

### `discoverTools(): Promise<ToolDefinition[]>`

Auto-discovers tools from the filesystem and registers them. Searches these directories:

1. `src/tools/` — source tree
2. `dist/src/tools/` — build output (first candidate)
3. `dist/tools/` — build output (second candidate)

Matches files matching `/\.tool\.(ts|js)$/` (excluding `.d.ts`). Built-in `echo` and `health-check` tools are loaded from the package itself — they do not require filesystem discovery.

### `clearTools(): void`

Clears the registry. Primarily for testing.

## Built-in Tools

### `echo`

Returns the input message back to the caller. Useful for testing MCP connectivity.

```typescript
// Input schema: { message: string }
// Returns: { content: [{ type: "text", text: "<message>" }] }
```

### `health-check`

Returns server health diagnostics: uptime, version, environment, timestamp, and memory usage.

```typescript
// Input schema: {} (no parameters)
// Returns: { content: [{ type: "text", text: "<json diagnostics>" }] }
```

## Integration with the Server

```typescript
import { createApp } from '@reaatech/mcp-server-engine';
// discoverTools() is called automatically inside createApp()

const app = await createApp();
// echo and health-check tools are available
app.listen(8080);
```

## Related Packages

- [`@reaatech/mcp-server-core`](https://www.npmjs.com/package/@reaatech/mcp-server-core) — `ToolResponse`, `ToolContext`, content helpers
- [`@reaatech/mcp-server-observability`](https://www.npmjs.com/package/@reaatech/mcp-server-observability) — Tool execution logging and metrics
- [`@reaatech/mcp-server-engine`](https://www.npmjs.com/package/@reaatech/mcp-server-engine) — Server framework that consumes the registry

## License

[MIT](https://github.com/reaatech/mcp-server-starter-ts/blob/main/LICENSE)
