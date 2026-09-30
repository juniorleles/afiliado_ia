import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  generateSessionId,
  isValidSessionId,
  SESSION_COOKIE,
  SESSION_HEADER,
  SESSION_MAX_AGE_SEC,
} from "@/lib/analytics";
import { ADMIN_COOKIE, INTERNAL_FRAME_HEADER, verifyAdminSession, verifyInternalFrameHeader } from "@/lib/admin-session";
import { adminAuthBypassed, labRoutesOpenWithoutCredential } from "@/lib/access-policy";
import { isProduction, configuredOrigin } from "@/lib/env";
import { applyHeaders, securityHeaders } from "@/lib/security-headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";

function classifyPath(pathname: string): "PUBLIC" | "ADMIN" | "INTERNAL" | "WEBHOOK" | "STATIC" {
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") return "STATIC";
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) return "ADMIN";
  if (pathname.startsWith("/visual-frame") || pathname.startsWith("/preview")) return "INTERNAL";
  if (pathname.startsWith("/api/clickbank/ins")) return "WEBHOOK";
  return "PUBLIC";
}

function isHttps(request: NextRequest): boolean {
  if (isProduction()) return true;
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]!.trim() === "https";
  return request.nextUrl.protocol === "https:";
}

function originOk(request: NextRequest): boolean {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return true;
  const origin = request.headers.get("origin");
  const host = request.nextUrl.host;
  if (!origin) {
    const referer = request.headers.get("referer");
    if (!referer) return request.method !== "POST";
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function adminAllowed(request: NextRequest): Promise<boolean> {
  if (adminAuthBypassed()) return true;
  const token = request.cookies.get(ADMIN_COOKIE)?.value;
  return verifyAdminSession(token);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const kind = classifyPath(pathname);
  const https = isHttps(request);
  const requestHeaders = new Headers(request.headers);

  if (kind === "ADMIN" && ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && !originOk(request)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (kind === "ADMIN" && pathname === "/admin/login" && request.method === "POST") {
    const limited = rateLimit(`login:${clientIp(request)}`, 8, 60_000);
    if (!limited.ok) return new NextResponse("Too Many Requests", { status: 429 });
  }

  if (kind === "ADMIN" && !pathname.startsWith("/admin/login")) {
    if (!(await adminAllowed(request))) {
      if (pathname.startsWith("/api/admin")) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      const login = request.nextUrl.clone();
      login.pathname = "/admin/login";
      login.search = `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(login);
    }
  }

  if (kind === "INTERNAL") {
    const internalOk = verifyInternalFrameHeader(request.headers.get(INTERNAL_FRAME_HEADER));
    const sessionOk = await adminAllowed(request);
    const openDev = labRoutesOpenWithoutCredential();
    if (!internalOk && !sessionOk && !openDev) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  if (pathname.startsWith("/p/")) {
    const existing = request.cookies.get(SESSION_COOKIE)?.value;
    const sessionId = existing && isValidSessionId(existing) ? existing : generateSessionId();
    requestHeaders.set(SESSION_HEADER, sessionId);
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    decorate(response, request, kind, https);
    if (!existing || existing !== sessionId) {
      response.cookies.set({
        name: SESSION_COOKIE,
        value: sessionId,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_MAX_AGE_SEC,
        secure: https || isProduction(),
      });
    }
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  decorate(response, request, kind, https);
  return response;
}

function decorate(
  response: NextResponse,
  request: NextRequest,
  kind: ReturnType<typeof classifyPath>,
  https: boolean,
) {
  const frame = kind === "ADMIN" || kind === "INTERNAL" ? "'none'" : "'self'";
  applyHeaders(response.headers, securityHeaders({ https, frameAncestors: frame, scriptEval: !isProduction() }));
  response.headers.set("x-aia-route-class", kind);
  if (kind === "ADMIN" || kind === "INTERNAL" || kind === "WEBHOOK") {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store");
  } else if (request.nextUrl.pathname.startsWith("/api/track") || request.nextUrl.pathname.startsWith("/api/health")) {
    response.headers.set("Cache-Control", "no-store");
  } else if (request.nextUrl.pathname.startsWith("/media/product")) {
    response.headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  } else if (request.nextUrl.pathname.startsWith("/p/")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  if (isProduction() && configuredOrigin() && request.nextUrl.protocol === "http:" && request.headers.get("x-forwarded-proto") !== "https") {
    // TLS is terminated at the proxy; do not redirect here without X-Forwarded-Proto.
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
