import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    // Each test file gets its own isolated module registry so mocks don't bleed.
    isolate: true,
    // document-extraction.test.ts uses Node's built-in test runner (node:test)
    // and is run separately via `pnpm test:native`.  Exclude it here so vitest
    // doesn't try to parse its describe/it calls as a vitest suite.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Uses Node's native test runner (node:test); run via `pnpm test:native`.
      "**/document-extraction.test.ts",
      // Integration tests hit the real database and require RUN_INTEGRATION_TESTS=1.
      // Run via `pnpm test:integration` — never as part of the default CI suite.
      "**/*.integration.test.ts",
    ],
  },
  resolve: {
    alias: {
      // Allow workspace packages to resolve from source when running tests;
      // the real @workspace/db would throw at import-time (no DATABASE_URL),
      // so tests mock it via vi.mock() — but the alias still needs to point
      // somewhere for Vitest's module resolver to find the package.json.
      "@workspace/db": path.resolve(__dirname, "../../lib/db/src/index.ts"),
      "@workspace/integrations-gemini-ai": path.resolve(
        __dirname,
        "../../lib/integrations-gemini-ai/src/index.ts"
      ),
    },
  },
});
