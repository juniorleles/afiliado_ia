import { existsSync } from "node:fs";
import { applyDecision, reuseApproval } from "@/lib/real-product-assets/authorize";
import { storeApprovedFile, type FetchImage } from "@/lib/real-product-assets/persist";
import { upsertImage } from "@/lib/real-product-assets/store";
import type { DiscoveredImage, ProductCatalog } from "@/lib/real-product-assets/types";

export const USER_APPROVE_ERROR = "Não foi possível aprovar esta imagem. Tente novamente.";

export type ApprovalItemResult =
  | { imageId: string; ok: true; reused: boolean }
  | { imageId: string; ok: false; message: string };

export type ApprovalBatchResult = {
  catalog: ProductCatalog;
  results: ApprovalItemResult[];
};

function hasUsableFile(image: DiscoveredImage): boolean {
  return Boolean(image.status === "USER_APPROVED" && image.localFile && existsSync(image.localFile));
}

export async function approveCatalogImages(input: {
  catalog: ProductCatalog;
  imageIds: string[];
  actor: string;
  root: string;
  fetchImage?: FetchImage;
  now?: string;
}): Promise<ApprovalBatchResult> {
  let catalog = input.catalog;
  const results: ApprovalItemResult[] = [];
  const seen = new Set<string>();

  for (const imageId of input.imageIds) {
    if (!imageId || seen.has(imageId)) continue;
    seen.add(imageId);
    const image = catalog.images.find((item) => item.id === imageId);
    if (!image) {
      results.push({ imageId, ok: false, message: USER_APPROVE_ERROR });
      continue;
    }
    if (hasUsableFile(image)) {
      results.push({ imageId, ok: true, reused: true });
      continue;
    }

    const stored = await storeApprovedFile(image, input.root, input.fetchImage);
    if (!stored.ok) {
      console.error("[real-assets] approve rejected", {
        productKey: catalog.productKey,
        imageId,
        reason: stored.reason,
      });
      results.push({ imageId, ok: false, message: USER_APPROVE_ERROR });
      continue;
    }

    if (reuseApproval(catalog, image.url) || image.status === "USER_APPROVED") {
      catalog = upsertImage(catalog, { ...stored.image, status: "USER_APPROVED" });
      results.push({ imageId, ok: true, reused: true });
      continue;
    }

    const decision = applyDecision({
      catalog: upsertImage(catalog, stored.image),
      imageId,
      actor: input.actor,
      status: "USER_APPROVED",
      now: input.now,
    });
    if ("error" in decision) {
      console.error("[real-assets] approve decision failed", {
        productKey: catalog.productKey,
        imageId,
        reason: decision.error,
      });
      results.push({ imageId, ok: false, message: USER_APPROVE_ERROR });
      continue;
    }
    const approved = decision.catalog.images.find((item) => item.id === imageId);
    if (!approved || !hasUsableFile(approved)) {
      results.push({ imageId, ok: false, message: USER_APPROVE_ERROR });
      continue;
    }
    catalog = decision.catalog;
    results.push({ imageId, ok: true, reused: decision.reused });
  }

  return { catalog, results };
}

export function decideCatalogImage(input: {
  catalog: ProductCatalog;
  imageId: string;
  actor: string;
  status: "REJECTED" | "REVOKED";
  now?: string;
}): { catalog: ProductCatalog } | { error: string } {
  const result = applyDecision({
    catalog: input.catalog,
    imageId: input.imageId,
    actor: input.actor,
    status: input.status,
    now: input.now,
  });
  if ("error" in result) return result;
  return { catalog: result.catalog };
}
