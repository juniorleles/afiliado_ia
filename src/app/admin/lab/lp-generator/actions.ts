"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { runGeneration } from "@/lib/lp-generator/run";
import { readGeneration, readGenerationModel, writeGeneration, writeGenerationModel } from "@/lib/lp-generator/store";
import { readCatalog } from "@/lib/real-product-assets/store";
import { overlayApprovedAssets } from "@/lib/real-product-assets/overlay";

function isNextRedirect(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && "digest" in err && String((err as { digest?: string }).digest).startsWith("NEXT_REDIRECT"),
  );
}

export async function startLpGenerationAction(formData: FormData): Promise<void> {
  await requireAdmin();
  try {
    const force = String(formData.get("force") ?? "") === "1";
    const record = await runGeneration(
      {
        productName: formData.get("productName"),
        category: formData.get("category"),
        salesUrl: formData.get("salesUrl"),
        affiliateUrl: formData.get("affiliateUrl"),
        hopLink: formData.get("hopLink"),
        language: formData.get("language"),
        market: formData.get("market"),
        goal: formData.get("goal"),
      },
      { force },
    );
    revalidatePath("/admin/lab/lp-generator");
    revalidatePath(`/admin/lab/lp-generator/${record.id}`);
    redirect(`/admin/lab/lp-generator/${record.id}`);
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const reason = err instanceof Error ? err.message : "generation failed";
    redirect(`/admin/lab/lp-generator?error=${encodeURIComponent(reason)}`);
  }
}

export async function rerunLpGenerationAction(formData: FormData): Promise<void> {
  formData.set("force", "1");
  await startLpGenerationAction(formData);
}

function assetIdFromSrc(src: string): string {
  const parts = src.split("/");
  return parts[parts.length - 1] ?? "";
}

export async function applyApprovedAssetsAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("generationId") ?? "").trim();
  if (!id) {
    redirect("/admin/lab/lp-generator?error=missing-generation");
  }
  const record = readGeneration(id);
  const model = readGenerationModel(id);
  if (!record || !model) {
    redirect(`/admin/lab/lp-generator?error=${encodeURIComponent("generation not found")}`);
  }
  const catalog = readCatalog(record.productKey);
  const next = overlayApprovedAssets(model, catalog, {
    mode: record.sandbox?.enabled ? "PRESELL_BOFU" : "PRESELL_EDITORIAL",
  });
  writeGenerationModel(id, next);
  writeGeneration({
    ...record,
    assets: {
      ...record.assets,
      approvedUsed: [
        ...(next.commercialImage
          ? [{ id: assetIdFromSrc(next.commercialImage.src), src: next.commercialImage.src, role: "hero" as const, status: "USER_APPROVED" as const }]
          : []),
        ...(next.galleryImages ?? []).map((image) => ({
          id: assetIdFromSrc(image.src),
          src: image.src,
          role: "gallery" as const,
          status: "USER_APPROVED" as const,
        })),
      ].filter((item) => item.id),
      approvedAvailable: catalog?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0,
      pendingCount: catalog?.images.filter((item) => item.status === "PENDING_USER_APPROVAL").length ?? 0,
    },
    timings: { ...record.timings, finishedAt: new Date().toISOString() },
  });
  revalidatePath(`/admin/lab/lp-generator/${id}`);
  revalidatePath(`/admin/lab/lp-generator/${id}/preview`);
  redirect(`/admin/lab/lp-generator/${id}/preview`);
}
