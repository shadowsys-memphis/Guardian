/**
 * Vitest config for integration tests only.
 *
 * Run via: RUN_INTEGRATION_TESTS=1 pnpm test:integration
 *
 * These tests hit the real DATABASE_URL Postgres instance.  They are
 * intentionally excluded from the default `pnpm test` run (vitest.config.ts)
 * to prevent accidental writes to a production database.
 */
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    isolate: true,
    include: ["src/**/*.integration.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(__dirname, "../../lib/db/src/index.ts"),
      "@workspace/integrations-gemini-ai": path.resolve(
        __dirname,
        "../../lib/integrations-gemini-ai/src/index.ts"
      ),
    },
  },
});
