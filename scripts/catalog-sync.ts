// Idempotently syncs framework catalog content from code into the database.
// Runs in every environment (including production deploys), independent of the demo seed.
// Usage: npm run catalog:sync
import "dotenv/config";
import { syncCatalog } from "@/server/frameworks/catalog-sync";
import { db } from "@/server/db";

async function main() {
  const results = await syncCatalog();
  for (const r of results) {
    console.log(
      `catalog:sync ${r.framework}: ${r.requirements} requirements, ${r.controlTemplates} control templates, ${r.evidenceTemplates} evidence templates`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error("catalog:sync failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
