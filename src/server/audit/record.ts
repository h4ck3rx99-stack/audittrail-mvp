import "server-only";
import type { Role } from "@/generated/prisma/enums";
import { db, type Tx } from "@/server/db";
import { logger } from "@/server/logger";
import type { OrgContext, SessionUser, UserContext } from "@/server/context";
import type { RequestMeta } from "@/server/request-meta";
import type { AuditAction, ResourceType } from "./catalog";
import { redactChanges, redactDeep, type Changes } from "./diff";
import {
  computeAuditEventHash,
  orgChainKey,
  toStorableJson,
  userChainKey,
  type HashableAuditEvent,
} from "./hash";
import { createNotification, type NotifyInput } from "@/server/notifications/notify";

/** Who performed an audited action. */
export type AuditActor =
  { type: "USER"; user: SessionUser; role: Role | null } | { type: "SYSTEM"; name: string };

/** Everything the recorder needs to attribute an event. */
export type AuditScope = {
  actor: AuditActor;
  request: RequestMeta | null;
  /** Default chain: the organization's chain when set, else the actor's user chain. */
  organizationId: string | null;
  auditMetadata?: Record<string, unknown>;
};

export type AuditRecordInput = {
  action: AuditAction;
  resourceType: ResourceType;
  resourceId?: string | null;
  resourceLabel?: string | null;
  changes?: Changes | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Which chain to append to. Defaults to the scope's organization chain (or the actor's user
   * chain when there is no organization). Auth events use { userId }.
   */
  chain?: { organizationId: string } | { userId: string };
  /** Overrides the actor role snapshot (e.g. the role in each organization for member.logged_in). */
  actorRole?: Role | null;
};

export function scopeFromOrgContext(ctx: OrgContext): AuditScope {
  return {
    actor: { type: "USER", user: ctx.user, role: ctx.role },
    request: ctx.request,
    organizationId: ctx.org.id,
    auditMetadata: ctx.auditMetadata,
  };
}

export function scopeFromUserContext(ctx: UserContext): AuditScope {
  return {
    actor: { type: "USER", user: ctx.user, role: null },
    request: ctx.request,
    organizationId: null,
    auditMetadata: ctx.auditMetadata,
  };
}

function toScope(ctx: OrgContext | UserContext | AuditScope): AuditScope {
  if ("actor" in ctx) return ctx;
  if ("org" in ctx) return scopeFromOrgContext(ctx);
  return scopeFromUserContext(ctx);
}

type HeadRow = { lastSequence: bigint | number | string; lastHash: string | null };

/**
 * Appends one event to a hash chain. Must run inside a transaction: the chain head row is locked
 * with SELECT ... FOR UPDATE, which serializes audited writes per chain until commit.
 */
export async function appendAuditEvent(tx: Tx, scope: AuditScope, input: AuditRecordInput) {
  let chainKey: string;
  let organizationId: string | null;
  if (input.chain && "userId" in input.chain) {
    chainKey = userChainKey(input.chain.userId);
    organizationId = null;
  } else if (input.chain && "organizationId" in input.chain) {
    chainKey = orgChainKey(input.chain.organizationId);
    organizationId = input.chain.organizationId;
  } else if (scope.organizationId) {
    chainKey = orgChainKey(scope.organizationId);
    organizationId = scope.organizationId;
  } else if (scope.actor.type === "USER") {
    chainKey = userChainKey(scope.actor.user.id);
    organizationId = null;
  } else {
    throw new Error("Audit event has no chain: provide an organization or user chain");
  }

  await tx.$executeRaw`
    INSERT INTO "AuditChainHead" ("chainKey", "lastSequence", "lastHash", "updatedAt")
    VALUES (${chainKey}, 0, NULL, now())
    ON CONFLICT ("chainKey") DO NOTHING
  `;
  const heads = await tx.$queryRaw<HeadRow[]>`
    SELECT "lastSequence", "lastHash" FROM "AuditChainHead" WHERE "chainKey" = ${chainKey} FOR UPDATE
  `;
  const head = heads[0];
  if (!head) throw new Error(`Audit chain head missing for ${chainKey}`);

  const sequence = BigInt(head.lastSequence) + 1n;
  const actor = scope.actor;
  const metadataInput =
    input.metadata || scope.auditMetadata
      ? { ...(scope.auditMetadata ?? {}), ...(input.metadata ?? {}) }
      : null;

  const event: HashableAuditEvent = {
    chainKey,
    sequence,
    occurredAt: new Date(),
    organizationId,
    actorType: actor.type,
    actorUserId: actor.type === "USER" ? actor.user.id : null,
    actorEmail: actor.type === "USER" ? actor.user.email : null,
    actorName: actor.type === "USER" ? actor.user.name : actor.name,
    actorRole:
      input.actorRole !== undefined ? input.actorRole : actor.type === "USER" ? actor.role : null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    resourceLabel: input.resourceLabel ? input.resourceLabel.slice(0, 300) : null,
    changes: input.changes ? toStorableJson(redactChanges(input.changes)) : null,
    metadata: metadataInput ? toStorableJson(redactDeep(metadataInput)) : null,
    ipAddress: scope.request?.ip ?? null,
    userAgent: scope.request?.userAgent ?? null,
    requestId: scope.request?.requestId ?? null,
    prevHash: head.lastHash,
  };
  const hash = computeAuditEventHash(event);

  const created = await tx.auditEvent.create({
    data: {
      chainKey: event.chainKey,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      organizationId: event.organizationId,
      actorType: event.actorType,
      actorUserId: event.actorUserId,
      actorEmail: event.actorEmail,
      actorName: event.actorName,
      actorRole: event.actorRole,
      action: event.action,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      resourceLabel: event.resourceLabel,
      changes: event.changes ?? undefined,
      metadata: event.metadata ?? undefined,
      ipAddress: event.ipAddress,
      userAgent: event.userAgent,
      requestId: event.requestId,
      prevHash: event.prevHash,
      hash,
    },
    select: { id: true, sequence: true, hash: true },
  });

  await tx.auditChainHead.update({
    where: { chainKey },
    data: { lastSequence: sequence, lastHash: hash },
  });

  return created;
}

export type AuditRecorder = {
  record: (input: AuditRecordInput) => Promise<{ id: string; sequence: bigint; hash: string }>;
};

export type AuditedTransactionHelpers = {
  tx: Tx;
  audit: AuditRecorder;
  /** Creates an in-app notification inside the transaction (skips self-notification). */
  notify: (input: NotifyInput) => Promise<void>;
  /** Runs after a successful commit (emails, storage cleanup). Failures are logged, not thrown. */
  afterCommit: (fn: () => Promise<void> | void) => void;
  scope: AuditScope;
};

export type AuditedTransactionOptions = { timeoutMs?: number };

/**
 * The mandatory pattern for every mutation: data changes, their audit events and in-app
 * notifications commit together or not at all. Emails are dispatched only after commit.
 */
export async function withAuditedTransaction<T>(
  ctx: OrgContext | UserContext | AuditScope,
  fn: (helpers: AuditedTransactionHelpers) => Promise<T>,
  options: AuditedTransactionOptions = {},
): Promise<T> {
  const scope = toScope(ctx);
  const after: (() => Promise<void> | void)[] = [];

  const result = await db.$transaction(
    async (tx) => {
      // Serialize record() calls made without awaiting so sequence numbers stay ordered.
      let queue: Promise<unknown> = Promise.resolve();
      const audit: AuditRecorder = {
        record: (input) => {
          const next = queue.then(() => appendAuditEvent(tx, scope, input));
          queue = next.catch(() => undefined);
          return next;
        },
      };
      const actorUserId = scope.actor.type === "USER" ? scope.actor.user.id : null;
      const notify = async (input: NotifyInput) => {
        const email = await createNotification(tx, actorUserId, input);
        if (email) after.push(email);
      };
      const value = await fn({ tx, audit, notify, afterCommit: (cb) => after.push(cb), scope });
      await queue;
      return value;
    },
    { timeout: options.timeoutMs ?? 30_000, maxWait: 15_000 },
  );

  for (const cb of after) {
    try {
      await cb();
    } catch (error) {
      logger.error(
        { err: error, requestId: scope.request?.requestId },
        "after-commit callback failed",
      );
    }
  }
  return result;
}
