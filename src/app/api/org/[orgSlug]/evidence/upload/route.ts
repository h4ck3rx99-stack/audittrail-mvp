import { assertCan } from "@/server/authz/permissions";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { errorResponse, hasValidOrigin } from "@/server/http";
import { orgContextFromRequest } from "@/server/route-context";
import {
  addEvidenceVersion,
  enforceUploadRateLimit,
  MAX_UPLOAD_BYTES,
  uploadEvidenceFile,
} from "@/features/evidence/server/service";
import { env } from "@/env";

export const runtime = "nodejs";

const MAX_METADATA_BYTES = 16 * 1024;

/**
 * Evidence upload. A route handler (not a Server Action) so the body can be streamed with a hard
 * size cap. The file is the raw request body; metadata travels as base64url JSON in a header.
 *
 * Order: authenticate and authorize → Origin check → rate limit → stream with cap → validate
 * type (magic bytes) → hash → scan hook → store → audited transaction.
 */
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/org/[orgSlug]/evidence/upload">,
) {
  const requestId = request.headers.get("x-request-id") ?? undefined;
  try {
    const { orgSlug } = await params;
    const ctx = await orgContextFromRequest(request, orgSlug);
    assertCan(ctx, "evidence.contribute");
    if (!hasValidOrigin(request)) throw new ForbiddenError("Cross-origin request rejected.");
    await enforceUploadRateLimit(ctx);

    const metadata = parseMetadata(request.headers.get("x-evidence-metadata"));
    const filename = decodeHeader(request.headers.get("x-file-name")) ?? "";
    const declaredMime = request.headers.get("content-type");

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (declaredLength > MAX_UPLOAD_BYTES) throw tooLarge();
    const bytes = await readCapped(request, MAX_UPLOAD_BYTES);

    const file = { bytes, filename, declaredMime };
    const result =
      typeof metadata.evidenceId === "string"
        ? await addEvidenceVersion(ctx, file, metadata, { rateLimitChecked: true })
        : await uploadEvidenceFile(ctx, file, metadata, { rateLimitChecked: true });
    return Response.json(
      { ok: true, ...result },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

function tooLarge() {
  return new ValidationError(`Files can be at most ${env.MAX_UPLOAD_MB} MB.`, {
    file: [`Files can be at most ${env.MAX_UPLOAD_MB} MB.`],
  });
}

function decodeHeader(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 255);
  } catch {
    return null;
  }
}

function parseMetadata(header: string | null): Record<string, unknown> {
  if (!header) throw new ValidationError("Missing upload metadata.");
  if (header.length > MAX_METADATA_BYTES)
    throw new ValidationError("Upload metadata is too large.");
  try {
    const parsed: unknown = JSON.parse(Buffer.from(header, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new ValidationError("Upload metadata is invalid.");
  }
}

/** Streams the request body, aborting as soon as the cap is exceeded. */
async function readCapped(request: Request, cap: number): Promise<Uint8Array> {
  if (!request.body)
    throw new ValidationError("The file is empty.", { file: ["The file is empty."] });
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
