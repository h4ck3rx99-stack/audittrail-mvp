import "server-only";
import { db } from "@/server/db";
import { computeAuditEventHash, type JsonValue } from "./hash";

export type ChainVerificationResult =
  | { valid: true; chainKey: string; eventCount: number; headHash: string | null }
  | {
      valid: false;
      chainKey: string;
      eventCount: number;
      brokenAtSequence: string;
      reason: string;
    };

const BATCH = 1000;

/**
 * Walks a chain in sequence order. Recomputes every hash, checks sequence continuity and
 * prevHash linkage, and finally compares the last event with the chain head row (detects
 * events removed from the end of the chain).
 */
export async function verifyAuditChain(chainKey: string): Promise<ChainVerificationResult> {
  let expectedSequence = 1n;
  let prevHash: string | null = null;
  let eventCount = 0;
  let cursor = 0n;

  for (;;) {
    const events = await db.auditEvent.findMany({
      where: { chainKey, sequence: { gt: cursor } },
      orderBy: { sequence: "asc" },
      take: BATCH,
    });
    if (events.length === 0) break;

    for (const e of events) {
      if (e.sequence !== expectedSequence) {
        return {
          valid: false,
          chainKey,
          eventCount,
          brokenAtSequence: expectedSequence.toString(),
          reason: `Sequence gap: expected ${expectedSequence}, found ${e.sequence}`,
        };
      }
      if (e.prevHash !== prevHash) {
        return {
          valid: false,
          chainKey,
          eventCount,
          brokenAtSequence: e.sequence.toString(),
          reason: "prevHash does not match the hash of the previous event",
        };
      }
      const recomputed = computeAuditEventHash({
        chainKey: e.chainKey,
        sequence: e.sequence,
        occurredAt: e.occurredAt,
        organizationId: e.organizationId,
        actorType: e.actorType,
        actorUserId: e.actorUserId,
        actorEmail: e.actorEmail,
        actorName: e.actorName,
        actorRole: e.actorRole,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        resourceLabel: e.resourceLabel,
        changes: (e.changes as JsonValue | null) ?? null,
        metadata: (e.metadata as JsonValue | null) ?? null,
        ipAddress: e.ipAddress,
        userAgent: e.userAgent,
        requestId: e.requestId,
        prevHash: e.prevHash,
      });
      if (recomputed !== e.hash) {
        return {
          valid: false,
          chainKey,
          eventCount,
          brokenAtSequence: e.sequence.toString(),
          reason: "Stored hash does not match the event contents",
        };
      }
      prevHash = e.hash;
      expectedSequence += 1n;
      eventCount += 1;
      cursor = e.sequence;
    }
    if (events.length < BATCH) break;
  }

  const head = await db.auditChainHead.findUnique({ where: { chainKey } });
  const lastSequence = expectedSequence - 1n;
  if (head) {
    if (head.lastSequence !== lastSequence || head.lastHash !== prevHash) {
      return {
        valid: false,
        chainKey,
        eventCount,
        brokenAtSequence: (lastSequence + 1n).toString(),
        reason: `Chain head records sequence ${head.lastSequence}, but the last event found is ${lastSequence}`,
      };
    }
  } else if (eventCount > 0) {
    return {
      valid: false,
      chainKey,
      eventCount,
      brokenAtSequence: "1",
      reason: "Events exist but the chain head row is missing",
    };
  }

  return { valid: true, chainKey, eventCount, headHash: prevHash };
}

/** Lists every chain key known to the system (for the CLI). */
export async function listChainKeys(): Promise<string[]> {
  const rows = await db.auditChainHead.findMany({ select: { chainKey: true }, orderBy: { chainKey: "asc" } });
  return rows.map((r) => r.chainKey);
}
