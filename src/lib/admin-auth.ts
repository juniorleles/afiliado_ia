import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAppEnv, isProduction } from "@/lib/env";
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE_SEC,
  mintAdminSession,
  verifyAdminSession,
} from "@/lib/admin-session";

export class AdminAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AdminAuthError";
  }
}

export function adminPasswordConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

export function adminAuthRequired(): boolean {
  if (isProduction()) return true;
  if (getAppEnv() === "test") return process.env.AIA_REQUIRE_ADMIN === "1";
  return adminPasswordConfigured();
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyAdminPassword(candidate: string): boolean {
  const expected = process.env.ADMIN_PASSWORD?.trim();
  if (!expected || !candidate) return false;
  const left = digest(candidate);
  const right = digest(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function createAdminSessionCookie(): Promise<{ name: string; value: string; maxAge: number } | null> {
  const value = await mintAdminSession();
  if (!value) return null;
  return { name: ADMIN_COOKIE, value, maxAge: ADMIN_SESSION_MAX_AGE_SEC };
}

export async function hasValidAdminSession(token?: string | null): Promise<boolean> {
  if (token) return verifyAdminSession(token);
  const store = await cookies();
  return verifyAdminSession(store.get(ADMIN_COOKIE)?.value);
}

export async function requireAdmin(): Promise<void> {
  if (!adminAuthRequired()) return;
  if (await hasValidAdminSession()) return;
  redirect("/admin/login");
}

export async function requireAdminApi(request: Request): Promise<Response | null> {
  if (!adminAuthRequired()) return null;
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  const token = match ? decodeURIComponent(match[1]!) : null;
  if (await verifyAdminSession(token)) return null;
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

export function adminCookieOptions(https: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SEC,
    secure: https || isProduction(),
  };
}
