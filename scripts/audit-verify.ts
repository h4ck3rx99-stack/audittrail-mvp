// Verifies every audit hash chain (or the chains given as arguments) and exits non-zero on any break.
// Usage: npm run audit:verify [-- org:<organizationId> user:<userId> ...]
import "dotenv/config";
import { db } from "@/server/db";
import { listChainKeys, verifyAuditChain } from "@/server/audit/verify";

async function main() {
  const requested = process.argv.slice(2).filter((a) => /^(org|user):[0-9a-f-]{36}$/i.test(a));
  const chains = requested.length > 0 ? requested : await listChainKeys();
  let failures = 0;
  let events = 0;
  for (const chainKey of chains) {
    const result = await verifyAuditChain(chainKey);
    events += result.eventCount;
    if (result.valid) {
      console.log(`OK    ${chainKey}  events=${result.eventCount}  head=${result.headHash ?? "-"}`);
    } else {
      failures += 1;
      console.log(`FAIL  ${chainKey}  broken at sequence ${result.brokenAtSequence}: ${result.reason}`);
    }
  }
  console.log(`\nVerified ${chains.length} chains, ${events} events. ${failures === 0 ? "All chains intact." : `${failures} chain(s) failed.`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error("audit:verify failed:", error instanceof Error ? error.message : error);
    process.exitCode = 2;
  })
  .finally(() => db.$disconnect());
