import { execSync } from "node:child_process";
import pg from "pg";

/**
 * Creates (if needed), migrates and seeds the dedicated E2E database. The seed is idempotent.
 * Runs as part of the web server command, because Playwright starts the web server before global setup.
 */
async function prepare() {
  const url = process.env.DATABASE_URL;
  if (!url || !/audittrail_e2e/.test(url))
    throw new Error("E2E database URL must point at a database named audittrail_e2e");
  const admin = new pg.Client({ connectionString: url.replace(/\/audittrail_e2e/, "/postgres") });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'audittrail_e2e'");
  if (exists.rowCount === 0) await admin.query("CREATE DATABASE audittrail_e2e");
  await admin.end();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: url,
    STORAGE_LOCAL_DIR: "./storage-e2e",
  };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx --conditions=react-server prisma/seed.ts", { stdio: "inherit", env });
  // Each run signs up new users from one (unknown) client IP; start every run with fresh rate-limit counters.
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  await db.query('DELETE FROM "RateLimitBucket"');
  await db.end();
}

prepare().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
