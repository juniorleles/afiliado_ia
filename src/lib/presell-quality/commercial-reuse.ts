import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";

export const COMMERCIAL_REUSE_STATUSES = ["APPROVED", "PENDING_REVIEW", "REJECTED"] as const;
export type CommercialReuseStatus = (typeof COMMERCIAL_REUSE_STATUSES)[number];

export type CommercialEvidenceItem = {
  field: string;
  value: string;
  source_url: string;
  source_location: string;
  captured_at: string;
  evidence_path: string;
  reuse_status: CommercialReuseStatus;
  reason: string;
};

export type SellerStatedPackage = {
  id: string;
  label: string;
  duration: string;
  quantity: string;
  unitPrice: string;
  comparedTotal: string | null;
  currentTotal: string;
  shippingTerm: string;
  bonuses: string[];
};

export type CommercialReuseManifest = {
  campaignId: number;
  sourceUrl: string;
  finalUrl: string;
  capturedAt: string;
  items: CommercialEvidenceItem[];
  approvedPackages: SellerStatedPackage[];
  attribution: string;
};

const MEDICAL =
  /\b(blood sugar|blood glucose|fat[- ]burn|drop pounds|clinically proven|scientifically proven|cures?|treats?|prevents?|diabetes|brain[- ]fog|energy crashes?|#1 rated|results you can expect)\b/i;
const TESTIMONIAL = /\b(verified purchase|customer testimonial|changed my life|real customers real life)\b/i;
const SEAL = /\b(fda[- ]approved|gmp certified|natural formula seal)\b/i;
const PRICE = /\$\d+/;

export function buildCommercialEvidenceItem(input: {
  field: string;
  value: string;
  source_url: string;
  source_location: string;
  captured_at: string;
  evidence_path: string;
  namesMayBeChanged?: boolean;
}): CommercialEvidenceItem {
  const classified = classifyCommercialReuseItem({
    field: input.field,
    value: input.value,
    namesMayBeChanged: input.namesMayBeChanged,
  });
  return {
    field: input.field,
    value: input.value,
    source_url: input.source_url,
    source_location: input.source_location,
    captured_at: input.captured_at,
    evidence_path: input.evidence_path,
    reuse_status: classified.reuse_status,
    reason: classified.reason,
  };
}

export function classifyCommercialReuseItem(input: {
  field: string;
  value: string;
  namesMayBeChanged?: boolean;
}): { reuse_status: CommercialReuseStatus; reason: string } {
  const field = input.field.toLowerCase();
  const value = input.value.trim();
  if (!value) return { reuse_status: "REJECTED", reason: "Empty value is not reusable." };
  if (MEDICAL.test(value) || field.includes("benefit") || field.includes("efficacy") || field.includes("medical")) {
    return { reuse_status: "REJECTED", reason: "Medical or efficacy language stays blocked until specific approval." };
  }
  if (TESTIMONIAL.test(value) || field.includes("testimonial") || field.includes("review-quote")) {
    if (input.namesMayBeChanged) {
      return { reuse_status: "REJECTED", reason: "The source says names or identifying details may have been changed." };
    }
    return { reuse_status: "PENDING_REVIEW", reason: "Testimonials need identifiable origin and reproduction permission." };
  }
  if (field.includes("rating") || /\d\.\d+\s*\/\s*5/.test(value) || /based on \d{3,}/i.test(value)) {
    return { reuse_status: "PENDING_REVIEW", reason: "Seller-stated ratings are not an independent review corpus." };
  }
  if (SEAL.test(value) || field.includes("badge") || field.includes("seal")) {
    return { reuse_status: "PENDING_REVIEW", reason: "Trust seals need a confirmed meaning and legitimacy." };
  }
  if (field === "ingredient-name") {
    return { reuse_status: "PENDING_REVIEW", reason: "New ingredient names wait for Product Contract inclusion." };
  }
  if (field === "package" || field === "price" || field === "discount" || field === "shipping-term") {
    if (!PRICE.test(value) && field !== "shipping-term") {
      return { reuse_status: "PENDING_REVIEW", reason: "Commercial term is incomplete." };
    }
    return {
      reuse_status: "APPROVED",
      reason: "Seller-stated current offer term captured from the producer page. Not independent verification.",
    };
  }
  if (field === "guarantee") {
    return {
      reuse_status: "APPROVED",
      reason: "Guarantee duration is restated as seller-stated. Conditions and exclusions stay required.",
    };
  }
  if (field === "legal" || field === "retailer") {
    return { reuse_status: "APPROVED", reason: "Legal and retailer attribution may be restated." };
  }
  return { reuse_status: "PENDING_REVIEW", reason: "Additional review is required before reuse." };
}

export function commercialReusePath(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "commercial-reuse.json");
}

export function readCommercialReuse(campaignId: number): CommercialReuseManifest | null {
  const file = commercialReusePath(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CommercialReuseManifest;
  } catch {
    return null;
  }
}

export function writeCommercialReuse(manifest: CommercialReuseManifest): string {
  const file = commercialReusePath(manifest.campaignId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
}

export function approvedCommercialExcerpts(manifest: CommercialReuseManifest | null): string[] {
  if (!manifest) return [];
  return manifest.items.filter((item) => item.reuse_status === "APPROVED" && item.value.trim()).map((item) => item.value);
}

export function countsByStatus(items: CommercialEvidenceItem[]): Record<CommercialReuseStatus, number> {
  return {
    APPROVED: items.filter((item) => item.reuse_status === "APPROVED").length,
    PENDING_REVIEW: items.filter((item) => item.reuse_status === "PENDING_REVIEW").length,
    REJECTED: items.filter((item) => item.reuse_status === "REJECTED").length,
  };
}
