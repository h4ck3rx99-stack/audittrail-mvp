import { db } from "@/server/db";
import { logger } from "@/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness and database connectivity. No sensitive output. */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", database: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error({ err: error }, "health check failed");
    return Response.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
