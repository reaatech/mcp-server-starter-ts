---
"@reaatech/mcp-server-core": patch
"@reaatech/mcp-server-observability": minor
---

- **@reaatech/mcp-server-core** (patch): Upgraded zod from v3 to v4 (security-driven, addresses GHSA-q7rr-3cgh-j5r3) and adapted the internal positiveInt return type to the new zod 4 API; exported surface unchanged.
- **@reaatech/mcp-server-observability** (minor): Upgraded OpenTelemetry packages to the 2.x / 0.218 lines — including major bumps for @opentelemetry/resources and @opentelemetry/sdk-metrics — and migrated metrics.ts/tracing.ts from the deprecated `new Resource({...})` constructor to `resourceFromAttributes({...})`.
