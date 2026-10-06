// Runs the compliance scan once (due/overdue tasks, expiring/expired evidence, due control reviews).
// Idempotent: notifications are deduplicated. Schedule it with system cron or call the HTTP endpoint.
// Usage: npm run jobs:scan
import "dotenv/config";
import { db } from "@/server/db";
import { runComplianceScan } from "@/server/jobs/compliance-scan";

runComplianceScan()
  .then((summary) => {
    console.log(`jobs:scan organizations=${summary.organizations} candidates=${summary.candidates} created=${summary.created}`);
  })
  .catch((error: unknown) => {
    console.error("jobs:scan failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
