import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

/**
 * Runs once before the suite: applies all migrations to the test database and syncs the
 * framework catalog (global, read-only data that tests share).
 */
export default async function globalSetup() {
  const url = process.env.AUDITTRAIL_TEST_DATABASE_URL;
  if (!url) throw new Error("AUDITTRAIL_TEST_DATABASE_URL was not set by vitest.config.ts");
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: url, DATABASE_URL_TEST: url, NODE_ENV: "test" as const };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx --conditions=react-server scripts/catalog-sync.ts", { stdio: "inherit", env });
  rmSync("./storage-test", { recursive: true, force: true });
}
