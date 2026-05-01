# AGENTS.md — mcp-server-starter-ts

> Agent-focused guidance for contributing to this codebase.

## Project Structure

This is a **pnpm workspace monorepo** managed with Turborepo.

```
packages/
  core/          — Core MCP types, Zod schemas, configuration, version
  auth/          — Authentication middleware (API key, bearer token)
  observability/ — Structured logging, OpenTelemetry tracing, metrics
  transport/     — MCP transport implementations (Streamable HTTP, SSE)
  tools/         — Tool registry, discovery, and built-in tools
  server/        — MCP server framework (Express, middleware pipeline)
examples/
  01-basic-server/  — Minimal MCP server consuming @reaatech/mcp-server-server
e2e/             — End-to-end tests using vitest + supertest
```

## Build System

- **Package manager:** pnpm (required)
- **Build tool:** tsup (per-package) + Turborepo (orchestration)
- **Format/Lint:** Biome (not Prettier/ESLint)
- **Test:** Vitest
- **TypeScript:** Strict mode, ESM + CJS dual output

### Common Commands

```bash
# Install all dependencies
pnpm install

# Build everything
pnpm build

# Run all tests
pnpm test

# Lint & format
pnpm lint
pnpm lint:fix

# Type-check without emit
pnpm typecheck

# Create a changeset for versioning
pnpm changeset

# Bump versions per pending changesets
pnpm version-packages

# Publish packages (CI-only after first publish bootstrap)
pnpm release
```

## Coding Conventions

1. **Runtime validation:** Use Zod for all external-facing data. Never trust raw JSON.
2. **Logging:** Use Pino (from `packages/observability`). Never `console.log` in library code.
3. **Error handling:** Return structured error responses with `isError: true`. Never throw unhandled errors.
4. **Types:** Prefer `type` over `interface` for data shapes. Keep `interface` for class contracts.
5. **No `any`:** Biome is configured to error on `any`. Use `unknown` + narrowing instead.
6. **Exports:** Always provide ESM + CJS dual output with `types` condition first in `exports`.
7. **No comments:** Do not add comments in source files. Let the code speak for itself.
8. **Imports:** Use `.js` extensions for relative imports to satisfy ESM resolution. Import from workspace packages via the `@reaatech/mcp-server-*` scope.

## Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`, `src/index.ts`
2. Use `@reaatech/mcp-server-core` for shared types. Do not duplicate schemas.
3. Add to `pnpm-workspace.yaml` if not under `packages/*`
4. Follow the package template (see `packages/core/package.json` for the canonical shape):
   - Dual CJS+ESM exports with `types` condition first
   - `publishConfig: { access: "public" }`
   - `files: ["dist"]`
   - `repository.directory` pointing to the package subdirectory
   - Per-package `vitest.config.ts` and `tsconfig.json` extending root
   - Build output goes to `dist/` only (never `src/`)

## Adding a New Tool

1. Create `packages/tools/src/my-tool.tool.ts`
2. Use `defineTool()` from `@reaatech/mcp-server-tools`
3. Add a corresponding `packages/tools/src/my-tool.test.ts`
4. Built-in tools are loaded at startup by `discoverTools()`
5. Custom tools are auto-discovered from `.tool.ts` files at runtime

## Testing

- Unit tests live next to source files: `src/foo.test.ts`
- E2E tests live in `e2e/`
- Always run `pnpm test` before committing
- Test files are excluded from build output (tsup only bundles `src/index.ts` entry)

## Release Process

Uses [Changesets](https://github.com/changesets/changesets) for versioning and publishing.

```bash
# Add a changeset (interactive: pick packages, bump type, write summary)
pnpm changeset

# CI opens a "Version Packages" PR on push to main
# Merging the PR publishes to npm + mirrors to GitHub Packages
```

