"use server";

import { runAction, type ActionResult } from "@/server/result";
import { resolveOrgContextForAction } from "@/server/authz/context";
import { searchOrganization, type SearchResults } from "./server/service";

export async function searchAction(
  orgSlug: string,
  query: string,
): Promise<ActionResult<SearchResults>> {
  return runAction(
    "search",
    async () => {
      const ctx = await resolveOrgContextForAction(orgSlug);
      return searchOrganization(ctx, typeof query === "string" ? query : "", { perGroup: 5 });
    },
    { refresh: false },
  );
}
