import { createHash } from "node:crypto";
import type { AuthorizationEvent, DiscoveredImage, OperationalStatus, ProductCatalog } from "@/lib/real-product-assets/types";
import { appendEvent, upsertImage, validApproval } from "@/lib/real-product-assets/store";

export function imageIdFor(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export function reuseApproval(catalog: ProductCatalog, url: string): AuthorizationEvent | undefined {
  return validApproval(catalog, url);
}

export function applyDecision(input: {
  catalog: ProductCatalog;
  imageId: string;
  actor: string;
  status: Extract<OperationalStatus, "USER_APPROVED" | "REJECTED" | "REVOKED">;
  note?: string;
  now?: string;
}): { catalog: ProductCatalog; reused: boolean } | { error: string } {
  const image = input.catalog.images.find((item) => item.id === input.imageId);
  if (!image) return { error: "Image not found." };
  if (input.status === "USER_APPROVED") {
    const existing = reuseApproval(input.catalog, image.url);
    if (existing) return { catalog: input.catalog, reused: true };
  }
  if (image.status === "BLOCKED_BY_POLICY" && input.status === "USER_APPROVED") {
    return { error: "A policy block cannot be cleared by operational approval." };
  }
  const now = input.now ?? new Date().toISOString();
  const event: AuthorizationEvent = {
    imageId: image.id,
    originalUrl: image.url,
    productKey: input.catalog.productKey,
    productName: input.catalog.productName,
    sourcePage: image.sourcePage,
    actor: input.actor,
    scope: "LANDING_PAGE_LAB",
    status: input.status,
    restrictions: image.policyBlock ? [image.policyBlock] : [],
    recordedAt: now,
    note: input.note ?? "",
  };
  const nextImage: DiscoveredImage = { ...image, status: input.status };
  return { catalog: appendEvent(upsertImage(input.catalog, nextImage), event), reused: false };
}
