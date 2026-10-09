"use server";

import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction } from "@/server/authz/context";
import { verifyOrganizationChain } from "./server/service";

export type VerifyResult =
  | { valid: true; eventCount: number; headHash: string | null }
  | { valid: false; eventCount: number; brokenAtSequence: string; reason: string };

export async function verifyAuditChainAction(orgSlug: string): Promise<ActionResult<VerifyResult>> {
  return runAction("audit.verify", async () => {
    const r = await verifyOrganizationChain(await resolveOrgContextForAction(orgSlug));
    return r.valid
      ? { valid: true as const, eventCount: r.eventCount, headHash: r.headHash }
      : {
          valid: false as const,
          eventCount: r.eventCount,
          brokenAtSequence: r.brokenAtSequence,
          reason: r.reason,
        };
  });
}
