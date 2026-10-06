"use client";

import { ActionButton } from "@/components/app/actions";
import { declineInvitationAction } from "../actions";

/**
 * Invitations addressed to the signed-in user's email. Accepting requires the single-use link
 * from the invitation email (proof of mailbox access, since email verification is not enforced).
 */
export function PendingInvitations({ invitations }: { invitations: { id: string; orgName: string; role: string; inviter: string }[] }) {
  return (
    <ul className="rounded-md border border-border">
      {invitations.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0">
          <div className="min-w-0 flex-1 text-[13px]">
            <p className="font-medium">{i.orgName}</p>
            <p className="text-xs text-muted-foreground">
              {i.inviter} invited you as {i.role}. To accept, open the invitation link sent to your email.
            </p>
          </div>
          <ActionButton
            size="sm"
            action={() => declineInvitationAction(i.id)}
            success="Invitation declined"
            confirm={{ title: `Decline invitation to ${i.orgName}`, description: "The invitation link will stop working. An admin can invite you again later.", confirmLabel: "Decline" }}
          >
            Decline
          </ActionButton>
        </li>
      ))}
    </ul>
  );
}
