import type { Metadata } from "next";
import { requireOrgContext } from "@/server/authz/context";
import { can } from "@/server/authz/permissions";
import { listCatalogFrameworks } from "@/features/frameworks/server/service";
import { loadFrameworks } from "@/features/readiness/server/snapshot";
import { AdoptFrameworkForm, ScopeForm } from "@/features/organizations/components/settings-forms";
import { Panel } from "@/components/app/primitives";

export const metadata: Metadata = { title: "Frameworks & scope" };

export default async function FrameworkSettingsPage({
  params,
}: PageProps<"/org/[orgSlug]/settings/frameworks">) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const [catalog, adopted] = await Promise.all([
    listCatalogFrameworks(),
    loadFrameworks(ctx.org.id),
  ]);
  const canManage = can(ctx, "framework.manage");

  return (
    <div className="flex flex-col gap-4">
      {catalog.map((f) => {
        const a = adopted.find((x) => x.key === f.key);
        const inScope = a
          ? f.requirements.filter((c) => a.inScopeCategoryIds.includes(c.id)).map((c) => c.code)
          : [];
        return (
          <Panel key={f.key} className="max-w-3xl p-5">
            <div className="mb-3">
              <h2 className="text-sm font-semibold">{f.name}</h2>
              <p className="text-muted-foreground mt-0.5 text-[13px]">{f.description}</p>
            </div>
            {a ? (
              <>
                <ScopeForm
                  orgSlug={ctx.org.slug}
                  frameworkKey={f.key}
                  categories={f.requirements}
                  inScope={inScope}
                  readOnly={!canManage}
                />
                {canManage ? (
                  <details className="border-border mt-4 border-t pt-3 text-[13px]">
                    <summary className="text-muted-foreground cursor-pointer">
                      Re-run starter control set
                    </summary>
                    <div className="mt-3">
                      <AdoptFrameworkForm
                        orgSlug={ctx.org.slug}
                        frameworkKey={f.key}
                        categories={f.requirements.filter((c) => inScope.includes(c.code))}
                        templateCount={f._count.controlTemplates}
                      />
                    </div>
                  </details>
                ) : null}
              </>
            ) : canManage ? (
              <AdoptFrameworkForm
                orgSlug={ctx.org.slug}
                frameworkKey={f.key}
                categories={f.requirements}
                templateCount={f._count.controlTemplates}
              />
            ) : (
              <p className="text-muted-foreground text-[13px]">
                Not adopted. Ask an Owner or Admin to adopt it.
              </p>
            )}
          </Panel>
        );
      })}
    </div>
  );
}
