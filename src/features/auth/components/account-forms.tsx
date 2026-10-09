"use client";

import * as React from "react";
import { ActionButton, SubmitButton, useActionForm } from "@/components/app/actions";
import { Field, Input } from "@/components/ui/form-controls";
import { changePasswordAction, revokeSessionAction, updateProfileAction } from "../actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const { formAction, fieldErrors } = useActionForm(updateProfileAction, {
    success: "Profile updated",
  });
  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="Name" htmlFor="pf-name" errors={fieldErrors?.name}>
        <Input name="name" defaultValue={name} maxLength={100} />
      </Field>
      <Field
        label="Email"
        htmlFor="pf-email"
        hint="Your sign-in email cannot be changed in this version."
      >
        <Input value={email} disabled readOnly />
      </Field>
      <SubmitButton className="self-start">Save profile</SubmitButton>
    </form>
  );
}

export function ChangePasswordForm() {
  const formRef = React.useRef<HTMLFormElement>(null);
  const { formAction, fieldErrors } = useActionForm(changePasswordAction, {
    success: "Password changed. Other sessions were signed out.",
    onSuccess: () => formRef.current?.reset(),
  });
  return (
    <form ref={formRef} action={formAction} className="flex max-w-md flex-col gap-4">
      <Field label="Current password" htmlFor="cp-current" errors={fieldErrors?.currentPassword}>
        <Input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={128}
        />
      </Field>
      <Field
        label="New password"
        htmlFor="cp-new"
        errors={fieldErrors?.newPassword}
        hint="At least 12 characters. Your other sessions will be signed out."
      >
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
        />
      </Field>
      <SubmitButton className="self-start">Change password</SubmitButton>
    </form>
  );
}

export function RevokeSessionButton({
  sessionId,
  current,
}: {
  sessionId: string;
  current: boolean;
}) {
  return (
    <ActionButton
      size="sm"
      variant="ghost"
      action={() => revokeSessionAction(sessionId)}
      success="Session revoked"
      confirm={
        current
          ? {
              title: "Sign out of this session",
              description: "You will be signed out of this browser.",
              confirmLabel: "Sign out",
            }
          : {
              title: "Revoke session",
              description: "That device will be signed out immediately.",
              confirmLabel: "Revoke",
            }
      }
    >
      {current ? "Sign out" : "Revoke"}
    </ActionButton>
  );
}
