import { distinctiveTokens, hostMatches } from "@/lib/product-assets/match";
import {
  PROHIBITED_ORIGINS,
  type AuthorizationEvidence,
  type AuthorizationKind,
  type AuthorizationStatus,
  type EvaluationContext,
  type ProductAssetCandidate,
  type ProvenanceStatus,
} from "@/lib/product-assets/types";

/**
 * Commercial authorization, assessed separately from technical validity.
 *
 * Policy (Execution 47B): a file offered to affiliates by the program or the manufacturer for
 * promotion is authorized, with no further individual permission, once the source, the offering,
 * the program's restrictions, and the intended use all check out. A file that is merely displayed
 * on a public page, or hosted on the official domain, is not.
 */

/** Program-derived evidence is re-verified after this many days, because program terms change. */
export const AUTHORIZATION_MAX_AGE_DAYS = 180;

const LIBRARY_SECTIONS = new Set(["PRODUCT_IMAGES", "CAMPAIGN_IMAGES", "DOWNLOAD_PACK"]);

function hostOf(url: string | null | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** The 47A names are aliases of the policy kinds. */
export function canonicalAuthorizationKind(kind: AuthorizationKind): AuthorizationKind {
  if (kind === "MANUFACTURER_ASSET_SECTION") return "OFFICIAL_AFFILIATE_ASSET_LIBRARY";
  if (kind === "WRITTEN_LICENSE") return "EXPLICIT_WRITTEN_PERMISSION";
  return kind;
}

/** True for a kind that, once documented, lets the asset pass without a person's approval. */
export function isPolicyEvidence(evidence: AuthorizationEvidence | null | undefined): boolean {
  return Boolean(evidence && evidence.kind !== "MANUFACTURER_ASSET_SECTION" && evidence.kind !== "WRITTEN_LICENSE" && evidence.kind !== "OPERATOR_RIGHTS_DECLARATION");
}

export function assessProvenance(candidate: ProductAssetCandidate, context: EvaluationContext): { status: ProvenanceStatus; reasons: string[] } {
  if (PROHIBITED_ORIGINS.includes(candidate.origin)) {
    return { status: "PROHIBITED", reasons: [`Origin ${candidate.origin} can never stand in for a real photograph of this product.`] };
  }
  const host = hostOf(candidate.url);
  if (host && hostMatches(host, context.officialHosts)) return { status: "OFFICIAL", reasons: [`Served from ${host}, a domain of the product.`] };
  if (host && hostMatches(host, context.declaredAssetHosts ?? [])) {
    return { status: "DECLARED_HOST", reasons: [`Served from ${host}, a file host the manufacturer named on its own asset page.`] };
  }
  if (candidate.origin === "OPERATOR_UPLOAD") {
    return { status: "UNVERIFIED", reasons: ["Operator upload. Provenance rests on the operator's own rights declaration."] };
  }
  return { status: "UNVERIFIED", reasons: [host ? `${host} is not a domain of the product and was not declared by the manufacturer.` : "The file has no verifiable host."] };
}

type Verdict = { status: AuthorizationStatus; reasons: string[] };

const no = (reason: string): Verdict => ({ status: "NOT_DOCUMENTED", reasons: [reason] });
const denied = (reason: string): Verdict => ({ status: "DENIED", reasons: [reason] });

function daysBetween(fromIso: string, toIso: string): number {
  return (Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000;
}

/** Withdrawn, expired, or too old to trust. Applies to every kind. */
function validityVerdict(evidence: AuthorizationEvidence, kind: AuthorizationKind, now: string): Verdict | null {
  if (evidence.revokedAt && evidence.revokedAt.trim()) {
    return denied(`The permission was withdrawn on ${evidence.revokedAt}.`);
  }
  if (evidence.validUntil && evidence.validUntil.trim()) {
    const until = Date.parse(evidence.validUntil);
    if (!Number.isFinite(until)) return no("The permission has an unreadable expiry date.");
    if (until < Date.parse(now)) return no(`The permission expired on ${evidence.validUntil}. It must be verified again.`);
  }
  const verified = Date.parse(evidence.verifiedAt);
  if (!Number.isFinite(verified)) return no("The permission evidence has no readable verification date.");
  const policyKind = kind === "OFFICIAL_AFFILIATE_ASSET_LIBRARY" || kind === "OFFICIAL_AFFILIATE_API" || kind === "MANUFACTURER_PROMOTIONAL_MATERIAL";
  if (policyKind && isPolicyEvidence(evidence) && daysBetween(evidence.verifiedAt, now) > AUTHORIZATION_MAX_AGE_DAYS) {
    return no(`The program terms were last verified on ${evidence.verifiedAt}, more than ${AUTHORIZATION_MAX_AGE_DAYS} days ago. They must be verified again.`);
  }
  return null;
}

/** Restrictions of the program that cover this asset, and a use scope that excludes a landing page. */
function restrictionVerdict(evidence: AuthorizationEvidence): Verdict | null {
  const covering = (evidence.restrictions ?? []).filter((item) => item.appliesToThisAsset);
  if (covering.length > 0) {
    return denied(`A program restriction covers this file: ${covering.map((item) => item.text).join(" | ")}`);
  }
  if (evidence.useScope === "PROHIBITED") return denied("The program states this material may not be used.");
  if (evidence.useScope === "CHANNEL_LIMITED") return denied("The program limits this material to channels that do not include a landing page.");
  return null;
}

function productVerdict(evidence: AuthorizationEvidence, context: EvaluationContext): Verdict | null {
  if (!evidence.product || !evidence.product.trim()) return null;
  const wanted = distinctiveTokens(context.productName);
  const stated = evidence.product.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (wanted.length > 0 && !wanted.every((token) => stated.includes(token.replace(/[^a-z0-9]+/g, "")))) {
    return no(`The permission was recorded for "${evidence.product}", not for ${context.productName}.`);
  }
  return null;
}

function trustedSource(evidence: AuthorizationEvidence, context: EvaluationContext, extra: readonly string[] = []): Verdict | null {
  if (!evidence.sourceUrl || !evidence.sourceUrl.startsWith("https://")) return no("The evidence is not an HTTPS page.");
  const host = hostOf(evidence.sourceUrl);
  if (!host || !hostMatches(host, [...context.officialHosts, ...extra])) {
    return no("The evidence is not on a domain of the product's affiliate program or manufacturer.");
  }
  return null;
}

export function assessAuthorization(candidate: ProductAssetCandidate, context: EvaluationContext): Verdict {
  if (PROHIBITED_ORIGINS.includes(candidate.origin)) {
    return denied(`Origin ${candidate.origin} is not usable as a product photograph.`);
  }
  const evidence = candidate.authorizationEvidence;
  if (!evidence) {
    const why =
      candidate.listing.section === "META_TAG"
        ? "Found in a page meta tag. A public image is not a licensed image."
        : candidate.listing.section === "DISPLAYED_ONLY"
          ? "The page shows the file, but no section or statement grants affiliates the right to reuse it."
          : "No permission statement is recorded for this file.";
    return no(why);
  }
  const statement = evidence.statement.trim();
  const now = context.now ?? new Date().toISOString();
  if (!evidence.verifiedAt.trim()) return no("The permission evidence has no verification date.");

  const kind = canonicalAuthorizationKind(evidence.kind);
  const legacy = evidence.kind === "MANUFACTURER_ASSET_SECTION" || evidence.kind === "WRITTEN_LICENSE";

  const withdrawn = validityVerdict(evidence, kind, now);
  if (withdrawn?.status === "DENIED") return withdrawn;
  const restricted = restrictionVerdict(evidence);
  if (restricted) return restricted;
  if (withdrawn) return withdrawn;

  if (kind === "OPERATOR_RIGHTS_DECLARATION") {
    if (statement.length < 20) return no("An operator rights declaration needs a recorded statement.");
    return { status: "DOCUMENTED", reasons: ["Self-declared by the operator. The platform did not verify the rights."] };
  }

  const wrongProduct = productVerdict(evidence, context);
  if (wrongProduct) return wrongProduct;

  if (kind === "EXPLICIT_WRITTEN_PERMISSION") {
    if (statement.length < 20) return no("A written permission needs a recorded statement of its terms.");
    if (!legacy && evidence.useScope !== "LANDING_PAGE" && evidence.useScope !== "PROMOTIONAL_GENERAL") {
      return no("The written permission does not state that the image may be used on a promotional page.");
    }
    if (!legacy && !evidence.restrictionsReviewedAt?.trim()) return no("The restrictions that came with the permission were not recorded as reviewed.");
    return { status: "DOCUMENTED", reasons: ["A written permission is recorded."] };
  }

  // The three program sources. The same source, offering, restriction and scope checks apply to each.
  if (legacy) {
    // 47A section grant: the file was listed in the manufacturer's Product Images or Campaign Images section.
    const section = candidate.listing.section;
    if (section !== "PRODUCT_IMAGES" && section !== "CAMPAIGN_IMAGES") {
      return no(`The file was listed as ${section}, not in a manufacturer asset section.`);
    }
    const pageHost = hostOf(candidate.listing.sourcePage);
    if (!pageHost || !hostMatches(pageHost, context.officialHosts)) return no("The asset section is not on a domain of the product's manufacturer.");
    const untrusted = trustedSource(evidence, context);
    if (untrusted) return no("The asset section is not on a domain of the product's manufacturer.");
    if (statement.length < 12) return no("The evidence is not an HTTPS page with a recorded statement.");
    return { status: "DOCUMENTED", reasons: [`Listed by the manufacturer in ${section} at ${evidence.sourceUrl}.`] };
  }

  if (!evidence.program || !evidence.program.trim()) return no("The affiliate program that offers the material is not recorded.");
  if (statement.length < 20) return no("The evidence has no recorded statement of how the material was offered.");
  if (evidence.offeredForPromotion !== true) {
    return no("The file is displayed by the program but is not recorded as offered to affiliates for promotion.");
  }
  if (!evidence.restrictionsReviewedAt?.trim()) return no("The program's restrictions were not recorded as reviewed.");

  if (kind === "OFFICIAL_AFFILIATE_ASSET_LIBRARY") {
    if (!LIBRARY_SECTIONS.has(candidate.listing.section)) {
      return no(`The file was listed as ${candidate.listing.section}, not in the program's material library.`);
    }
    const untrusted = trustedSource(evidence, context);
    if (untrusted) return untrusted;
    return { status: "DOCUMENTED", reasons: [`Offered to affiliates in the library of ${evidence.program}, ${evidence.sourceUrl}.`] };
  }
  if (kind === "OFFICIAL_AFFILIATE_API") {
    if (candidate.listing.section !== "OFFICIAL_API") return no(`The file was listed as ${candidate.listing.section}, not returned by an official affiliate API.`);
    const untrusted = trustedSource(evidence, context, context.programHosts ?? []);
    if (untrusted) return untrusted;
    return { status: "DOCUMENTED", reasons: [`Returned by the official affiliate API of ${evidence.program}, ${evidence.sourceUrl}.`] };
  }
  // MANUFACTURER_PROMOTIONAL_MATERIAL
  if (evidence.useScope !== "LANDING_PAGE" && evidence.useScope !== "PROMOTIONAL_GENERAL") {
    return no("The terms that accompany the material do not state that it may be used on a promotional page.");
  }
  const untrusted = trustedSource(evidence, context);
  if (untrusted) return untrusted;
  return { status: "DOCUMENTED", reasons: [`Manufacturer promotional material of ${evidence.program}, with terms at ${evidence.sourceUrl}.`] };
}
