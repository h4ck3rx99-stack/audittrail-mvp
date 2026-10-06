"use client";

import Link from "next/link";
import { useActionForm, SubmitButton } from "@/components/app/actions";
import { Field, FormError, Input } from "@/components/ui/form-controls";
import { forgotPasswordAction, loginAction, resetPasswordAction, signUpAction } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const { formAction, state } = useActionForm(loginAction);
  const error = state && !state.ok ? state.error.message : null;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={error} />
      <Field label="Email" htmlFor="email">
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex items-center justify-between">
        <Link href="/forgot-password" className="text-[13px] text-accent hover:underline">
          Forgot password?
        </Link>
        <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
      </div>
    </form>
  );
}

export function SignUpForm({ next, defaultEmail }: { next: string; defaultEmail?: string }) {
  const { formAction, fieldErrors, formError, state } = useActionForm(signUpAction);
  const error = formError ?? (state && !state.ok && !state.error.fieldErrors ? state.error.message : null);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={error} />
      <Field label="Full name" htmlFor="name" errors={fieldErrors?.name}>
        <Input name="name" autoComplete="name" required autoFocus maxLength={100} />
      </Field>
      <Field label="Work email" htmlFor="email" errors={fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" required defaultValue={defaultEmail} maxLength={254} />
      </Field>
      <Field label="Password" htmlFor="password" errors={fieldErrors?.password} hint="At least 12 characters. Common passwords are rejected.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} />
      </Field>
      <SubmitButton pendingLabel="Creating account…" className="w-full">
        Create account
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { formAction, state, fieldErrors } = useActionForm(forgotPasswordAction);
  if (state?.ok) {
    return (
      <div className="rounded-sm border border-border p-3 text-[13px]" role="status">
        If an account exists for that email, we sent a link to reset the password. The link expires in 30 minutes.
      </div>
    );
  }
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field label="Email" htmlFor="email" errors={fieldErrors?.email}>
        <Input name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <SubmitButton pendingLabel="Sending…" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { formAction, state, fieldErrors } = useActionForm(resetPasswordAction);
  const error = state && !state.ok && !state.error.fieldErrors ? state.error.message : null;
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <FormError message={error} />
      <Field label="New password" htmlFor="password" errors={fieldErrors?.password} hint="At least 12 characters. All your sessions will be signed out.">
        <Input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} autoFocus />
      </Field>
      <SubmitButton pendingLabel="Saving…" className="w-full">
        Set new password
      </SubmitButton>
    </form>
  );
}
