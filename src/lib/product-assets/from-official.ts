import { classifyAssetCandidate } from "@/lib/assets/classify";
import { permissionEvidence, promoImageLandingBlock } from "@/lib/official-assets/review";
import type { OfficialPromoAsset } from "@/lib/official-assets/store";
import type { AuthorizationRecord } from "@/lib/product-assets/registry";
import type { AssetKind, AssetListing, MeasuredImage, ProductAssetCandidate } from "@/lib/product-assets/types";

/**
 * Pure adapters from the data the app already stores to ProductAssetCandidate.
 * Nothing here reads a database or a file, so tests use fictional rows.
 */

const PACK_NAME = /\.(?:zip|rar|7z)$|-pack$/i;

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function kindFor(row: OfficialPromoAsset): AssetKind {
  if (row.section === "campaign" || PACK_NAME.test(row.fileName)) return "PROMO_BANNER";
  const role = classifyAssetCandidate({ url: row.originalUrl, alt: "", width: row.width ?? 0, height: row.height ?? 0 }).role;
  if (role === "PRODUCT_LIFESTYLE") return "CONTEXTUAL";
  if (role === "BRAND_LOGO") return "BRAND_LOGO";
  if (role === "UNUSABLE" || role === "DECORATIVE_SOURCE" || role === "INGREDIENT_VISUAL") return "OTHER";
  // The manufacturer labelled the section "Product Images". A person still has to approve it.
  return "PACKSHOT";
}

/**
 * A row carries explicit permission only when its evidence text is exactly what the
 * section-discovery path writes. Any hand-written note ("displayed on the page, permission
 * not explicit") is treated as the absence of a grant.
 */
function hasSectionGrant(row: OfficialPromoAsset): boolean {
  return row.permissionEvidence === permissionEvidence(row.section, row.sourcePage, row.verifiedAt);
}

export function candidateFromOfficialRow(
  row: OfficialPromoAsset,
  productName: string,
  extra: { measured?: MeasuredImage | null; record?: AuthorizationRecord | null } = {},
): ProductAssetCandidate {
  const record = extra.record ?? null;
  const granted = hasSectionGrant(row);
  const section: AssetListing["section"] = record
    ? record.listingSection
    : PACK_NAME.test(row.fileName)
    ? "DOWNLOAD_PACK"
    : granted
      ? row.section === "product"
        ? "PRODUCT_IMAGES"
        : "CAMPAIGN_IMAGES"
      : "DISPLAYED_ONLY";
  // A stored block reason may be a format limit of the old Asset Manager. Only the filename
  // policy (health claims, promises, testimonials) is re-derived and kept as a hard block.
  const policyBlock = promoImageLandingBlock(`${row.fileName} ${row.originalUrl}`);
  // A rejection without a stored block reason is a person's decision (rejectOfficialPromoAsset).
  const humanRejected = row.status === "rejected" && !row.blockReason;
  return {
    id: `official-${row.id}`,
    productName,
    url: row.originalUrl,
    origin: "MANUFACTURER_AFFILIATE_TOOLS",
    kind: kindFor(row),
    fileName: row.fileName,
    alt: null,
    declaredProduct: record?.declaredProduct ?? null,
    listing: { sourcePage: row.sourcePage, section, observedAt: row.verifiedAt },
    // A recorded evidence entry replaces the 47A inference. Without one, only the standard section text counts.
    authorizationEvidence: record
      ? record.authorization
      : granted
        ? { kind: "MANUFACTURER_ASSET_SECTION", sourceUrl: row.sourcePage, statement: row.permissionEvidence, verifiedAt: row.verifiedAt }
        : null,
    policyBlock,
    humanRejection: humanRejected ? { note: row.reviewNote ?? "Rejected by a person.", at: row.verifiedAt } : null,
    approval:
      row.status === "approved" && row.localFile
        ? { approvedBy: "operator (stored approval record)", approvedAt: row.verifiedAt, embeddedTextReviewed: true, productMatchConfirmed: true }
        : null,
    localFile: row.status === "approved" ? row.localFile : null,
    measured: extra.measured ?? null,
  };
}

/** The image already attached to the campaign. Reported for audit; it never gains authorization by being attached. */
export function candidateFromLegacyHero(input: {
  productName: string;
  src: string;
  provenance: string | null | undefined;
  observedAt: string;
}): ProductAssetCandidate {
  const manual = input.provenance === "MANUAL";
  return {
    id: "campaign-hero",
    productName: input.productName,
    url: input.src,
    origin: manual ? "OPERATOR_UPLOAD" : "OFFICIAL_PRODUCT_PAGE",
    kind: "PACKSHOT",
    fileName: input.src.split("/").pop() ?? "image",
    alt: null,
    declaredProduct: null,
    listing: { sourcePage: input.src, section: manual ? "DISPLAYED_ONLY" : "META_TAG", observedAt: input.observedAt },
    authorizationEvidence: null,
    policyBlock: null,
    humanRejection: null,
    approval: null,
    localFile: input.src,
    measured: null,
  };
}

export function officialHostsFrom(urls: ReadonlyArray<string | null | undefined>): string[] {
  const hosts = new Set<string>();
  for (const url of urls) {
    const host = url ? hostOf(url) : "";
    if (host) hosts.add(host.replace(/^www\./, ""));
  }
  return [...hosts];
}

/** File hosts the manufacturer itself named by listing files in its own asset sections. */
export function declaredHostsFrom(rows: readonly OfficialPromoAsset[]): string[] {
  const hosts = new Set<string>();
  for (const row of rows) {
    if (!hasSectionGrant(row)) continue;
    const host = hostOf(row.originalUrl);
    if (host) hosts.add(host.replace(/^www\./, ""));
  }
  return [...hosts];
}
