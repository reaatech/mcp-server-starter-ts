import { defineConfig } from 'tsup';

/**
 * Two entry points: the main `.` export (Express + framework-agnostic core) and
 * the `./fastify` subpath (Fastify adapters), mirroring the
 * `@reaatech/mcp-gateway-*` packages. `splitting` keeps the shared core — and
 * therefore the single session store — in a shared ESM chunk so importing both
 * entries does not duplicate the session map. (ESM is the default here;
 * `fastify` re-exports the session helpers so a Fastify-only CJS consumer never
 * needs the main entry either.)
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/fastify.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: true,
  treeshake: true,
});
