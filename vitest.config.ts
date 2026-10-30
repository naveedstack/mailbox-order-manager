import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { testDatabaseUrl } from "./tests/integration/setup/test-database-url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        // Pure tests: no database, no global setup.
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        // Real Postgres (test database). Files run one at a time because they
        // share and truncate the same database.
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/setup/global-setup.ts"],
          // Only resolved when a URL exists, so `test:unit` works without a .env;
          // globalSetup reports the missing variable for integration runs.
          env: process.env.DATABASE_URL ? { DATABASE_URL: testDatabaseUrl() } : {},
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
  },
});
