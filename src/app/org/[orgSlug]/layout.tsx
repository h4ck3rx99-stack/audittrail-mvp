import { requireOrgContext } from "@/server/authz/context";
import { ROLE_LABELS } from "@/server/authz/permissions";
import { getShellData } from "@/features/shell/server/queries";
import { AppShell } from "@/components/app/shell";

export default async function OrgLayout({ children, params }: LayoutProps<"/org/[orgSlug]">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const shell = await getShellData(ctx);
  return (
    <AppShell
      org={{ slug: ctx.org.slug, name: ctx.org.name, isDemo: ctx.org.isDemo }}
      user={{ name: ctx.user.name, email: ctx.user.email }}
      role={ROLE_LABELS[ctx.role]}
      orgs={shell.orgs.map((o) => ({ slug: o.slug, name: o.name, role: ROLE_LABELS[o.role], isDemo: o.isDemo }))}
      counts={shell.counts}
      unread={shell.unread}
      permissions={shell.permissions}
    >
      {children}
    </AppShell>
  );
}
