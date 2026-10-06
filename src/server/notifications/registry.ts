import type { NotificationType, Role } from "@/generated/prisma/enums";
import { formatDateOnly } from "@/lib/dates";
import { riskKey, taskKey } from "@/lib/utils";

/**
 * Registry pattern: each NotificationType maps to one builder that produces the title, body,
 * link and resource reference. Adding a type means adding one entry (TypeScript enforces it).
 */

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export type NotificationPayloads = {
  TASK_ASSIGNED: { orgSlug: string; taskId: string; taskNumber: number; taskTitle: string; actorName: string };
  TASK_DUE_SOON: { orgSlug: string; taskId: string; taskNumber: number; taskTitle: string; dueDate: string };
  TASK_OVERDUE: { orgSlug: string; taskId: string; taskNumber: number; taskTitle: string; dueDate: string };
  CONTROL_ASSIGNED: { orgSlug: string; controlId: string; controlCode: string; controlName: string; actorName: string };
  CONTROL_REVIEW_DUE: {
    orgSlug: string;
    controlId: string;
    controlCode: string;
    controlName: string;
    dueDate: string;
    overdue: boolean;
  };
  EVIDENCE_SUBMITTED_FOR_REVIEW: { orgSlug: string; evidenceId: string; evidenceTitle: string; actorName: string };
  EVIDENCE_REVIEWED: {
    orgSlug: string;
    evidenceId: string;
    evidenceTitle: string;
    approved: boolean;
    actorName: string;
    comment: string | null;
  };
  EVIDENCE_EXPIRING: { orgSlug: string; evidenceId: string; evidenceTitle: string; validUntil: string };
  EVIDENCE_EXPIRED: { orgSlug: string; evidenceId: string; evidenceTitle: string; validUntil: string };
  RISK_ASSIGNED: { orgSlug: string; riskId: string; riskNumber: number; riskTitle: string; actorName: string };
  MEMBER_ROLE_CHANGED: { orgSlug: string; orgName: string; fromRole: Role; toRole: Role; actorName: string };
  INVITATION_RECEIVED: { orgName: string; role: Role; inviterName: string };
};

export type BuiltNotification = {
  title: string;
  body: string | null;
  linkPath: string;
  resourceType: string | null;
  resourceId: string | null;
  /** Whether an email copy is sent after commit. */
  email: boolean;
};

type Registry = { [K in NotificationType]: (p: NotificationPayloads[K]) => BuiltNotification };

export const NOTIFICATION_REGISTRY: Registry = {
  TASK_ASSIGNED: (p) => ({
    title: `${taskKey(p.taskNumber)} assigned to you`,
    body: `${p.actorName} assigned you "${p.taskTitle}".`,
    linkPath: `/org/${p.orgSlug}/tasks/${p.taskId}`,
    resourceType: "task",
    resourceId: p.taskId,
    email: true,
  }),
  TASK_DUE_SOON: (p) => ({
    title: `${taskKey(p.taskNumber)} is due ${formatDateOnly(p.dueDate)}`,
    body: `"${p.taskTitle}" is due soon.`,
    linkPath: `/org/${p.orgSlug}/tasks/${p.taskId}`,
    resourceType: "task",
    resourceId: p.taskId,
    email: true,
  }),
  TASK_OVERDUE: (p) => ({
    title: `${taskKey(p.taskNumber)} is overdue`,
    body: `"${p.taskTitle}" was due ${formatDateOnly(p.dueDate)}.`,
    linkPath: `/org/${p.orgSlug}/tasks/${p.taskId}`,
    resourceType: "task",
    resourceId: p.taskId,
    email: true,
  }),
  CONTROL_ASSIGNED: (p) => ({
    title: `You now own ${p.controlCode}`,
    body: `${p.actorName} made you the owner of "${p.controlName}".`,
    linkPath: `/org/${p.orgSlug}/controls/${p.controlId}`,
    resourceType: "control",
    resourceId: p.controlId,
    email: true,
  }),
  CONTROL_REVIEW_DUE: (p) => ({
    title: p.overdue ? `Review of ${p.controlCode} is overdue` : `Review of ${p.controlCode} is due`,
    body: `"${p.controlName}" is due for review on ${formatDateOnly(p.dueDate)}.`,
    linkPath: `/org/${p.orgSlug}/controls/${p.controlId}?tab=reviews`,
    resourceType: "control",
    resourceId: p.controlId,
    email: true,
  }),
  EVIDENCE_SUBMITTED_FOR_REVIEW: (p) => ({
    title: "Evidence awaiting review",
    body: `${p.actorName} submitted "${p.evidenceTitle}" for review.`,
    linkPath: `/org/${p.orgSlug}/evidence/${p.evidenceId}`,
    resourceType: "evidence",
    resourceId: p.evidenceId,
    email: true,
  }),
  EVIDENCE_REVIEWED: (p) => ({
    title: p.approved ? "Evidence approved" : "Evidence rejected",
    body: p.approved
      ? `${p.actorName} approved "${p.evidenceTitle}".`
      : `${p.actorName} rejected "${p.evidenceTitle}"${p.comment ? `: ${p.comment}` : "."}`,
    linkPath: `/org/${p.orgSlug}/evidence/${p.evidenceId}`,
    resourceType: "evidence",
    resourceId: p.evidenceId,
    email: true,
  }),
  EVIDENCE_EXPIRING: (p) => ({
    title: "Evidence expiring soon",
    body: `"${p.evidenceTitle}" is valid until ${formatDateOnly(p.validUntil)}.`,
    linkPath: `/org/${p.orgSlug}/evidence/${p.evidenceId}`,
    resourceType: "evidence",
    resourceId: p.evidenceId,
    email: true,
  }),
  EVIDENCE_EXPIRED: (p) => ({
    title: "Evidence expired",
    body: `"${p.evidenceTitle}" expired after ${formatDateOnly(p.validUntil)}. Upload a current version.`,
    linkPath: `/org/${p.orgSlug}/evidence/${p.evidenceId}`,
    resourceType: "evidence",
    resourceId: p.evidenceId,
    email: true,
  }),
  RISK_ASSIGNED: (p) => ({
    title: `${riskKey(p.riskNumber)} assigned to you`,
    body: `${p.actorName} made you the owner of "${p.riskTitle}".`,
    linkPath: `/org/${p.orgSlug}/risks/${p.riskId}`,
    resourceType: "risk",
    resourceId: p.riskId,
    email: true,
  }),
  MEMBER_ROLE_CHANGED: (p) => ({
    title: `Your role in ${p.orgName} changed`,
    body: `${p.actorName} changed your role from ${ROLE_LABEL[p.fromRole]} to ${ROLE_LABEL[p.toRole]}.`,
    linkPath: `/org/${p.orgSlug}/dashboard`,
    resourceType: "member",
    resourceId: null,
    email: true,
  }),
  INVITATION_RECEIVED: (p) => ({
    title: `Invitation to join ${p.orgName}`,
    body: `${p.inviterName} invited you to join as ${ROLE_LABEL[p.role]}.`,
    linkPath: `/org?view=invitations`,
    resourceType: "invitation",
    resourceId: null,
    // The invitation service sends its own email containing the single-use link.
    email: false,
  }),
};

export function buildNotification<K extends NotificationType>(type: K, payload: NotificationPayloads[K]): BuiltNotification {
  const builder = NOTIFICATION_REGISTRY[type] as (p: NotificationPayloads[K]) => BuiltNotification;
  return builder(payload);
}
