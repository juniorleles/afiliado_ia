import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Campaign } from "@/lib/campaigns";
import type { PresellPage } from "@/lib/presell-page";
import { isUnusableProductAspect } from "@/lib/presell-display";
import { productImageDir } from "@/lib/product-image";
import { classifyAssetCandidate } from "@/lib/assets/classify";
import { inspectImageQuality, readImageDimensions } from "@/lib/assets/quality";
import type { AssetProvenance, ClassificationMethod, ProductAssetMetadata, ProductAssetStatus } from "@/lib/assets/types";

function localFilename(src: string | null | undefined): string | null {
  if (!src) return null;
  const match = src.match(/^\/media\/product\/([^/?#]+)$/i);
  return match?.[1] || null;
}

export function inspectStoredProductFile(src: string | null | undefined): {
  width: number;
  height: number;
  bytes: number;
} | null {
  const filename = localFilename(src);
  if (!filename) return null;
  const dest = path.join(productImageDir(), filename);
  if (!existsSync(dest)) return null;
  const body = readFileSync(dest);
  const dims = readImageDimensions(body);
  if (!dims) return { width: 0, height: 0, bytes: body.length };
  return { width: dims.width, height: dims.height, bytes: body.length };
}

export function evaluateProductAsset(input: {
  page?: PresellPage | null;
  campaign?: Pick<Campaign, "productImageSrc" | "productImageProvenance"> | null;
}): ProductAssetMetadata {
  const image = input.page?.hero.image;
  const src = image?.src || input.campaign?.productImageSrc || null;
  const rawProvenance = (image?.provenance || input.campaign?.productImageProvenance || "NOT_FOUND") as string;
  const provenance: AssetProvenance =
    rawProvenance === "MANUAL" ? "MANUAL" : rawProvenance === "DIRECT_SOURCE" ? "DIRECT_SOURCE" : "NOT_FOUND";
  const classificationMethod: ClassificationMethod = provenance === "MANUAL" ? "MANUAL" : "DETERMINISTIC";

  if (!src || rawProvenance === "PLACEHOLDER" || rawProvenance === "NOT_FOUND") {
    return {
      status: "NEEDS_ASSET",
      role: null,
      provenance: "NOT_FOUND",
      classificationMethod: null,
      width: null,
      height: null,
      bytes: null,
      src: src || null,
      qualityFindings: ["No suitable official product image was found from the supplied source."],
    };
  }

  const stored = inspectStoredProductFile(src);
  const classified = classifyAssetCandidate({
    url: src,
    alt: image?.alt || "",
    width: stored?.width || 0,
    height: stored?.height || 0,
  });
  const quality = stored
    ? inspectImageQuality({ width: stored.width, height: stored.height, bytes: stored.bytes })
    : [];
  const banner = stored ? isUnusableProductAspect(stored.width, stored.height) : classified.rejectReason === "extreme-aspect";
  const unusable =
    classified.role === "UNUSABLE" ||
    classified.role === "BRAND_LOGO" ||
    classified.rejected ||
    banner ||
    quality.some((item) => item.code === "BANNER_LIKE" || item.code === "PIXELATED_PACKSHOT");

  if (unusable) {
    return {
      status: "NEEDS_ASSET",
      role: classified.role === "UNCERTAIN" ? "UNUSABLE" : classified.role,
      provenance,
      classificationMethod,
      width: stored?.width ?? null,
      height: stored?.height ?? null,
      bytes: stored?.bytes ?? null,
      src,
      qualityFindings: [
        ...quality.map((item) => item.message),
        classified.rejectReason ? `Rejected as ${classified.rejectReason}.` : "Stored image is not a usable packshot.",
      ].filter(Boolean),
    };
  }

  const readyRole = classified.role === "PRODUCT_LIFESTYLE" ? "PRODUCT_LIFESTYLE" : "PRODUCT_PACKSHOT";
  return {
    status: "READY",
    role: readyRole,
    provenance,
    classificationMethod,
    width: stored?.width ?? null,
    height: stored?.height ?? null,
    bytes: stored?.bytes ?? null,
    src,
    qualityFindings: quality.map((item) => item.message),
  };
}

export function productAssetStatusLabel(status: ProductAssetStatus): string {
  if (status === "READY") return "READY";
  if (status === "NOT_APPLICABLE") return "NOT_APPLICABLE";
  return "NEEDS_ASSET";
}
