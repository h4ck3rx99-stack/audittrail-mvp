import "server-only";
import { randomUUID } from "node:crypto";
import { env } from "@/env";

export type RequestMeta = {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
};

const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Resolves the client IP. X-Forwarded-For is only read when TRUST_PROXY > 0, and then only the
 * entry appended by the outermost trusted proxy is used (counting from the right), so a client
 * cannot spoof its address by sending its own X-Forwarded-For header.
 */
export function clientIpFromHeaders(
  headers: Headers,
  trustedHops = env.TRUST_PROXY,
): string | null {
  if (trustedHops <= 0) return null;
  const xff = headers.get("x-forwarded-for");
  if (!xff) return null;
  const entries = xff
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidate = entries[entries.length - trustedHops];
  if (!candidate) return null;
  const ip = candidate.replace(/^\[|\]$/g, "").replace(/^::ffff:/, "");
  return IP_RE.test(ip) ? ip : null;
}

export function requestMetaFromHeaders(headers: Headers): RequestMeta {
  const incomingId = headers.get("x-request-id");
  return {
    ip: clientIpFromHeaders(headers),
    userAgent: headers.get("user-agent")?.slice(0, 512) ?? null,
    requestId: incomingId && /^[A-Za-z0-9-]{8,64}$/.test(incomingId) ? incomingId : randomUUID(),
  };
}

/** Request metadata for Server Components and Server Actions. */
export async function getRequestMeta(): Promise<RequestMeta> {
  const { headers } = await import("next/headers");
  return requestMetaFromHeaders(await headers());
}

/** Metadata for work not triggered by an HTTP request (CLI scripts, seed, cron in-process). */
export function systemRequestMeta(label: string): RequestMeta {
  return { ip: null, userAgent: label, requestId: randomUUID() };
}
