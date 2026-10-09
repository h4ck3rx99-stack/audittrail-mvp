import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (formerly middleware). NOT a security boundary: it only
 *  - generates a per-request CSP nonce and request ID,
 *  - forwards the current path so server-side auth can build ?next= redirects,
 *  - optimistically redirects requests without any session cookie away from app pages.
 * Every page, action and route handler re-validates the session and membership on the server.
 */

const PROTECTED_PREFIXES = ["/org", "/account", "/onboarding"];
const SESSION_COOKIES = ["audittrail_session", "__Host-audittrail_session"];

function buildCsp(nonce: string, isDev: boolean, https: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used for computed widths (progress bars) and by Radix
    // positioning; see docs/SECURITY.md for this tradeoff. Scripts remain nonce-only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = SESSION_COOKIES.some((name) => request.cookies.has(name));

  if (
    !hasSession &&
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestId = crypto.randomUUID();
  const csp = buildCsp(
    nonce,
    process.env.NODE_ENV === "development",
    request.nextUrl.protocol === "https:",
  );

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("x-request-id", requestId);
  headers.set("x-url-path", `${pathname}${search}`);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Request-Id", requestId);

  // Convenience only: remember the last organization visited. It is re-authorized on every request.
  const orgMatch = /^\/org\/([a-z0-9][a-z0-9-]{1,46}[a-z0-9])(?:\/|$)/.exec(pathname);
  if (orgMatch?.[1] && hasSession) {
    response.cookies.set("audittrail_last_org", orgMatch[1], {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: 180 * 24 * 60 * 60,
    });
  }
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only. Route handlers under /api set their own headers (including the download sandbox CSP).
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
