"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { approveCatalogImages, decideCatalogImage } from "@/lib/real-product-assets/approve";
import { discoverFromUrls } from "@/lib/real-product-assets/discover";
import { productKeyFromName } from "@/lib/real-product-assets/extract";
import { DEFAULT_STORE_ROOT, readCatalog, writeCatalog } from "@/lib/real-product-assets/store";
import { diskFreeGb, DISK_STOP_GB } from "@/lib/quality-gate/disk";

function refresh(productKey?: string) {
  try {
    revalidatePath("/admin/lab/real-assets");
    if (productKey) {
      revalidatePath(`/admin/lab/real-assets/${productKey}`);
      revalidatePath(`/admin/lab/renderer-v4/real/${productKey}`);
    }
  } catch (err) {
    const reason = err instanceof Error ? err.message : "revalidate failed";
    console.error("[real-assets] revalidate failed", { productKey, reason });
  }
}

function idsFrom(formData: FormData, keys: string[]): string[] {
  const found: string[] = [];
  for (const key of keys) {
    for (const value of formData.getAll(key)) {
      const id = String(value).trim();
      if (id && !found.includes(id)) found.push(id);
    }
  }
  return found;
}

function isNextRedirect(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_REDIRECT"));
}

function go(productKey: string, query: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  redirect(`/admin/lab/real-assets/${productKey}${suffix ? `?${suffix}` : ""}`);
}

export async function discoverRealAssetsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  if (diskFreeGb() < DISK_STOP_GB) return;
  const productName = String(formData.get("productName") ?? "").trim();
  const urls = String(formData.get("urls") ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!productName || urls.length === 0) return;
  const existing = readCatalog(productKeyFromName(productName));
  const { catalog } = await discoverFromUrls({ productName, urls, catalog: existing ?? undefined });
  writeCatalog(catalog);
  refresh(catalog.productKey);
  redirect(`/admin/lab/real-assets/${catalog.productKey}`);
}

export async function approveSelectedRealAssetsAction(formData: FormData): Promise<void> {
  const productKey = String(formData.get("productKey") ?? "").trim();
  try {
    await requireAdmin();
    const imageIds = idsFrom(formData, ["imageId"]);
    const catalog = readCatalog(productKey);
    if (!catalog) return go(productKey || "missing", { error: "catalog" });
    if (imageIds.length === 0) return go(productKey, { error: "empty" });
    const { catalog: next, results } = await approveCatalogImages({
      catalog,
      imageIds,
      actor: "lab-operator",
      root: DEFAULT_STORE_ROOT,
    });
    writeCatalog(next);
    refresh(productKey);
    const approved = results.filter((item) => item.ok).length;
    const failed = results.filter((item) => !item.ok).length;
    return go(productKey, {
      approved: approved ? String(approved) : "",
      failed: failed ? String(failed) : "",
    });
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const reason = err instanceof Error ? err.message : "approve failed";
    console.error("[real-assets] approve action failed", { reason });
    return go(productKey || "missing", { error: "approve" });
  }
}

export async function decideRealAssetAction(formData: FormData): Promise<void> {
  const productKey = String(formData.get("productKey") ?? "").trim();
  try {
    await requireAdmin();
    const approveOne = String(formData.get("approveOne") ?? "").trim();
    const rejectOne = String(formData.get("rejectOne") ?? "").trim();
    const revokeOne = String(formData.get("revokeOne") ?? "").trim();
    const catalog = readCatalog(productKey);
    if (!catalog) return go(productKey || "missing", { error: "catalog" });

    if (approveOne) {
      const { catalog: next, results } = await approveCatalogImages({
        catalog,
        imageIds: [approveOne],
        actor: "lab-operator",
        root: DEFAULT_STORE_ROOT,
      });
      writeCatalog(next);
      refresh(productKey);
      return go(productKey, results[0]?.ok ? { approved: "1" } : { failed: "1", error: "approve" });
    }

    const imageId = rejectOne || revokeOne;
    const status = rejectOne ? "REJECTED" : "REVOKED";
    if (!imageId) return go(productKey, { error: "empty" });
    const decided = decideCatalogImage({ catalog, imageId, actor: "lab-operator", status });
    if ("error" in decided) return go(productKey, { error: "update" });
    writeCatalog(decided.catalog);
    refresh(productKey);
    return go(productKey, rejectOne ? { rejected: "1" } : { revoked: "1" });
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const reason = err instanceof Error ? err.message : "decide failed";
    console.error("[real-assets] decide action failed", { reason });
    return go(productKey || "missing", { error: "update" });
  }
}
