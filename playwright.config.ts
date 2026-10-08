import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against a production build (`next build && next start`) on port 3100, backed by a
 * dedicated database (audittrail_e2e) that tests/e2e/prepare-db.ts migrates and seeds with demo data.
 * Set E2E_SKIP_BUILD=1 to reuse an existing build.
 */
const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;
const e2eDatabaseUrl =
  process.env.DATABASE_URL_E2E ?? (process.env.DATABASE_URL ?? "").replace(/\/([^/?]+)(\?|$)/, "/audittrail_e2e$2");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", viewport: { width: 1440, height: 900 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `npx tsx --conditions=react-server tests/e2e/prepare-db.ts && ${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}npx next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: e2eDatabaseUrl,
      APP_URL: baseURL,
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: "./storage-e2e",
      EMAIL_DRIVER: "console",
      LOG_LEVEL: "warn",
      TRUST_PROXY: "0",
    },
  },
});
