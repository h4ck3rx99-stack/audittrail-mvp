import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  changePassword,
  login,
  logout,
  requestPasswordReset,
  resetPassword,
  signUp,
} from "@/server/auth/service";
import { validateSessionToken } from "@/server/auth/session";
import { getEmailProvider, MemoryEmailProvider } from "@/server/email";
import { RateLimitedError, ValidationError } from "@/server/errors";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { resetDatabase } from "../helpers/db";
import {
  addMember,
  createOrg,
  createUser,
  TEST_PASSWORD,
  testRequest,
  userContext,
} from "../helpers/factories";

const PASSWORD = "a-perfectly-fine-passphrase-9";

async function lastResetToken(): Promise<string> {
  const provider = getEmailProvider() as MemoryEmailProvider;
  // Reset emails are sent after commit without awaiting; give the microtask queue a moment.
  for (let i = 0; i < 20 && provider.sent.length === 0; i++)
    await new Promise((r) => setTimeout(r, 10));
  const text = provider.sent.at(-1)?.text ?? "";
  const m = /token=([A-Za-z0-9_%-]+)/.exec(text);
  if (!m?.[1]) throw new Error("no reset link sent");
  return decodeURIComponent(m[1]);
}

describe("authentication", () => {
  beforeEach(async () => {
    await resetDatabase();
    (getEmailProvider() as MemoryEmailProvider).sent.length = 0;
  });

  it("signs up with validation, normalizes the email and audits the sign-up", async () => {
    await expect(
      signUp({ name: "", email: "x@example.test", password: PASSWORD }, testRequest()),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      signUp({ name: "A", email: "not-an-email", password: PASSWORD }, testRequest()),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      signUp({ name: "A", email: "a@example.test", password: "short" }, testRequest()),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      signUp({ name: "A", email: "a@example.test", password: "password1234" }, testRequest()),
    ).rejects.toThrow(/stronger/);

    const { user, token } = await signUp(
      { name: "Ann", email: "  Ann@Example.TEST ", password: PASSWORD },
      testRequest(),
    );
    expect(user.email).toBe("ann@example.test");
    expect(await validateSessionToken(token)).toMatchObject({ user: { id: user.id } });
    const session = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(session.tokenHash).not.toBe(token);
    const account = await db.account.findUniqueOrThrow({ where: { userId: user.id } });
    expect(account.passwordHash.startsWith("scrypt$")).toBe(true);
    const events = await db.auditEvent.findMany({
      where: { chainKey: `user:${user.id}` },
      orderBy: { sequence: "asc" },
    });
    expect(events.map((e) => e.action)).toEqual(["user.signed_up", "user.logged_in"]);
    expect(JSON.stringify(events.map((e) => [e.changes, e.metadata]))).not.toContain(PASSWORD);

    await expect(
      signUp(
        { name: "Dup", email: "ann@example.test", password: PASSWORD },
        testRequest({ ip: "198.51.100.9" }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("logs in with correct credentials and fails generically otherwise", async () => {
    const user = await createUser({ email: "bob@example.test" });
    const org = await createOrg();
    await addMember(org.id, user.id, "MEMBER");
    const ok = await login({ email: "BOB@example.test", password: TEST_PASSWORD }, testRequest());
    expect(await validateSessionToken(ok.token)).not.toBeNull();
    const second = await login(
      { email: "bob@example.test", password: TEST_PASSWORD },
      testRequest(),
    );
    expect(second.token).not.toBe(ok.token); // a new session on every login

    await expect(
      login({ email: "bob@example.test", password: "wrong-password-123" }, testRequest()),
    ).rejects.toThrow("Invalid email or password.");
    await expect(
      login({ email: "nobody@example.test", password: "wrong-password-123" }, testRequest()),
    ).rejects.toThrow("Invalid email or password.");

    const userEvents = await db.auditEvent.findMany({
      where: { chainKey: `user:${user.id}` },
      orderBy: { sequence: "asc" },
    });
    expect(userEvents.map((e) => e.action)).toEqual([
      "user.logged_in",
      "user.logged_in",
      "user.login_failed",
    ]);
    // Member sign-ins are visible in the organization's chain, with the role in that org.
    const orgEvents = await db.auditEvent.findMany({ where: { organizationId: org.id } });
    expect(orgEvents.map((e) => [e.action, e.actorRole])).toEqual([
      ["member.logged_in", "MEMBER"],
      ["member.logged_in", "MEMBER"],
    ]);
    // Unknown accounts produce no events.
    expect(await db.auditEvent.count({ where: { resourceLabel: "nobody@example.test" } })).toBe(0);
  });

  it("rate limits login per IP and email", async () => {
    await createUser({ email: "carol@example.test" });
    const req = testRequest({ ip: "203.0.113.77" });
    for (let i = 0; i < 5; i++) {
      await expect(
        login({ email: "carol@example.test", password: "wrong-password-123" }, req),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(
      login({ email: "carol@example.test", password: TEST_PASSWORD }, req),
    ).rejects.toBeInstanceOf(RateLimitedError);
    // Another IP is not affected by the per-IP+email limit.
    const other = await login(
      { email: "carol@example.test", password: TEST_PASSWORD },
      testRequest({ ip: "203.0.113.78" }),
    );
    expect(other.token).toBeTruthy();
  });

  it("logout invalidates the session; expired and revoked sessions are rejected", async () => {
    const user = await createUser({ email: "dave@example.test" });
    const { token, sessionId } = await login(
      { email: "dave@example.test", password: TEST_PASSWORD },
      testRequest(),
    );
    await logout(userContext(user, sessionId));
    expect(await validateSessionToken(token)).toBeNull();

    const s2 = await login({ email: "dave@example.test", password: TEST_PASSWORD }, testRequest());
    await db.session.update({
      where: { id: s2.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await validateSessionToken(s2.token)).toBeNull();

    const s3 = await login({ email: "dave@example.test", password: TEST_PASSWORD }, testRequest());
    await db.session.update({
      where: { id: s3.sessionId },
      data: { createdAt: new Date(Date.now() - 31 * 86_400_000) },
    });
    expect(await validateSessionToken(s3.token)).toBeNull(); // absolute lifetime exceeded
    expect(await validateSessionToken("garbage")).toBeNull();
  });

  it("password reset: generic response, single-use token, expiry, revokes sessions", async () => {
    await createUser({ email: "erin@example.test" });
    const session = await login(
      { email: "erin@example.test", password: TEST_PASSWORD },
      testRequest(),
    );

    await expect(
      requestPasswordReset({ email: "unknown@example.test" }, testRequest()),
    ).resolves.toBeUndefined();
    await requestPasswordReset({ email: "erin@example.test" }, testRequest());
    const token = await lastResetToken();
    const stored = await db.verification.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(token);

    await resetPassword({ token, password: "brand-new-passphrase-77" }, testRequest());
    expect(await validateSessionToken(session.token)).toBeNull();
    await expect(
      resetPassword({ token, password: "another-passphrase-88" }, testRequest()),
    ).rejects.toThrow(/invalid or has expired/);
    await login({ email: "erin@example.test", password: "brand-new-passphrase-77" }, testRequest());

    await requestPasswordReset({ email: "erin@example.test" }, testRequest());
    const expiring = await lastResetToken();
    await db.verification.updateMany({
      where: { consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(
      resetPassword({ token: expiring, password: "yet-another-passphrase-9" }, testRequest()),
    ).rejects.toThrow(/expired/);
  });

  it("change password requires the current password and revokes other sessions", async () => {
    const user = await createUser({ email: "fay@example.test" });
    const a = await login({ email: "fay@example.test", password: TEST_PASSWORD }, testRequest());
    const b = await login({ email: "fay@example.test", password: TEST_PASSWORD }, testRequest());
    await expect(
      changePassword(userContext(user, a.sessionId), {
        currentPassword: "nope-nope-nope-1",
        newPassword: "fresh-passphrase-123",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await changePassword(userContext(user, a.sessionId), {
      currentPassword: TEST_PASSWORD,
      newPassword: "fresh-passphrase-123",
    });
    expect(await validateSessionToken(a.token)).not.toBeNull();
    expect(await validateSessionToken(b.token)).toBeNull();
  });

  it("only allows same-origin relative redirect targets", () => {
    expect(safeRedirectPath("/org/acme/controls?x=1")).toBe("/org/acme/controls?x=1");
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil",
      "/\u0000x",
      42,
      null,
    ]) {
      expect(safeRedirectPath(bad, "/org")).toBe("/org");
    }
  });
});
