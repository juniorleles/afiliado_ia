"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { readGeneration } from "@/lib/lp-generator/store";
import {
  decideEligibleOfferImages,
  decideOfferImage,
  readOfferImageInventory,
  writeOfferImageInventory,
  type OfferImageDecisionAction,
} from "@/lib/presell-quality/offer-images";

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

function go(generationId: string, query: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const suffix = params.toString();
  redirect(`/admin/lab/lp-generator/${generationId}/offer-images${suffix ? `?${suffix}` : ""}`);
}

function refresh(generationId: string, campaignId: number) {
  try {
    revalidatePath(`/admin/lab/lp-generator/${generationId}/offer-images`);
    revalidatePath(`/admin/lab/lp-generator/${generationId}/preview`);
    revalidatePath(`/p/${campaignId}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : "revalidate failed";
    console.error("[offer-images] revalidate failed", { generationId, campaignId, reason });
  }
}

export async function decideOfferImageAction(formData: FormData): Promise<void> {
  const generationId = String(formData.get("generationId") ?? "").trim();
  try {
    await requireAdmin();
    const record = readGeneration(generationId);
    if (!record?.campaignId) return go(generationId || "missing", { error: "generation" });
    const inventory = readOfferImageInventory(record.campaignId);
    if (!inventory) return go(generationId, { error: "inventory" });

    const action = String(formData.get("decision") ?? "").trim().toUpperCase() as OfferImageDecisionAction;
    const assetId = String(formData.get("assetId") ?? "").trim();
    const justification = String(formData.get("justification") ?? "");
    const evidenceNote = String(formData.get("evidenceNote") ?? "");
    if (action !== "APPROVE" && action !== "REJECT") return go(generationId, { error: "decision" });
    if (!assetId) return go(generationId, { error: "empty" });

    const decided = decideOfferImage({
      inventory,
      assetId,
      action,
      actor: "lab-operator",
      justification,
      evidenceNote,
    });
    if (!decided.ok) return go(generationId, { error: decided.error });
    writeOfferImageInventory(record.campaignId, decided.inventory);
    refresh(generationId, record.campaignId);
    return go(generationId, action === "APPROVE" ? { approved: "1" } : { rejected: "1" });
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const reason = err instanceof Error ? err.message : "decide failed";
    console.error("[offer-images] decide action failed", { reason });
    return go(generationId || "missing", { error: "update" });
  }
}

export async function batchEligibleOfferImagesAction(formData: FormData): Promise<void> {
  const generationId = String(formData.get("generationId") ?? "").trim();
  try {
    await requireAdmin();
    const record = readGeneration(generationId);
    if (!record?.campaignId) return go(generationId || "missing", { error: "generation" });
    const inventory = readOfferImageInventory(record.campaignId);
    if (!inventory) return go(generationId, { error: "inventory" });

    const action = String(formData.get("decision") ?? "APPROVE").trim().toUpperCase() as OfferImageDecisionAction;
    const assetIds = idsFrom(formData, ["assetId"]);
    const justification = String(formData.get("justification") ?? "");
    const evidenceNote = String(formData.get("evidenceNote") ?? "");
    if (action !== "APPROVE" && action !== "REJECT") return go(generationId, { error: "decision" });
    if (assetIds.length === 0) return go(generationId, { error: "empty" });

    const decided = decideEligibleOfferImages({
      inventory,
      assetIds,
      action,
      actor: "lab-operator",
      justification,
      evidenceNote,
    });
    if (decided.error) return go(generationId, { error: decided.error });
    writeOfferImageInventory(record.campaignId, decided.inventory);
    refresh(generationId, record.campaignId);
    return go(generationId, {
      approved: decided.approved.length ? String(decided.approved.length) : "",
      rejected: decided.rejected.length ? String(decided.rejected.length) : "",
      skipped: decided.skipped.length ? String(decided.skipped.length) : "",
    });
  } catch (err) {
    if (isNextRedirect(err)) throw err;
    const reason = err instanceof Error ? err.message : "batch failed";
    console.error("[offer-images] batch action failed", { reason });
    return go(generationId || "missing", { error: "update" });
  }
}
