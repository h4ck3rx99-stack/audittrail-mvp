"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runAction, type ActionResult } from "@/server/result";
import { getRequestMeta } from "@/server/request-meta";
import { SESSION_COOKIE, sessionCookieOptions, LAST_ORG_COOKIE } from "@/server/auth/cookies";
import {
  changePassword,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  revokeOwnSession,
  signUp,
  updateProfile,
} from "@/server/auth/service";
import { resolveUserContextForAction } from "@/server/authz/context";
import { formDataToObject } from "@/server/validation";
import { safeRedirectPath } from "@/lib/safe-redirect";

async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function signUpAction(_prev: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const next = safeRedirectPath(formData.get("next"), "/onboarding");
  const result = await runAction(
    "auth.signUp",
    async () => {
      const { token } = await signUp(formDataToObject(formData), await getRequestMeta());
      await setSessionCookie(token);
      return null;
    },
    { refresh: false },
  );
  if (result.ok) redirect(next);
  return result;
}

export async function loginAction(_prev: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const next = safeRedirectPath(formData.get("next"), "/org");
  const result = await runAction(
    "auth.login",
    async () => {
      const { token } = await login(formDataToObject(formData), await getRequestMeta());
      await setSessionCookie(token);
      return null;
    },
    { refresh: false },
  );
  if (result.ok) redirect(next);
  return result;
}

export async function logoutAction(): Promise<void> {
  try {
    const ctx = await resolveUserContextForAction();
    await logout(ctx);
  } catch {
    // Not signed in (or session already gone): still clear the cookie below.
  }
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(LAST_ORG_COOKIE);
  redirect("/login");
}

export async function forgotPasswordAction(_prev: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction(
    "auth.forgotPassword",
    async () => {
      await requestPasswordReset(formDataToObject(formData), await getRequestMeta());
      return null;
    },
    { refresh: false },
  );
}

export async function resetPasswordAction(_prev: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  const result = await runAction(
    "auth.resetPassword",
    async () => {
      await resetPassword(formDataToObject(formData), await getRequestMeta());
      (await cookies()).delete(SESSION_COOKIE);
      return null;
    },
    { refresh: false },
  );
  if (result.ok) redirect("/login?reset=1");
  return result;
}

export async function changePasswordAction(_prev: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction("auth.changePassword", async () => {
    await changePassword(await resolveUserContextForAction(), formDataToObject(formData));
    return null;
  });
}

export async function updateProfileAction(_prev: ActionResult<null> | null, formData: FormData): Promise<ActionResult<null>> {
  return runAction("auth.updateProfile", async () => {
    await updateProfile(await resolveUserContextForAction(), formDataToObject(formData));
    return null;
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionResult<{ current: boolean }>> {
  const result = await runAction("auth.revokeSession", async () => {
    const ctx = await resolveUserContextForAction();
    await revokeOwnSession(ctx, sessionId);
    return { current: ctx.sessionId === sessionId };
  });
  if (result.ok && result.data.current) {
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/login");
  }
  return result;
}
