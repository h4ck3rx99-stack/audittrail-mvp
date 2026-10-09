"use client";

import { ActionButton } from "@/components/app/actions";
import { acceptInvitationAction } from "../actions";

export function AcceptInvitationButton({ token }: { token: string }) {
  return (
    <ActionButton
      variant="primary"
      className="w-full"
      action={() => acceptInvitationAction(token)}
      success="Invitation accepted"
    >
      Accept invitation
    </ActionButton>
  );
}
