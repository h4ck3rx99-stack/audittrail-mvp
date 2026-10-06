"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction, resolveUserContextForAction } from "@/server/authz/context";
import { formDataToObject } from "@/server/validation";
import {
  acceptInvitation,
  changeMemberRole,
  createInvitation,
  declineInvitation,
  leaveOrganization,
  regenerateInvitationLink,
  removeMember,
  revokeInvitation,
} from "./server/service";

type FormResult = ActionResult<null>;

export async function inviteAction(orgSlug: string, _prev: ActionResult<{ link: string }> | null, formData: FormData): Promise<ActionResult<{ link: string }>> {
  return runAction("members.invite", async () => {
    const { link } = await createInvitation(await resolveOrgContextForAction(orgSlug), formDataToObject(formData));
    return { link };
  });
}

export async function revokeInvitationAction(orgSlug: string, invitationId: string): Promise<FormResult> {
  return runAction("members.revokeInvitation", async () => {
    await revokeInvitation(await resolveOrgContextForAction(orgSlug), invitationId);
    return null;
  });
}

export async function regenerateInvitationAction(orgSlug: string, invitationId: string): Promise<ActionResult<{ link: string }>> {
  return runAction("members.regenerateInvitation", async () => regenerateInvitationLink(await resolveOrgContextForAction(orgSlug), invitationId));
}

export async function changeRoleAction(orgSlug: string, memberId: string, role: string): Promise<FormResult> {
  return runAction("members.changeRole", async () => {
    await changeMemberRole(await resolveOrgContextForAction(orgSlug), memberId, { role });
    return null;
  });
}

export async function removeMemberAction(orgSlug: string, memberId: string): Promise<FormResult> {
  return runAction("members.remove", async () => {
    await removeMember(await resolveOrgContextForAction(orgSlug), memberId);
    return null;
  });
}

export async function leaveOrganizationAction(orgSlug: string): Promise<FormResult> {
  const result = await runAction(
    "members.leave",
    async () => {
      await leaveOrganization(await resolveOrgContextForAction(orgSlug));
      return null;
    },
    { refresh: false },
  );
  if (result.ok) redirect("/org");
  return result;
}

export async function acceptInvitationAction(token: string): Promise<ActionResult<{ orgSlug: string }>> {
  const result = await runAction(
    "members.acceptInvitation",
    async () => {
      const { orgSlug } = await acceptInvitation(await resolveUserContextForAction(), token);
      return { orgSlug };
    },
    { refresh: false },
  );
  if (result.ok) redirect(`/org/${result.data.orgSlug}/dashboard`);
  return result;
}

export async function declineInvitationAction(invitationId: string): Promise<FormResult> {
  return runAction("members.declineInvitation", async () => {
    await declineInvitation(await resolveUserContextForAction(), invitationId);
    return null;
  });
}
