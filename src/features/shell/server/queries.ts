import "server-only";
import { db } from "@/server/db";
import { can } from "@/server/authz/permissions";
import type { OrgContext } from "@/server/context";
import { listMyOrganizations } from "@/features/organizations/server/service";
import { unreadNotificationCount } from "@/features/notifications/server/service";

/** Data for the app shell: org switcher, nav counts and the unread badge. */
export async function getShellData(ctx: OrgContext) {
  const canReview = can(ctx, "evidence.review", { versionUploadedById: null });
  const [orgs, toReview, myOpenTasks, unread] = await Promise.all([
    listMyOrganizations(ctx.user.id),
    canReview
      ? db.evidence.count({
          where: { organizationId: ctx.org.id, deletedAt: null, status: "PENDING_REVIEW" },
        })
      : Promise.resolve(0),
    db.task.count({
      where: {
        organizationId: ctx.org.id,
        assigneeId: ctx.user.id,
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      },
    }),
    unreadNotificationCount(ctx),
  ]);
  return {
    orgs,
    counts: { evidenceToReview: toReview, myOpenTasks },
    unread,
    permissions: {
      canManageSettings: can(ctx, "org.updateSettings"),
      canCreateTask: can(ctx, "task.create"),
      canUploadEvidence: can(ctx, "evidence.contribute"),
      canManageControls: can(ctx, "control.manage"),
    },
  };
}
