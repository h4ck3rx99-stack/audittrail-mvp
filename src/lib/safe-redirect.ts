/**
 * Validates a user-supplied `next` / `returnTo` value as a same-origin relative path.
 * Anything else (absolute URLs, protocol-relative URLs, backslash tricks, control characters)
 * falls back to the provided default. Prevents open redirects.
 */
export function safeRedirectPath(value: unknown, fallback = "/org"): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith("/")) return fallback;
  // "//evil.com" and "/\evil.com" are treated as protocol-relative by browsers.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    // Control characters and backslashes are never valid in our redirect targets.
    if (c < 0x20 || c === 0x7f || c === 0x5c) return fallback;
  }
  try {
    const base = "http://audittrail.invalid";
    const url = new URL(value, base);
    if (url.origin !== base) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
