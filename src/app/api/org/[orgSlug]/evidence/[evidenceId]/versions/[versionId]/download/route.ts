import { errorResponse } from "@/server/http";
import { orgContextFromRequest } from "@/server/route-context";
import { prepareEvidenceDownload } from "@/features/evidence/server/service";
import { contentDisposition, getStorage } from "@/server/storage";

export const runtime = "nodejs";

/**
 * Authorized, audited evidence download. Streams the file (local driver) or redirects to a
 * presigned URL valid for 60 seconds (S3 driver). `?inline=1` is honored only for image previews.
 * Recording the download in the audit log is the only state change (acceptable for GET).
 */
export async function GET(
  request: Request,
  {
    params,
  }: RouteContext<"/api/org/[orgSlug]/evidence/[evidenceId]/versions/[versionId]/download">,
) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const { orgSlug, evidenceId, versionId } = await params;
    const ctx = await orgContextFromRequest(request, orgSlug);
    const wantsInline = new URL(request.url).searchParams.get("inline") === "1";
    const version = await prepareEvidenceDownload(
      ctx,
      evidenceId,
      versionId,
      wantsInline ? "preview" : "download",
    );
    const inline = wantsInline && version.mimeType.startsWith("image/");

    const storage = getStorage();
    const common = {
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    };
    if (storage.getSignedDownloadUrl) {
      const url = await storage.getSignedDownloadUrl(version.storageKey, {
        filename: version.originalFilename,
        contentType: version.mimeType,
        inline,
      });
      return new Response(null, { status: 302, headers: { ...common, Location: url } });
    }
    const stream = await storage.getStream(version.storageKey);
    return new Response(stream, {
      status: 200,
      headers: {
        ...common,
        "Content-Type": version.mimeType,
        "Content-Length": String(version.sizeBytes),
        "Content-Disposition": contentDisposition(version.originalFilename, inline),
      },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
