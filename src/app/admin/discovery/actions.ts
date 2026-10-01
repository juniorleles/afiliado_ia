"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin-auth";
import { getDiscoveryRuntime } from "@/lib/discovery/discovery-runtime";

/**
 * Administrative toggles only. These change whether a source or schedule is
 * enabled, paused, or resumed in memory. Nothing here runs discovery, a
 * crawler, an API call, or a queue worker.
 */

function safeReturn(value: FormDataEntryValue | null, fallback: string): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/admin/discovery") && !path.startsWith("//") && !path.includes("://") ? path : fallback;
}

function finish(path: string, error: string | null): never {
  revalidatePath("/admin/discovery", "layout");
  const separator = path.includes("?") ? "&" : "?";
  redirect(error ? `${path}${separator}error=${encodeURIComponent(error.slice(0, 200))}` : path);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "The action failed.";
}

export async function toggleSourceAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "");
  const returnTo = safeReturn(formData.get("returnTo"), "/admin/discovery/sources");
  let error: string | null = null;
  try {
    const { registry } = getDiscoveryRuntime();
    if (op === "enable") registry.enable(id);
    else if (op === "disable") registry.disable(id);
    else error = "Unknown action.";
  } catch (caught) {
    error = message(caught);
  }
  finish(returnTo, error);
}

export async function scheduleControlAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const op = String(formData.get("op") ?? "");
  const returnTo = safeReturn(formData.get("returnTo"), "/admin/discovery/scheduler");
  let error: string | null = null;
  try {
    const { scheduler } = getDiscoveryRuntime();
    if (op === "pause") scheduler.pause(id);
    else if (op === "resume") scheduler.resume(id);
    else if (op === "enable") scheduler.enable(id);
    else if (op === "disable") scheduler.disable(id);
    else error = "Unknown action.";
  } catch (caught) {
    error = message(caught);
  }
  finish(returnTo, error);
}
