"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminCookieOptions, createAdminSessionCookie, verifyAdminPassword } from "@/lib/admin-auth";
import { isProduction } from "@/lib/env";
import { logEvent } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";

export type LoginState = { error?: string };

export async function loginAdminAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const limited = rateLimit("admin-login-action", 10, 60_000);
  if (!limited.ok) return { error: "Too many attempts. Try again shortly." };
  const password = String(formData.get("password") ?? "");
  if (!verifyAdminPassword(password)) {
    logEvent("WARN", "AUTH", "admin login failed", { ip: "omitted" });
    return { error: "Invalid password." };
  }
  const session = await createAdminSessionCookie();
  if (!session) return { error: "Admin session secret is not configured." };
  const store = await cookies();
  store.set(session.name, session.value, adminCookieOptions(isProduction()));
  logEvent("INFO", "AUTH", "admin login ok");
  const next = String(formData.get("next") ?? "/admin");
  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function logoutAdminAction(): Promise<void> {
  const store = await cookies();
  store.set("aia_adm", "", { path: "/", maxAge: 0 });
  redirect("/admin/login");
}
