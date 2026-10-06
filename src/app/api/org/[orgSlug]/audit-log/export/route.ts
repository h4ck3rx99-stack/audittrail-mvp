import { errorResponse } from "@/server/http";
import { orgContextFromRequest } from "@/server/route-context";
import { auditLogQuerySchema, exportAuditLogCsv } from "@/features/audit/server/service";
import { contentDisposition } from "@/server/storage";

export const runtime = "nodejs";

/** Streams the filtered audit log as CSV (Owner/Admin). The export itself is audited. */
export async function GET(request: Request, { params }: RouteContext<"/api/org/[orgSlug]/audit-log/export">) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const { orgSlug } = await params;
    const ctx = await orgContextFromRequest(request, orgSlug);
    const query = auditLogQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const { stream, filename } = await exportAuditLogCsv(ctx, query);
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(filename, false),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
