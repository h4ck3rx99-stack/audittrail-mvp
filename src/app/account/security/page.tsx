import type { Metadata } from "next";
import { requireUserContext } from "@/server/authz/context";
import { listOwnSessions, listOwnSignInHistory } from "@/server/auth/service";
import { describeAction } from "@/server/audit/describe";
import { ChangePasswordForm, RevokeSessionButton } from "@/features/auth/components/account-forms";
import {
  SectionTitle,
  Table,
  TableWrap,
  Td,
  Th,
  THead,
  Tr,
  TimeAgo,
} from "@/components/app/primitives";
import { StatusBadge } from "@/components/app/status";

export const metadata: Metadata = { title: "Security" };

function device(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function SecurityPage() {
  const ctx = await requireUserContext();
  const [sessions, history] = await Promise.all([
    listOwnSessions(ctx),
    listOwnSignInHistory(ctx, 30),
  ]);
  // Account pages are not tied to an organization; absolute times are shown in UTC.
  const tz = "UTC";

  return (
    <div className="flex flex-col gap-8">
      <section>
        <SectionTitle>Change password</SectionTitle>
        <ChangePasswordForm />
      </section>

      <section>
        <SectionTitle>Active sessions</SectionTitle>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <Th>Device</Th>
                <Th>IP address</Th>
                <Th>Signed in</Th>
                <Th>Last active</Th>
                <Th className="w-28" />
              </tr>
            </THead>
            <tbody>
              {sessions.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    {device(s.userAgent)}{" "}
                    {s.current ? (
                      <StatusBadge tone="success" label="This session" className="ml-1" />
                    ) : null}
                  </Td>
                  <Td className="mono text-muted-foreground">{s.ipAddress ?? "Unknown"}</Td>
                  <Td className="text-muted-foreground">
                    <TimeAgo date={s.createdAt} timeZone={tz} />
                  </Td>
                  <Td className="text-muted-foreground">
                    <TimeAgo date={s.lastActiveAt} timeZone={tz} />
                  </Td>
                  <Td className="text-right">
                    <RevokeSessionButton sessionId={s.id} current={s.current} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </section>

      <section>
        <SectionTitle>Sign-in history</SectionTitle>
        <p className="text-muted-foreground mb-2 text-xs">
          From your personal audit chain: sign-ins, failed attempts, password and session changes.
        </p>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-[13px]">No events yet.</p>
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <Th>Event</Th>
                  <Th>IP address</Th>
                  <Th>When</Th>
                </tr>
              </THead>
              <tbody>
                {history.map((h) => (
                  <Tr key={h.id}>
                    <Td className={h.action === "user.login_failed" ? "text-danger" : undefined}>
                      {describeAction(h)}
                    </Td>
                    <Td className="mono text-muted-foreground">{h.ipAddress ?? "Unknown"}</Td>
                    <Td className="text-muted-foreground">
                      <TimeAgo date={h.occurredAt} timeZone={tz} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        )}
      </section>
    </div>
  );
}
