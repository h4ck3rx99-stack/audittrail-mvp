import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testDatabaseUrl =
  process.env.DATABASE_URL_TEST ??
  (process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2") : undefined);

if (!testDatabaseUrl) {
  throw new Error("Set DATABASE_URL_TEST (or DATABASE_URL) to run the test suite.");
}
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST must point at a separate database: tests TRUNCATE every table.");
}

// Visible to globalSetup, which runs in this (main) process.
process.env.AUDITTRAIL_TEST_DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: fileURLToPath(new URL("./src/$1", import.meta.url)) },
      { find: /^server-only$/, replacement: fileURLToPath(new URL("./tests/helpers/empty-module.ts", import.meta.url)) },
    ],
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/helpers/global-setup.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    // One shared Postgres test database, reset between tests: run files sequentially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "local",
      DATABASE_URL: testDatabaseUrl,
      DATABASE_URL_TEST: testDatabaseUrl,
      APP_URL: "http://localhost:3000",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: "./storage-test",
      EMAIL_DRIVER: "console",
      TRUST_PROXY: "1",
      CRON_SECRET: "test-cron-secret-0123456789",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "test-auth-secret-test-auth-secret-0123456789",
      LOG_LEVEL: "silent",
    },
  },
});
