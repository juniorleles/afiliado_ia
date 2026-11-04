import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverSourceAssets } from "@/lib/assets/discover";
import {
  looksLikeAvatar,
  looksLikeIconOrBadge,
  looksLikeLogo,
  looksLikeTrackingPixel,
} from "@/lib/assets/classify";
import { looksLikeHtmlOrScript, readImageDimensions, sniffImageMime } from "@/lib/assets/quality";
import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";
import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { reviewAssetId } from "@/lib/product-research/media-contract";
import { isSafeImageFilename, productImageDir, storeProductImageBuffer } from "@/lib/product-image";
import { declarationCoversAsset, type UserAssetDeclaration } from "@/lib/presell-quality/user-asset-declaration";

export const OFFER_PACKAGE_IMAGE = "OFFER_PACKAGE_IMAGE" as const;
export const OFFER_IMAGE_INVENTORY_VERSION = 1 as const;
export const ASSOCIATION_VERIFIED_MIN = 0.75;
export const FILENAME_ONLY_MAX_CONFIDENCE = 0.39;

export type OfferImageClassification = typeof OFFER_PACKAGE_IMAGE;
export type OfferImageEvidenceStatus = "VERIFIED" | "INSUFFICIENT" | "REJECTED";
export type OfferImageUsageAuthorization = "APPROVED" | "PENDING" | "REJECTED";
export type OfferImageReviewStatus = "APPROVED" | "REQUIRES_HUMAN_REVIEW" | "REJECTED";
export type OfferImageDiscoverySource = "img" | "srcset" | "picture" | "lazy" | "css" | "network" | "og" | "jsonld";

export type OfferImageCandidate = {
  sourceUrl: string;
  sourcePageUrl: string;
  alt: string;
  title: string;
  className: string;
  parentHint: string;
  containerText: string;
  width: number;
  height: number;
  source: OfferImageDiscoverySource;
  exclusionReason: string | null;
};

export type OfferImageAssociation = {
  bottleCount: number | null;
  confidence: number;
  rationale: string[];
  filenameOnly: boolean;
  ambiguous: boolean;
};

export type OfferImageDecisionAction = "APPROVE" | "REJECT";
export type OfferImageHistoryAction =
  | OfferImageDecisionAction
  | "OPERATOR_ATTEST"
  | "ADMINISTRATIVE_OPERATOR_APPROVAL"
  | "RIGHTS_HOLDER_LICENSE"
  | "AUTO_PUBLISH_READY"
  | "REOPEN_PENDING";

/** TECHNICAL: requires integrity gates and may promote when license is PROVEN. ADMINISTRATIVE: records OPERATOR_APPROVED only. */
export type OfferImageOperatorAttestationMode = "TECHNICAL" | "ADMINISTRATIVE";
export type OfferImageOperatorAttestation = "NONE" | "OPERATOR_APPROVED" | "OPERATOR_REJECTED";
export type OfferImageRightsHolderLicenseStatus = "UNPROVEN" | "PROVEN" | "DENIED";

export type OfferImageAuthorizationEvent = {
  at: string;
  actor: string;
  action: OfferImageHistoryAction;
  justification: string;
  evidenceNote: string | null;
};

export type OfferImageAffiliateProgramAudit = {
  sourceUrl: string;
  fetchedAt: string;
  permittedImageryClause: string;
  permittedBannerFiles: string[];
  packageFilesListed: string[];
  note: string;
};

export type OfferImageAsset = {
  assetId: string;
  productId: string;
  offerId: string | null;
  bottleCount: number | null;
  sourceUrl: string;
  sourcePageUrl: string;
  sha256: string | null;
  mimeType: string | null;
  width: number;
  height: number;
  classification: OfferImageClassification;
  associationConfidence: number;
  associationRationale: string[];
  evidenceStatus: OfferImageEvidenceStatus;
  usageAuthorization: OfferImageUsageAuthorization;
  reviewStatus: OfferImageReviewStatus;
  localFile: string | null;
  collectedAt: string;
  duplicateOf: string | null;
  exclusionReason: string | null;
  publicSrc?: string | null;
  authorizedBy?: string | null;
  authorizedAt?: string | null;
  authorizationJustification?: string | null;
  authorizationEvidenceNote?: string | null;
  authorizationHistory?: OfferImageAuthorizationEvent[];
  /** Campaign-operator attestation. Never equals rights-holder license proof. */
  operatorAttestation?: OfferImageOperatorAttestation;
  operatorAttestedBy?: string | null;
  operatorAttestedAt?: string | null;
  operatorAttestationNote?: string | null;
  /** Independent rights-holder / producer license status. */
  rightsHolderLicenseStatus?: OfferImageRightsHolderLicenseStatus;
  rightsHolderLicenseEvidence?: string | null;
};

export type OfferImageInventory = {
  version: typeof OFFER_IMAGE_INVENTORY_VERSION;
  productId: string;
  sourcePageUrl: string;
  collectedAt: string;
  assets: OfferImageAsset[];
  discarded: Array<{ sourceUrl: string; reason: string }>;
  affiliateProgramAudit?: OfferImageAffiliateProgramAudit | null;
};

export type OfferImageAuthorizationInput = {
  assetId: string;
  sourceUrl: string;
  sha256: string | null;
  declaration: UserAssetDeclaration | null;
  discoveredAssets?: DiscoveredAffiliateAsset[];
  prior?: OfferImageAsset | null;
};

const QUANTITY_IN_TEXT =
  /(\d+)\s*(bottles?|jars?|tubs?|units?|packs?|pouches?|cans?|capsules?)/i;
const FILENAME_QUANTITY = /(?:^|[^a-z0-9])x(\d+)(?:[^a-z0-9]|$)|(\d+)\s*(?:bottle|jar|tub|pack)/i;

export function redactOfferImageUrl(raw: string): string {
  return sanitizeSharedUrl(raw);
}

export function offerImageInventoryFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "offer-images.json");
}

export function readOfferImageInventory(campaignId: number): OfferImageInventory | null {
  const file = offerImageInventoryFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as OfferImageInventory;
  } catch {
    return null;
  }
}

export function writeOfferImageInventory(campaignId: number, inventory: OfferImageInventory): OfferImageInventory {
  const file = offerImageInventoryFile(campaignId);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

export function sha256Bytes(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function inspectOfferImageBuffer(buffer: Buffer): {
  ok: boolean;
  mimeType: string | null;
  width: number;
  height: number;
  sha256: string;
  reason: string | null;
} {
  const sha256 = sha256Bytes(buffer);
  if (!buffer.length) {
    return { ok: false, mimeType: null, width: 0, height: 0, sha256, reason: "empty-file" };
  }
  if (looksLikeHtmlOrScript(buffer)) {
    return { ok: false, mimeType: null, width: 0, height: 0, sha256, reason: "not-an-image" };
  }
  const mimeType = sniffImageMime(buffer);
  if (!mimeType) {
    return { ok: false, mimeType: null, width: 0, height: 0, sha256, reason: "unknown-mime" };
  }
  const dimensions = readImageDimensions(buffer);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    return { ok: false, mimeType, width: 0, height: 0, sha256, reason: "undimensioned" };
  }
  return {
    ok: true,
    mimeType,
    width: dimensions.width,
    height: dimensions.height,
    sha256,
    reason: null,
  };
}

export function bottleCountFromText(text: string): number | null {
  const match = text.match(QUANTITY_IN_TEXT);
  if (!match) return null;
  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 ? count : null;
}

function bottleCountsInText(text: string): number[] {
  const found = new Set<number>();
  const parsed = bottleCountFromText(text);
  if (parsed) found.add(parsed);
  for (const match of text.matchAll(new RegExp(QUANTITY_IN_TEXT, "gi"))) {
    const count = Number(match[1]);
    if (Number.isInteger(count) && count > 0) found.add(count);
  }
  return [...found];
}

function bottleCountFromFileName(url: string): number | null {
  let file = url;
  try {
    file = decodeURIComponent(new URL(url).pathname.split("/").pop() || url);
  } catch {
    file = url.split("/").pop() || url;
  }
  const match = file.match(FILENAME_QUANTITY);
  if (!match) return null;
  const count = Number(match[1] || match[2]);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export function excludeOfferImageCandidate(candidate: Pick<OfferImageCandidate, "sourceUrl" | "alt" | "className" | "parentHint" | "containerText" | "width" | "height">): string | null {
  const haystack = `${candidate.sourceUrl} ${candidate.alt} ${candidate.className}`.toLowerCase();
  const context = `${candidate.parentHint} ${candidate.containerText}`.toLowerCase();
  if (looksLikeTrackingPixel(candidate.sourceUrl)) return "tracking-pixel";
  if ((candidate.width > 0 && candidate.width < 80) || (candidate.height > 0 && candidate.height < 80)) return "too-small";
  if (looksLikeIconOrBadge(haystack) && !QUANTITY_IN_TEXT.test(haystack)) return "icon-or-badge";
  if (looksLikeAvatar(haystack) || looksLikeAvatar(context)) return "testimonial-avatar";
  if (looksLikeLogo(haystack) && !QUANTITY_IN_TEXT.test(haystack)) return "logo";
  if (/\b(bonus|ebook|e-book|book\d|stars?|signature|cards?|visa|paypal)\b/i.test(haystack) && !QUANTITY_IN_TEXT.test(haystack)) {
    return "non-package-visual";
  }
  if (/\b(ingredient|eleuthero|coleus|maca|mango|guarana|gymnema|ginseng|chromium)\b/i.test(haystack)) {
    return "ingredient-visual";
  }
  return null;
}

export function associateOfferImage(candidate: OfferImageCandidate, knownCounts?: number[]): OfferImageAssociation {
  const altCounts = bottleCountsInText(`${candidate.alt} ${candidate.title}`);
  const containerCounts = bottleCountsInText(candidate.containerText);
  const hintCounts = bottleCountsInText(candidate.parentHint);
  const fileCount = bottleCountFromFileName(candidate.sourceUrl);
  const known = knownCounts && knownCounts.length ? new Set(knownCounts) : null;
  const allow = (count: number) => !known || known.has(count);

  const rationale: string[] = [];
  let bottleCount: number | null = null;
  let confidence = 0;
  let filenameOnly = false;
  let ambiguous = false;

  if (altCounts.length > 1) {
    ambiguous = true;
    rationale.push("Alt text names more than one package quantity.");
  } else if (altCounts.length === 1 && allow(altCounts[0]!)) {
    bottleCount = altCounts[0]!;
    confidence = 0.92;
    rationale.push(`Alt or title names ${bottleCount} units.`);
  }

  if (containerCounts.length > 1) {
    ambiguous = true;
    rationale.push("The surrounding offer container names more than one quantity.");
  } else if (containerCounts.length === 1 && allow(containerCounts[0]!)) {
    if (bottleCount && bottleCount !== containerCounts[0]) {
      ambiguous = true;
      rationale.push("Container quantity conflicts with the image text.");
    } else if (!bottleCount) {
      bottleCount = containerCounts[0]!;
      confidence = 0.82;
      rationale.push(`Offer container names ${bottleCount} units.`);
    } else {
      confidence = Math.max(confidence, 0.94);
      rationale.push("Container quantity agrees with the image text.");
    }
  }

  if (!bottleCount && hintCounts.length === 1 && allow(hintCounts[0]!)) {
    bottleCount = hintCounts[0]!;
    confidence = 0.7;
    rationale.push(`Nearby markup names ${bottleCount} units.`);
  } else if (hintCounts.length > 1) {
    ambiguous = true;
    rationale.push("Nearby markup names multiple quantities.");
  }

  if (fileCount && allow(fileCount)) {
    if (bottleCount && bottleCount !== fileCount) {
      rationale.push("Filename quantity does not match textual evidence; filename ignored.");
    } else if (bottleCount === fileCount) {
      confidence = Math.max(confidence, Math.min(0.96, confidence + 0.04));
      rationale.push("Filename quantity corroborates the textual association.");
    } else {
      bottleCount = fileCount;
      confidence = FILENAME_ONLY_MAX_CONFIDENCE;
      filenameOnly = true;
      rationale.push("Quantity inferred from the filename only.");
    }
  }

  if (!bottleCount) {
    return {
      bottleCount: null,
      confidence: 0,
      rationale: rationale.length ? rationale : ["No verifiable package quantity was found."],
      filenameOnly,
      ambiguous,
    };
  }

  if (filenameOnly || confidence < ASSOCIATION_VERIFIED_MIN) {
    ambiguous = ambiguous || filenameOnly;
  }

  return { bottleCount, confidence, rationale, filenameOnly, ambiguous };
}

export function extractOfferImageCandidates(html: string, pageUrl: string): OfferImageCandidate[] {
  const discovered = discoverSourceAssets(html, pageUrl);
  return discovered.map((item) => {
    const candidate: OfferImageCandidate = {
      sourceUrl: item.url,
      sourcePageUrl: pageUrl,
      alt: item.alt,
      title: item.title,
      className: item.className,
      parentHint: item.parentHint,
      containerText: item.parentHint,
      width: item.width,
      height: item.height,
      source: item.source === "twitter" ? "og" : item.source,
      exclusionReason: null,
    };
    candidate.exclusionReason = excludeOfferImageCandidate(candidate);
    return candidate;
  });
}

export function resolveOfferImageAuthorization(input: OfferImageAuthorizationInput): {
  usageAuthorization: OfferImageUsageAuthorization;
  reviewStatus: OfferImageReviewStatus;
  reason: string;
} {
  if (input.prior?.usageAuthorization === "REJECTED" || input.prior?.reviewStatus === "REJECTED") {
    return { usageAuthorization: "REJECTED", reviewStatus: "REJECTED", reason: "A prior human rejection remains in force." };
  }
  if (input.prior?.usageAuthorization === "APPROVED" && input.prior.reviewStatus === "APPROVED") {
    return { usageAuthorization: "APPROVED", reviewStatus: "APPROVED", reason: "A recorded human approval already covers this asset." };
  }
  const declared = input.declaration ? declarationCoversAsset(input.declaration, input.assetId) : false;
  const discovered = (input.discoveredAssets ?? []).find((item) => {
    const url = item.assetUrl?.trim();
    return url === input.sourceUrl || reviewAssetId(url || "") === input.assetId;
  });
  if (discovered?.status === "REJECTED") {
    return { usageAuthorization: "REJECTED", reviewStatus: "REJECTED", reason: "Product research rejected this asset." };
  }
  if (declared && discovered?.status === "USER_APPROVED") {
    return { usageAuthorization: "APPROVED", reviewStatus: "APPROVED", reason: "User declaration and USER_APPROVED research status cover this asset." };
  }
  return {
    usageAuthorization: "PENDING",
    reviewStatus: "REQUIRES_HUMAN_REVIEW",
    reason: "Presence on a producer page is not reuse authorization.",
  };
}

export function offerImageEvidenceStatus(association: OfferImageAssociation, exclusionReason: string | null): OfferImageEvidenceStatus {
  if (exclusionReason) return "REJECTED";
  if (association.ambiguous || association.filenameOnly || !association.bottleCount) return "INSUFFICIENT";
  if (association.confidence >= ASSOCIATION_VERIFIED_MIN) return "VERIFIED";
  return "INSUFFICIENT";
}

export function buildOfferImageAsset(input: {
  productId: string;
  candidate: OfferImageCandidate;
  association: OfferImageAssociation;
  integrity?: ReturnType<typeof inspectOfferImageBuffer> | null;
  localFile?: string | null;
  collectedAt: string;
  authorization: ReturnType<typeof resolveOfferImageAuthorization>;
  duplicateOf?: string | null;
  prior?: OfferImageAsset | null;
}): OfferImageAsset {
  const evidenceStatus = offerImageEvidenceStatus(input.association, input.candidate.exclusionReason);
  const reviewStatus =
    input.authorization.reviewStatus === "REJECTED"
      ? "REJECTED"
      : evidenceStatus === "INSUFFICIENT" || input.association.ambiguous || input.association.filenameOnly
        ? "REQUIRES_HUMAN_REVIEW"
        : input.authorization.reviewStatus;
  const prior = input.prior ? withOfferImageAuthDefaults(input.prior) : null;
  return withOfferImageAuthDefaults({
    assetId: reviewAssetId(input.candidate.sourceUrl),
    productId: input.productId,
    offerId: input.association.bottleCount != null ? `offer-${input.association.bottleCount}` : null,
    bottleCount: input.association.bottleCount,
    sourceUrl: redactOfferImageUrl(input.candidate.sourceUrl),
    sourcePageUrl: redactOfferImageUrl(input.candidate.sourcePageUrl),
    sha256: input.integrity?.sha256 ?? prior?.sha256 ?? null,
    mimeType: input.integrity?.mimeType ?? prior?.mimeType ?? null,
    width: input.integrity?.width ?? input.candidate.width,
    height: input.integrity?.height ?? input.candidate.height,
    classification: OFFER_PACKAGE_IMAGE,
    associationConfidence: input.association.confidence,
    associationRationale: input.association.rationale,
    evidenceStatus,
    usageAuthorization: input.authorization.usageAuthorization,
    reviewStatus,
    localFile: input.localFile ?? prior?.localFile ?? null,
    collectedAt: input.collectedAt,
    duplicateOf: input.duplicateOf ?? null,
    exclusionReason: input.candidate.exclusionReason,
    publicSrc: prior?.publicSrc ?? null,
    authorizedBy: prior?.authorizedBy ?? null,
    authorizedAt: prior?.authorizedAt ?? null,
    authorizationJustification: prior?.authorizationJustification ?? null,
    authorizationEvidenceNote: prior?.authorizationEvidenceNote ?? null,
    authorizationHistory: prior?.authorizationHistory ?? [],
    operatorAttestation: prior?.operatorAttestation ?? "NONE",
    operatorAttestedBy: prior?.operatorAttestedBy ?? null,
    operatorAttestedAt: prior?.operatorAttestedAt ?? null,
    operatorAttestationNote: prior?.operatorAttestationNote ?? null,
    rightsHolderLicenseStatus: prior?.rightsHolderLicenseStatus ?? "UNPROVEN",
    rightsHolderLicenseEvidence: prior?.rightsHolderLicenseEvidence ?? null,
  });
}

export function mapOfferImages(input: {
  productId: string;
  sourcePageUrl: string;
  candidates: OfferImageCandidate[];
  knownBottleCounts?: number[];
  collectedAt?: string;
  integrityByUrl?: Map<string, ReturnType<typeof inspectOfferImageBuffer>>;
  localFileBySha?: Map<string, string>;
  declaration?: UserAssetDeclaration | null;
  discoveredAssets?: DiscoveredAffiliateAsset[];
  prior?: OfferImageInventory | null;
}): OfferImageInventory {
  const collectedAt = input.collectedAt ?? new Date().toISOString();
  const discarded: OfferImageInventory["discarded"] = [];
  const pending: OfferImageAsset[] = [];
  const seenHash = new Map<string, string>();

  for (const candidate of input.candidates) {
    const exclusion = candidate.exclusionReason || excludeOfferImageCandidate(candidate);
    if (exclusion) {
      discarded.push({ sourceUrl: redactOfferImageUrl(candidate.sourceUrl), reason: exclusion });
      continue;
    }
    const association = associateOfferImage(candidate, input.knownBottleCounts);
    const integrity = input.integrityByUrl?.get(candidate.sourceUrl) ?? null;
    if (integrity && !integrity.ok) {
      discarded.push({ sourceUrl: redactOfferImageUrl(candidate.sourceUrl), reason: integrity.reason || "invalid-file" });
      continue;
    }
    const assetId = reviewAssetId(candidate.sourceUrl);
    const priorAsset = input.prior?.assets.find((item) => item.assetId === assetId || item.sha256 === integrity?.sha256) ?? null;
    const authorization = resolveOfferImageAuthorization({
      assetId,
      sourceUrl: candidate.sourceUrl,
      sha256: integrity?.sha256 ?? null,
      declaration: input.declaration ?? null,
      discoveredAssets: input.discoveredAssets,
      prior: priorAsset,
    });
    let duplicateOf: string | null = null;
    if (integrity?.sha256 && seenHash.has(integrity.sha256)) {
      duplicateOf = seenHash.get(integrity.sha256) ?? null;
    } else if (integrity?.sha256) {
      seenHash.set(integrity.sha256, assetId);
    }
    pending.push(
      buildOfferImageAsset({
        productId: input.productId,
        candidate,
        association,
        integrity,
        localFile: integrity?.sha256 ? input.localFileBySha?.get(integrity.sha256) ?? priorAsset?.localFile ?? null : priorAsset?.localFile ?? null,
        collectedAt,
        authorization,
        duplicateOf,
        prior: priorAsset,
      }),
    );
  }

  const byCount = new Map<number, OfferImageAsset[]>();
  for (const asset of pending) {
    if (asset.bottleCount == null || asset.exclusionReason) continue;
    const list = byCount.get(asset.bottleCount) ?? [];
    list.push(asset);
    byCount.set(asset.bottleCount, list);
  }
  for (const list of byCount.values()) {
    if (list.length < 2) continue;
    const ranked = [...list].sort((a, b) => b.associationConfidence - a.associationConfidence);
    for (const extra of ranked.slice(1)) {
      if (extra.usageAuthorization === "APPROVED" && extra.reviewStatus === "APPROVED") continue;
      extra.reviewStatus = "REQUIRES_HUMAN_REVIEW";
      extra.evidenceStatus = extra.evidenceStatus === "REJECTED" ? "REJECTED" : "INSUFFICIENT";
      extra.associationRationale = [...extra.associationRationale, "Multiple images claim this quantity."];
    }
  }

  return {
    version: OFFER_IMAGE_INVENTORY_VERSION,
    productId: input.productId,
    sourcePageUrl: redactOfferImageUrl(input.sourcePageUrl),
    collectedAt,
    assets: pending,
    discarded,
  };
}

export const MIN_OFFER_IMAGE_JUSTIFICATION = 12;

export function withOfferImageAuthDefaults(asset: OfferImageAsset): OfferImageAsset {
  return {
    ...asset,
    publicSrc: asset.publicSrc ?? null,
    authorizedBy: asset.authorizedBy ?? null,
    authorizedAt: asset.authorizedAt ?? null,
    authorizationJustification: asset.authorizationJustification ?? null,
    authorizationEvidenceNote: asset.authorizationEvidenceNote ?? null,
    authorizationHistory: asset.authorizationHistory ?? [],
    operatorAttestation: asset.operatorAttestation ?? "NONE",
    operatorAttestedBy: asset.operatorAttestedBy ?? null,
    operatorAttestedAt: asset.operatorAttestedAt ?? null,
    operatorAttestationNote: asset.operatorAttestationNote ?? null,
    rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus ?? "UNPROVEN",
    rightsHolderLicenseEvidence: asset.rightsHolderLicenseEvidence ?? null,
  };
}

export function isPublicOfferMediaSrc(value: string | null | undefined): boolean {
  return Boolean(value && value.startsWith("/media/"));
}

export function offerImagePublicSrc(asset: Pick<OfferImageAsset, "publicSrc" | "localFile">): string | null {
  if (isPublicOfferMediaSrc(asset.publicSrc)) return asset.publicSrc ?? null;
  if (isPublicOfferMediaSrc(asset.localFile)) return asset.localFile;
  return null;
}

export function offerImageIsPublishable(asset: OfferImageAsset): boolean {
  const current = withOfferImageAuthDefaults(asset);
  return (
    current.classification === OFFER_PACKAGE_IMAGE &&
    current.usageAuthorization === "APPROVED" &&
    current.reviewStatus === "APPROVED" &&
    current.evidenceStatus === "VERIFIED" &&
    current.rightsHolderLicenseStatus === "PROVEN" &&
    current.bottleCount != null &&
    !current.exclusionReason &&
    !current.duplicateOf &&
    Boolean(current.sha256) &&
    Boolean(offerImagePublicSrc(current))
  );
}

export function offerImagePublicationBlockers(asset: OfferImageAsset): string[] {
  const current = withOfferImageAuthDefaults(asset);
  const blockers: string[] = [];
  if (current.usageAuthorization === "REJECTED" || current.reviewStatus === "REJECTED") {
    blockers.push("Imagem rejeitada — não pode ser publicada.");
    return blockers;
  }
  if (current.evidenceStatus !== "VERIFIED") blockers.push("Evidência de origem ainda não está VERIFIED.");
  if (current.bottleCount == null) blockers.push("Quantidade de frascos não associada ao produto.");
  if (current.exclusionReason) blockers.push(`Excluída: ${current.exclusionReason}.`);
  if (current.duplicateOf) blockers.push(`Duplicata de ${current.duplicateOf}.`);
  if (!current.sha256) blockers.push("Integridade (sha256) ausente.");
  const hasFile = Boolean(offerImagePublicSrc(current) || (current.localFile && existsSync(current.localFile)));
  if (!hasFile) blockers.push("Arquivo local ausente.");
  if (current.operatorAttestation !== "OPERATOR_APPROVED") {
    blockers.push("Falta declaração OPERATOR_APPROVED do operador da campanha.");
  }
  if (current.rightsHolderLicenseStatus === "DENIED") {
    blockers.push("Licença do titular dos direitos está DENIED.");
  } else if (current.rightsHolderLicenseStatus !== "PROVEN") {
    blockers.push(
      "Licença do titular dos direitos não comprovada (OPERATOR_APPROVED não substitui permissão do produtor).",
    );
  }
  if (
    current.operatorAttestation === "OPERATOR_APPROVED" &&
    current.rightsHolderLicenseStatus === "PROVEN" &&
    (current.usageAuthorization !== "APPROVED" || current.reviewStatus !== "APPROVED" || !offerImagePublicSrc(current))
  ) {
    blockers.push("Aguardando promoção automática OPERATOR_APPROVED + licença PROVEN.");
  } else if (current.usageAuthorization !== "APPROVED" || current.reviewStatus !== "APPROVED") {
    blockers.push("Autorização de uso para publicação ainda não está APPROVED.");
  }
  if (!offerImagePublicSrc(current) && current.usageAuthorization === "APPROVED") {
    blockers.push("Arquivo público em /media/product/ ainda não materializado.");
  }
  return blockers;
}

export function offerImageApprovalEligibility(asset: OfferImageAsset): { ok: boolean; reasons: string[] } {
  const current = withOfferImageAuthDefaults(asset);
  const reasons: string[] = [];
  if (current.usageAuthorization === "APPROVED" && current.reviewStatus === "APPROVED") reasons.push("already-approved");
  if (current.usageAuthorization === "REJECTED" || current.reviewStatus === "REJECTED") reasons.push("already-rejected");
  if (current.operatorAttestation === "OPERATOR_APPROVED") reasons.push("operator-attested-register-license-instead");
  if (current.evidenceStatus !== "VERIFIED") reasons.push("evidence-not-verified");
  if (current.bottleCount == null) reasons.push("unmapped-quantity");
  if (current.exclusionReason) reasons.push("excluded");
  if (current.duplicateOf) reasons.push("duplicate");
  if (!current.sha256) reasons.push("integrity-missing");
  if (current.classification !== OFFER_PACKAGE_IMAGE) reasons.push("not-package-image");
  if (current.rightsHolderLicenseStatus === "DENIED") reasons.push("rights-holder-license-denied");
  if (current.rightsHolderLicenseStatus !== "PROVEN") reasons.push("rights-holder-license-unproven");
  const hasFile = Boolean(offerImagePublicSrc(current) || (current.localFile && existsSync(current.localFile)));
  if (!hasFile) reasons.push("file-missing");
  return { ok: reasons.length === 0, reasons };
}

export function offerImageOperatorAttestationEligibility(asset: OfferImageAsset): { ok: boolean; reasons: string[] } {
  const current = withOfferImageAuthDefaults(asset);
  const reasons: string[] = [];
  if (current.operatorAttestation === "OPERATOR_APPROVED") reasons.push("already-operator-approved");
  if (current.usageAuthorization === "REJECTED" || current.reviewStatus === "REJECTED") reasons.push("already-rejected");
  if (current.evidenceStatus !== "VERIFIED") reasons.push("evidence-not-verified");
  if (current.bottleCount == null) reasons.push("unmapped-quantity");
  if (current.exclusionReason) reasons.push("excluded");
  if (current.duplicateOf) reasons.push("duplicate");
  if (!current.sha256) reasons.push("integrity-missing");
  if (current.classification !== OFFER_PACKAGE_IMAGE) reasons.push("not-package-image");
  const hasFile = Boolean(offerImagePublicSrc(current) || (current.localFile && existsSync(current.localFile)));
  if (!hasFile) reasons.push("file-missing");
  return { ok: reasons.length === 0, reasons };
}

export function offerImageRejectEligibility(asset: OfferImageAsset): { ok: boolean; reasons: string[] } {
  if (asset.usageAuthorization === "REJECTED" && asset.reviewStatus === "REJECTED") {
    return { ok: false, reasons: ["already-rejected"] };
  }
  return { ok: true, reasons: [] };
}

export function listOfferImagesEligibleForApproval(inventory: OfferImageInventory | null | undefined): OfferImageAsset[] {
  return (inventory?.assets ?? []).filter((asset) => offerImageApprovalEligibility(asset).ok);
}

function normalizeJustification(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function offerImageDecisionActor(value: string | null | undefined): string {
  const actor = (value ?? "").trim() || "lab-operator";
  return actor.slice(0, 80);
}

export function validateOfferImageJustification(value: string): { ok: true; justification: string } | { ok: false; error: string } {
  const justification = normalizeJustification(value);
  if (justification.length < MIN_OFFER_IMAGE_JUSTIFICATION) {
    return { ok: false, error: "justification-required" };
  }
  return { ok: true, justification };
}

function allowedOfferImageRoots(): string[] {
  return [path.resolve(process.cwd(), "data"), path.resolve(process.cwd(), "public"), path.resolve(productImageDir())];
}

export function isAllowedOfferImageDiskPath(file: string): boolean {
  const resolved = path.resolve(file);
  return allowedOfferImageRoots().some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}

export function resolveOfferImageDiskPath(asset: OfferImageAsset): string | null {
  if (asset.localFile && existsSync(asset.localFile) && isAllowedOfferImageDiskPath(asset.localFile)) {
    return asset.localFile;
  }
  const publicSrc = offerImagePublicSrc(asset);
  if (publicSrc?.startsWith("/media/product/")) {
    const name = publicSrc.slice("/media/product/".length);
    if (!isSafeImageFilename(name)) return null;
    const disk = path.join(productImageDir(), name);
    if (existsSync(disk)) return disk;
  }
  return null;
}

export function materializeApprovedOfferImage(asset: OfferImageAsset): { publicSrc: string } | { error: string } {
  const existing = offerImagePublicSrc(asset);
  if (existing) return { publicSrc: existing };
  const disk = resolveOfferImageDiskPath(asset);
  if (!disk) return { error: "file-missing" };
  const buffer = readFileSync(disk);
  const stored = storeProductImageBuffer(buffer, asset.mimeType || "", "DIRECT_SOURCE");
  if (!stored) return { error: "materialize-failed" };
  return { publicSrc: stored.src };
}

function promoteOfferImageWhenReady(
  asset: OfferImageAsset,
  input: {
    actor: string;
    at: string;
    justification: string;
    evidenceNote: string | null;
    materialize?: (asset: OfferImageAsset) => { publicSrc: string } | { error: string };
  },
): { asset: OfferImageAsset; promoted: boolean; error?: string } {
  const current = withOfferImageAuthDefaults(asset);
  if (
    current.usageAuthorization === "REJECTED" ||
    current.reviewStatus === "REJECTED" ||
    current.operatorAttestation !== "OPERATOR_APPROVED" ||
    current.rightsHolderLicenseStatus !== "PROVEN" ||
    current.evidenceStatus !== "VERIFIED" ||
    current.bottleCount == null ||
    current.exclusionReason ||
    current.duplicateOf ||
    !current.sha256
  ) {
    return { asset: current, promoted: false };
  }
  if (current.usageAuthorization === "APPROVED" && current.reviewStatus === "APPROVED" && offerImagePublicSrc(current)) {
    return { asset: current, promoted: false };
  }
  const materialize = input.materialize ?? materializeApprovedOfferImage;
  const stored = materialize(current);
  if ("error" in stored) return { asset: current, promoted: false, error: stored.error };
  const event: OfferImageAuthorizationEvent = {
    at: input.at,
    actor: input.actor,
    action: "AUTO_PUBLISH_READY",
    justification: input.justification,
    evidenceNote: input.evidenceNote,
  };
  return {
    promoted: true,
    asset: {
      ...current,
      usageAuthorization: "APPROVED",
      reviewStatus: "APPROVED",
      publicSrc: stored.publicSrc,
      authorizedBy: input.actor,
      authorizedAt: input.at,
      authorizationJustification: input.justification,
      authorizationEvidenceNote: input.evidenceNote,
      authorizationHistory: [...(current.authorizationHistory ?? []), event],
    },
  };
}

export function recordOperatorOfferImageAttestation(input: {
  inventory: OfferImageInventory;
  assetIds: string[];
  actor: string;
  declarationText: string;
  evidenceNote?: string | null;
  now?: string;
  /** TECHNICAL (default): integrity gates + optional publish promotion. ADMINISTRATIVE: OPERATOR_APPROVED only. */
  mode?: OfferImageOperatorAttestationMode;
  affiliateProgramAudit?: OfferImageAffiliateProgramAudit | null;
  materialize?: (asset: OfferImageAsset) => { publicSrc: string } | { error: string };
}): {
  inventory: OfferImageInventory;
  attested: string[];
  promoted: string[];
  skipped: Array<{ assetId: string; reasons: string[] }>;
  error?: string;
} {
  const justified = validateOfferImageJustification(input.declarationText);
  if (!justified.ok) {
    return { inventory: input.inventory, attested: [], promoted: [], skipped: [], error: justified.error };
  }
  const mode: OfferImageOperatorAttestationMode = input.mode === "ADMINISTRATIVE" ? "ADMINISTRATIVE" : "TECHNICAL";
  const actor = offerImageDecisionActor(input.actor);
  const at = input.now ?? new Date().toISOString();
  const evidenceNote = normalizeJustification(input.evidenceNote ?? "") || null;
  const attested: string[] = [];
  const promoted: string[] = [];
  const skipped: Array<{ assetId: string; reasons: string[] }> = [];
  const seen = new Set<string>();
  const assets = input.inventory.assets.map((raw) => {
    if (!input.assetIds.includes(raw.assetId) || seen.has(raw.assetId)) return raw;
    const asset = withOfferImageAuthDefaults(raw);
    seen.add(asset.assetId);
    if (mode === "ADMINISTRATIVE") {
      if (asset.operatorAttestation === "OPERATOR_APPROVED") {
        skipped.push({ assetId: asset.assetId, reasons: ["already-operator-approved"] });
        return asset;
      }
      const event: OfferImageAuthorizationEvent = {
        at,
        actor,
        action: "ADMINISTRATIVE_OPERATOR_APPROVAL",
        justification: justified.justification,
        evidenceNote,
      };
      attested.push(asset.assetId);
      // Administrative approval never promotes publication and never mutates technical evidence fields.
      return {
        ...asset,
        operatorAttestation: "OPERATOR_APPROVED" as const,
        operatorAttestedBy: actor,
        operatorAttestedAt: at,
        operatorAttestationNote: justified.justification,
        authorizationHistory: [...(asset.authorizationHistory ?? []), event],
      };
    }
    const eligibility = offerImageOperatorAttestationEligibility(asset);
    if (!eligibility.ok) {
      skipped.push({ assetId: asset.assetId, reasons: eligibility.reasons });
      return asset;
    }
    const event: OfferImageAuthorizationEvent = {
      at,
      actor,
      action: "OPERATOR_ATTEST",
      justification: justified.justification,
      evidenceNote,
    };
    attested.push(asset.assetId);
    let next: OfferImageAsset = {
      ...asset,
      usageAuthorization: asset.usageAuthorization === "REJECTED" ? "REJECTED" : "PENDING",
      reviewStatus: asset.reviewStatus === "REJECTED" ? "REJECTED" : "REQUIRES_HUMAN_REVIEW",
      operatorAttestation: "OPERATOR_APPROVED" as const,
      operatorAttestedBy: actor,
      operatorAttestedAt: at,
      operatorAttestationNote: justified.justification,
      rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus === "PROVEN" ? "PROVEN" : "UNPROVEN",
      rightsHolderLicenseEvidence: asset.rightsHolderLicenseEvidence ?? null,
      authorizationHistory: [...(asset.authorizationHistory ?? []), event],
    };
    // If a proven rights-holder license already exists, promote without a second operator click.
    const ready = promoteOfferImageWhenReady(next, {
      actor,
      at,
      justification: justified.justification,
      evidenceNote: next.rightsHolderLicenseEvidence || evidenceNote,
      materialize: input.materialize,
    });
    if (ready.error) {
      skipped.push({ assetId: asset.assetId, reasons: [ready.error] });
      return next;
    }
    if (ready.promoted) promoted.push(asset.assetId);
    return ready.asset;
  });

  for (const assetId of input.assetIds) {
    if (!assetId || seen.has(assetId) || attested.includes(assetId) || skipped.some((item) => item.assetId === assetId)) {
      continue;
    }
    if (!input.inventory.assets.some((item) => item.assetId === assetId)) {
      skipped.push({ assetId, reasons: ["asset-not-found"] });
    }
  }

  return {
    inventory: {
      ...input.inventory,
      assets,
      affiliateProgramAudit: input.affiliateProgramAudit ?? input.inventory.affiliateProgramAudit ?? null,
    },
    attested,
    promoted,
    skipped,
  };
}

export function recordRightsHolderLicense(input: {
  inventory: OfferImageInventory;
  assetIds: string[];
  actor: string;
  licenseEvidence: string;
  evidenceNote?: string | null;
  now?: string;
  materialize?: (asset: OfferImageAsset) => { publicSrc: string } | { error: string };
}): {
  inventory: OfferImageInventory;
  licensed: string[];
  promoted: string[];
  skipped: Array<{ assetId: string; reasons: string[] }>;
  error?: string;
} {
  const evidence = validateOfferImageJustification(input.licenseEvidence);
  if (!evidence.ok) return { inventory: input.inventory, licensed: [], promoted: [], skipped: [], error: "license-evidence-required" };
  const actor = offerImageDecisionActor(input.actor);
  const at = input.now ?? new Date().toISOString();
  const evidenceNote = normalizeJustification(input.evidenceNote ?? "") || null;
  const licensed: string[] = [];
  const promoted: string[] = [];
  const skipped: Array<{ assetId: string; reasons: string[] }> = [];
  const seen = new Set<string>();

  const assets = input.inventory.assets.map((raw) => {
    if (!input.assetIds.includes(raw.assetId) || seen.has(raw.assetId)) return raw;
    const asset = withOfferImageAuthDefaults(raw);
    seen.add(asset.assetId);
    if (asset.usageAuthorization === "REJECTED" || asset.reviewStatus === "REJECTED") {
      skipped.push({ assetId: asset.assetId, reasons: ["already-rejected"] });
      return asset;
    }
    if (asset.rightsHolderLicenseStatus === "DENIED") {
      skipped.push({ assetId: asset.assetId, reasons: ["rights-holder-license-denied"] });
      return asset;
    }
    if (asset.evidenceStatus !== "VERIFIED" || asset.bottleCount == null || asset.exclusionReason || asset.duplicateOf || !asset.sha256) {
      skipped.push({
        assetId: asset.assetId,
        reasons: offerImageOperatorAttestationEligibility(asset).reasons.filter((reason) => reason !== "already-operator-approved"),
      });
      return asset;
    }
    const event: OfferImageAuthorizationEvent = {
      at,
      actor,
      action: "RIGHTS_HOLDER_LICENSE",
      justification: evidence.justification,
      evidenceNote,
    };
    licensed.push(asset.assetId);
    let next: OfferImageAsset = {
      ...asset,
      rightsHolderLicenseStatus: "PROVEN",
      rightsHolderLicenseEvidence: evidence.justification,
      authorizationHistory: [...(asset.authorizationHistory ?? []), event],
    };
    // OPERATOR_APPROVED + proven license unlocks publication without a second operator approval.
    const ready = promoteOfferImageWhenReady(next, {
      actor,
      at,
      justification: evidence.justification,
      evidenceNote: evidenceNote || evidence.justification,
      materialize: input.materialize,
    });
    if (ready.error) {
      skipped.push({ assetId: asset.assetId, reasons: [ready.error] });
      return next;
    }
    if (ready.promoted) promoted.push(asset.assetId);
    return ready.asset;
  });

  for (const assetId of input.assetIds) {
    if (!assetId || seen.has(assetId) || licensed.includes(assetId) || skipped.some((item) => item.assetId === assetId)) continue;
    if (!input.inventory.assets.some((item) => item.assetId === assetId)) skipped.push({ assetId, reasons: ["asset-not-found"] });
  }

  return { inventory: { ...input.inventory, assets }, licensed, promoted, skipped };
}

export type OfferImageDecideInput = {
  inventory: OfferImageInventory;
  assetId: string;
  action: OfferImageDecisionAction;
  actor: string;
  justification: string;
  evidenceNote?: string | null;
  now?: string;
  materialize?: (asset: OfferImageAsset) => { publicSrc: string } | { error: string };
};

export type OfferImageDecideResult =
  | { ok: true; inventory: OfferImageInventory; asset: OfferImageAsset }
  | { ok: false; error: string; reasons?: string[] };

function applyOfferImageDecision(asset: OfferImageAsset, input: OfferImageDecideInput): OfferImageDecideResult {
  const current = withOfferImageAuthDefaults(asset);
  const actor = offerImageDecisionActor(input.actor);
  const justified = validateOfferImageJustification(input.justification);
  if (!justified.ok) return { ok: false, error: justified.error };
  const evidenceNote = normalizeJustification(input.evidenceNote ?? "") || null;
  const at = input.now ?? new Date().toISOString();
  const event: OfferImageAuthorizationEvent = {
    at,
    actor,
    action: input.action,
    justification: justified.justification,
    evidenceNote,
  };

  if (input.action === "REJECT") {
    const eligibility = offerImageRejectEligibility(current);
    if (!eligibility.ok) return { ok: false, error: "not-eligible", reasons: eligibility.reasons };
    const next: OfferImageAsset = {
      ...current,
      usageAuthorization: "REJECTED",
      reviewStatus: "REJECTED",
      authorizedBy: actor,
      authorizedAt: at,
      authorizationJustification: justified.justification,
      authorizationEvidenceNote: evidenceNote,
      authorizationHistory: [...current.authorizationHistory!, event],
    };
    return { ok: true, inventory: input.inventory, asset: next };
  }

  const eligibility = offerImageApprovalEligibility(current);
  if (!eligibility.ok) return { ok: false, error: "not-eligible", reasons: eligibility.reasons };
  const materialize = input.materialize ?? materializeApprovedOfferImage;
  const stored = materialize(current);
  if ("error" in stored) return { ok: false, error: stored.error, reasons: [stored.error] };
  const next: OfferImageAsset = {
    ...current,
    usageAuthorization: "APPROVED",
    reviewStatus: "APPROVED",
    publicSrc: stored.publicSrc,
    authorizedBy: actor,
    authorizedAt: at,
    authorizationJustification: justified.justification,
    authorizationEvidenceNote: evidenceNote,
    authorizationHistory: [...current.authorizationHistory!, event],
    // Publishing approval still requires a previously proven rights-holder license.
    rightsHolderLicenseStatus: "PROVEN",
    rightsHolderLicenseEvidence: current.rightsHolderLicenseEvidence || evidenceNote || justified.justification,
  };
  return { ok: true, inventory: input.inventory, asset: next };
}

export function decideOfferImage(input: OfferImageDecideInput): OfferImageDecideResult {
  const index = input.inventory.assets.findIndex((item) => item.assetId === input.assetId);
  if (index < 0) return { ok: false, error: "asset-not-found" };
  const decided = applyOfferImageDecision(input.inventory.assets[index]!, input);
  if (!decided.ok) return decided;
  const assets = input.inventory.assets.map((item, itemIndex) => (itemIndex === index ? decided.asset : item));
  return { ok: true, inventory: { ...input.inventory, assets }, asset: decided.asset };
}

export function decideEligibleOfferImages(input: {
  inventory: OfferImageInventory;
  assetIds: string[];
  action: OfferImageDecisionAction;
  actor: string;
  justification: string;
  evidenceNote?: string | null;
  now?: string;
  materialize?: OfferImageDecideInput["materialize"];
}): {
  inventory: OfferImageInventory;
  approved: string[];
  rejected: string[];
  skipped: Array<{ assetId: string; reasons: string[] }>;
  error?: string;
} {
  const justified = validateOfferImageJustification(input.justification);
  if (!justified.ok) {
    return { inventory: input.inventory, approved: [], rejected: [], skipped: [], error: justified.error };
  }
  let inventory = input.inventory;
  const approved: string[] = [];
  const rejected: string[] = [];
  const skipped: Array<{ assetId: string; reasons: string[] }> = [];
  const seen = new Set<string>();

  for (const assetId of input.assetIds) {
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);
    const asset = inventory.assets.find((item) => item.assetId === assetId);
    if (!asset) {
      skipped.push({ assetId, reasons: ["asset-not-found"] });
      continue;
    }
    if (input.action === "APPROVE") {
      const eligibility = offerImageApprovalEligibility(asset);
      if (!eligibility.ok) {
        skipped.push({ assetId, reasons: eligibility.reasons });
        continue;
      }
    }
    const decided = decideOfferImage({
      inventory,
      assetId,
      action: input.action,
      actor: input.actor,
      justification: justified.justification,
      evidenceNote: input.evidenceNote,
      now: input.now,
      materialize: input.materialize,
    });
    if (!decided.ok) {
      skipped.push({ assetId, reasons: decided.reasons ?? [decided.error] });
      continue;
    }
    inventory = decided.inventory;
    if (input.action === "APPROVE") approved.push(assetId);
    else rejected.push(assetId);
  }

  return { inventory, approved, rejected, skipped };
}

export function filterOfferImageAssets(
  assets: OfferImageAsset[],
  filters: { authorization?: string; evidence?: string; review?: string; bottles?: string },
): OfferImageAsset[] {
  return assets.filter((asset) => {
    if (filters.authorization && filters.authorization !== "ALL" && asset.usageAuthorization !== filters.authorization) {
      return false;
    }
    if (filters.evidence && filters.evidence !== "ALL" && asset.evidenceStatus !== filters.evidence) return false;
    if (filters.review && filters.review !== "ALL" && asset.reviewStatus !== filters.review) return false;
    if (filters.bottles && filters.bottles !== "ALL") {
      if (filters.bottles === "unmapped") return asset.bottleCount == null;
      if (String(asset.bottleCount) !== filters.bottles) return false;
    }
    return true;
  });
}

export function offerImageAdminFilePath(generationId: string, assetId: string): string {
  return `/admin/lab/lp-generator/${encodeURIComponent(generationId)}/offer-images/file/${encodeURIComponent(assetId)}`;
}

export function selectRenderableOfferImage(input: {
  inventory: OfferImageInventory | null | undefined;
  bottleCount: number;
}): OfferImageAsset | null {
  if (!input.inventory) return null;
  const matches = input.inventory.assets.filter(
    (item) => item.bottleCount === input.bottleCount && offerImageIsPublishable(item),
  );
  return matches.sort((a, b) => b.associationConfidence - a.associationConfidence)[0] ?? null;
}

/** Admin/lab preview only. Never used for public publication. */
export const OFFER_IMAGE_LOCAL_PREVIEW_ONLY = "LOCAL_PREVIEW_ONLY" as const;

export function offerImageLocalPreviewEligible(asset: OfferImageAsset): boolean {
  const current = withOfferImageAuthDefaults(asset);
  return (
    current.classification === OFFER_PACKAGE_IMAGE &&
    current.operatorAttestation === "OPERATOR_APPROVED" &&
    current.evidenceStatus === "VERIFIED" &&
    current.usageAuthorization !== "REJECTED" &&
    current.reviewStatus !== "REJECTED" &&
    current.rightsHolderLicenseStatus !== "DENIED" &&
    current.bottleCount != null &&
    !current.exclusionReason &&
    !current.duplicateOf &&
    Boolean(current.sha256) &&
    Boolean(resolveOfferImageDiskPath(current))
  );
}

export function selectLocalPreviewOfferImage(input: {
  inventory: OfferImageInventory | null | undefined;
  bottleCount: number;
}): OfferImageAsset | null {
  if (!input.inventory) return null;
  const matches = input.inventory.assets.filter(
    (item) => item.bottleCount === input.bottleCount && offerImageLocalPreviewEligible(item),
  );
  return matches.sort((a, b) => b.associationConfidence - a.associationConfidence)[0] ?? null;
}

/**
 * Restores REJECTED → PENDING for admin LOCAL_PREVIEW_ONLY eligibility.
 * Does not approve publication, prove rights-holder license, or set publicSrc.
 */
export function reopenRejectedOfferImagesForLocalPreview(input: {
  inventory: OfferImageInventory;
  assetIds: string[];
  actor?: string;
  justification: string;
  evidenceNote?: string;
  now?: string;
}): { inventory: OfferImageInventory; reopened: string[]; skipped: Array<{ assetId: string; reasons: string[] }> } {
  const actor = offerImageDecisionActor(input.actor);
  const justified = validateOfferImageJustification(input.justification);
  if (!justified.ok) return { inventory: input.inventory, reopened: [], skipped: input.assetIds.map((assetId) => ({ assetId, reasons: [justified.error] })) };
  const at = input.now ?? new Date().toISOString();
  const evidenceNote = normalizeJustification(input.evidenceNote ?? "") || null;
  const reopened: string[] = [];
  const skipped: Array<{ assetId: string; reasons: string[] }> = [];
  const seen = new Set<string>();
  const assets = input.inventory.assets.map((raw) => {
    if (!input.assetIds.includes(raw.assetId) || seen.has(raw.assetId)) return raw;
    seen.add(raw.assetId);
    const current = withOfferImageAuthDefaults(raw);
    const reasons: string[] = [];
    if (current.usageAuthorization !== "REJECTED" && current.reviewStatus !== "REJECTED") reasons.push("not-rejected");
    if (current.operatorAttestation !== "OPERATOR_APPROVED") reasons.push("operator-attestation-required");
    if (current.rightsHolderLicenseStatus === "DENIED") reasons.push("rights-holder-denied");
    if (current.evidenceStatus !== "VERIFIED") reasons.push("evidence-not-verified");
    if (current.classification !== OFFER_PACKAGE_IMAGE) reasons.push("not-package-image");
    if (reasons.length) {
      skipped.push({ assetId: current.assetId, reasons });
      return current;
    }
    const event: OfferImageAuthorizationEvent = {
      at,
      actor,
      action: "REOPEN_PENDING",
      justification: justified.justification,
      evidenceNote,
    };
    reopened.push(current.assetId);
    return {
      ...current,
      usageAuthorization: "PENDING" as const,
      reviewStatus: "REQUIRES_HUMAN_REVIEW" as const,
      publicSrc: null,
      authorizedBy: actor,
      authorizedAt: at,
      authorizationJustification: justified.justification,
      authorizationEvidenceNote: evidenceNote,
      authorizationHistory: [...(current.authorizationHistory ?? []), event],
    };
  });
  return { inventory: { ...input.inventory, assets }, reopened, skipped };
}

export function diagnoseMissingOfferImages(input: {
  checkoutClassified: boolean;
  researchSeededOrderPage: boolean;
  primaryInventoryImageCount: number;
  associatedCount: number;
  approvedCount: number;
}): {
  rootCause: string;
  found: boolean;
  discarded: boolean;
  misclassified: boolean;
  unassociated: boolean;
  pendingApproval: boolean;
  approvedNotSelected: boolean;
} {
  const found = input.primaryInventoryImageCount > 0;
  const unassociated = found && input.associatedCount === 0;
  const pendingApproval = input.associatedCount > 0 && input.approvedCount === 0;
  const approvedNotSelected = input.approvedCount > 0;
  const rootCause = [
    input.checkoutClassified
      ? "General research and browser-render skip /order-now as CHECKOUT_SUSPECTED."
      : "",
    !input.researchSeededOrderPage
      ? "Product research seeded informational hosts, not the registered offer page, so package images never entered discoveredAssets."
      : "",
    found
      ? "Primary-page inventory collected producer images as a flat img list without binding them to package quantities."
      : "Producer package images were not present in stored inventories.",
    unassociated ? "No OFFER_PACKAGE_IMAGE association existed, so the renderer could not select per-package art." : "",
    pendingApproval
      ? "Associated package images remain PENDING. Presence on the producer page is not reuse authorization."
      : "",
    approvedNotSelected
      ? "Approved package images exist but were not selected by the renderer."
      : "The renderer used the single USER_APPROVED packshot as a product illustration on every card.",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    rootCause,
    found,
    discarded: false,
    misclassified: false,
    unassociated,
    pendingApproval,
    approvedNotSelected,
  };
}
