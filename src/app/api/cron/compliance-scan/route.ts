import { env } from "@/env";
import { errorResponse } from "@/server/http";
import { timingSafeEqualString } from "@/server/auth/tokens";
import { runComplianceScan } from "@/server/jobs/compliance-scan";

export const runtime = "nodejs";

/** Scheduled compliance scan. Protected by `Authorization: Bearer <CRON_SECRET>`. */
export async function POST(request: Request) {
  const expected = env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !provided || !timingSafeEqualString(provided, expected)) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Invalid cron credentials." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const summary = await runComplianceScan();
    return Response.json({ ok: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
