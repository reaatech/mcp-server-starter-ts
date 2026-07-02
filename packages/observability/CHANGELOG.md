# @reaatech/mcp-server-observability

## 1.2.0

### Minor Changes

- 61af2f6: - **@reaatech/mcp-server-auth** (minor): Adds framework-agnostic Streamable HTTP transport with Express and Fastify adapters, broadening framework support for downstream consumers. Also updates @types/node devDependency.
  - **@reaatech/mcp-server-core** (minor): Introduces framework-agnostic Streamable HTTP transport with Express and Fastify adapters, a meaningful new capability for consumers. Includes a devDependency bump for @types/node.
  - **@reaatech/mcp-server-observability** (minor): Adds framework-agnostic Streamable HTTP transport with Express and Fastify adapters, expanding the transport surface available to consumers. Also bumps @types/node devDependency.
  - **@reaatech/mcp-server-tools** (minor): Introduces framework-agnostic Streamable HTTP transport with Express and Fastify adapters, an externally-visible new feature. Includes a @types/node devDependency bump.

### Patch Changes

- Updated dependencies [e0ffe61]
- Updated dependencies [61af2f6]
  - @reaatech/mcp-server-core@1.1.0

## 1.1.0

### Minor Changes

- [`05350bd`](https://github.com/reaatech/mcp-server-starter-ts/commit/05350bd317572aa3313299d5a05178f32bb4aede) Thanks [@reaatech](https://github.com/reaatech)! - - **@reaatech/mcp-server-core** (patch): Upgraded zod from v3 to v4 (security-driven, addresses GHSA-q7rr-3cgh-j5r3) and adapted the internal positiveInt return type to the new zod 4 API; exported surface unchanged.
  - **@reaatech/mcp-server-observability** (minor): Upgraded OpenTelemetry packages to the 2.x / 0.218 lines — including major bumps for @opentelemetry/resources and @opentelemetry/sdk-metrics — and migrated metrics.ts/tracing.ts from the deprecated `new Resource({...})` constructor to `resourceFromAttributes({...})`.

### Patch Changes

- Updated dependencies [[`05350bd`](https://github.com/reaatech/mcp-server-starter-ts/commit/05350bd317572aa3313299d5a05178f32bb4aede)]:
  - @reaatech/mcp-server-core@1.0.1
