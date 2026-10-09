"use client";

import * as React from "react";
import { toast } from "sonner";
import { ActionButton, CopyButton, SubmitButton, useActionForm } from "@/components/app/actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form-controls";
import { Tooltip } from "@/components/ui/overlays";
import {
  changeRoleAction,
  inviteAction,
  leaveOrganizationAction,
  regenerateInvitationAction,
  removeMemberAction,
  revokeInvitationAction,
} from "../actions";
import { ROLE_DESCRIPTIONS } from "../schemas";

const LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export function RoleSelect({
  orgSlug,
  memberId,
  role,
  options,
  reason,
}: {
  orgSlug: string;
  memberId: string;
  role: string;
  options: string[];
  reason: string | null;
}) {
  const [pending, start] = React.useTransition();
  if (options.length <= 1) {
    return reason ? (
      <Tooltip content={reason}>
        <span tabIndex={0} className="text-[13px]">
          {LABEL[role]}
        </span>
      </Tooltip>
    ) : (
      <span className="text-[13px]">{LABEL[role]}</span>
    );
  }
  return (
    <Select
      aria-label="Role"
      className="h-7 w-28"
      value={role}
      disabled={pending}
      onChange={(e) =>
        start(async () => {
          const r = await changeRoleAction(orgSlug, memberId, e.target.value);
          if (r.ok) toast.success("Role updated");
          else toast.error(r.error.message);
        })
      }
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {LABEL[o]}
        </option>
      ))}
    </Select>
  );
}

export function RemoveMemberButton({
  orgSlug,
  memberId,
  name,
  reason,
}: {
  orgSlug: string;
  memberId: string;
  name: string;
  reason: string | null;
}) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      disabledReason={reason}
      action={() => removeMemberAction(orgSlug, memberId)}
      success={`${name} was removed`}
      confirm={{
        title: `Remove ${name}`,
        destructive: true,
        confirmLabel: "Remove member",
        description:
          "They lose access immediately. Controls they own, open tasks assigned to them and risks they own become unassigned; each change is recorded in the audit log.",
      }}
    >
      Remove
    </ActionButton>
  );
}

export function LeaveButton({ orgSlug, reason }: { orgSlug: string; reason: string | null }) {
  return (
    <ActionButton
      disabledReason={reason}
      action={() => leaveOrganizationAction(orgSlug)}
      confirm={{
        title: "Leave organization",
        destructive: true,
        confirmLabel: "Leave",
        description:
          "You will lose access to this organization. Your owned controls, open tasks and risks become unassigned.",
      }}
    >
      Leave organization
    </ActionButton>
  );
}

export function InviteForm({ orgSlug, roles }: { orgSlug: string; roles: string[] }) {
  const [link, setLink] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const { formAction, fieldErrors } = useActionForm(inviteAction.bind(null, orgSlug), {
    success: "Invitation sent",
    onSuccess: (d) => {
      setLink(d.link);
      formRef.current?.reset();
    },
  });
  const [role, setRole] = React.useState(
    roles.includes("MEMBER") ? "MEMBER" : (roles[0] ?? "VIEWER"),
  );
  return (
    <div className="flex flex-col gap-3">
      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
        <Field
          label="Email"
          htmlFor="inv-email"
          errors={fieldErrors?.email}
          className="min-w-64 flex-1"
        >
          <Input name="email" type="email" maxLength={254} placeholder="name@company.com" />
        </Field>
        <Field label="Role" htmlFor="inv-role" errors={fieldErrors?.role}>
          <Select
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-32"
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {LABEL[r]}
              </option>
            ))}
          </Select>
        </Field>
        <SubmitButton>Send invitation</SubmitButton>
      </form>
      <p className="text-muted-foreground text-xs">
        {ROLE_DESCRIPTIONS[role as keyof typeof ROLE_DESCRIPTIONS]}
      </p>
      {link ? <InviteLink link={link} /> : null}
    </div>
  );
}

function InviteLink({ link }: { link: string }) {
  return (
    <div className="border-border rounded-sm border p-3 text-[13px]" role="status">
      <p className="font-medium">Invitation link</p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        Shown once. It works a single time and expires in 7 days. It was also emailed to the
        invitee.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="mono border-border bg-subtle min-w-0 flex-1 truncate rounded-sm border px-2 py-1">
          {link}
        </code>
        <CopyButton value={link} />
      </div>
    </div>
  );
}

export function InvitationActions({
  orgSlug,
  invitationId,
  email,
  state,
  canRegenerate,
}: {
  orgSlug: string;
  invitationId: string;
  email: string;
  state: string;
  canRegenerate: boolean;
}) {
  const [link, setLink] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  if (state === "ACCEPTED" || state === "REVOKED") return null;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-1">
        {canRegenerate ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await regenerateInvitationAction(orgSlug, invitationId);
                if (r.ok) {
                  setLink(r.data.link);
                  toast.success("New invitation link generated");
                } else toast.error(r.error.message);
              })
            }
          >
            Regenerate link
          </Button>
        ) : null}
        <ActionButton
          size="sm"
          variant="ghost"
          action={() => revokeInvitationAction(orgSlug, invitationId)}
          success="Invitation revoked"
          confirm={{
            title: `Revoke invitation for ${email}`,
            description: "The invitation link stops working immediately.",
            confirmLabel: "Revoke",
          }}
        >
          Revoke
        </ActionButton>
      </div>
      {link ? <InviteLink link={link} /> : null}
    </div>
  );
}
