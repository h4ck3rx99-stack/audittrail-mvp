import { requireOrgContext } from "@/server/authz/context";
import { PageHeader } from "@/components/app/primitives";
import { SettingsNav } from "@/components/app/settings-nav";

export default async function SettingsLayout({ children, params }: LayoutProps<"/org/[orgSlug]/settings">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const base = `/org/${ctx.org.slug}/settings`;
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader title="Settings" description={`Organization settings for ${ctx.org.name}.`} />
      <SettingsNav
        items={[
          { href: base, label: "General" },
          { href: `${base}/members`, label: "Members" },
          { href: `${base}/frameworks`, label: "Frameworks & scope" },
          { href: `${base}/evidence`, label: "Evidence policy" },
        ]}
      />
      {children}
    </div>
  );
}
