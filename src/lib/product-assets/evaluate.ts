import { assessAuthorization, assessProvenance, isPolicyEvidence } from "@/lib/product-assets/authorization";
import { matchProduct } from "@/lib/product-assets/match";
import { validateTechnical } from "@/lib/product-assets/technical";
import {
  STAGEABLE_KINDS,
  type ApprovedProductAsset,
  type AssetEvaluation,
  type EvaluationContext,
  type ProductAssetCandidate,
  type ProductAssetsContract,
} from "@/lib/product-assets/types";

/** Host + path without query or fragment, so a cache-busting suffix does not hide a duplicate. */
export function normalizedAssetUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${decodeURIComponent(parsed.pathname).toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

function evaluateOne(candidate: ProductAssetCandidate, context: EvaluationContext, duplicateOf: string | null): AssetEvaluation {
  const technical = validateTechnical(candidate.measured);
  const match = matchProduct(candidate, context);
  const provenance = assessProvenance(candidate, context);
  const authorization = assessAuthorization(candidate, context);

  const reject: string[] = [];
  if (candidate.policyBlock) reject.push(`Policy: ${candidate.policyBlock}`);
  if (candidate.humanRejection) reject.push(`A person rejected it: ${candidate.humanRejection.note}`);
  if (technical.status === "FAIL") reject.push(...technical.findings.map((item) => `Technical: ${item.message}`));
  if (match.status === "CONTRADICTED") reject.push(...match.reasons);
  if (provenance.status === "PROHIBITED") reject.push(...provenance.reasons);
  if (authorization.status === "DENIED") reject.push(...authorization.reasons);
  if (!STAGEABLE_KINDS.includes(candidate.kind)) reject.push(`A ${candidate.kind} cannot stage a product.`);
  if (duplicateOf) reject.push(`Duplicate of ${duplicateOf}.`);

  if (reject.length > 0) {
    return { id: candidate.id, technical, match, provenance, authorization, duplicateOf, status: "REJECTED", approvalMode: null, blockers: reject };
  }

  const blockers: string[] = [];
  if (technical.status === "NOT_CHECKED") blockers.push("The file was never fetched and measured.");
  if (technical.status === "PASS_NEEDS_CONVERSION") blockers.push("The format needs a JPEG, PNG or WebP copy before it can be served.");
  const approval = candidate.approval;
  // A program-offered packshot passes without a person once every mandatory check holds. Only a product
  // on its own (PACKSHOT, PACKAGING) qualifies: scene images can carry text that needs a human reading.
  const policyPass =
    !approval &&
    isPolicyEvidence(candidate.authorizationEvidence) &&
    authorization.status === "DOCUMENTED" &&
    match.status === "CONFIRMED" &&
    (candidate.kind === "PACKSHOT" || candidate.kind === "PACKAGING");
  const matchOk = match.status === "CONFIRMED" || (match.status === "PLAUSIBLE" && approval?.productMatchConfirmed === true);
  if (!matchOk) blockers.push(match.status === "PLAUSIBLE" ? "A person must confirm that the image shows this product." : "The product correspondence is not established.");
  const provenanceOk =
    provenance.status === "OFFICIAL" ||
    provenance.status === "DECLARED_HOST" ||
    (candidate.origin === "OPERATOR_UPLOAD" && candidate.authorizationEvidence?.kind === "OPERATOR_RIGHTS_DECLARATION");
  if (!provenanceOk) blockers.push("The provenance is not verified.");
  if (authorization.status !== "DOCUMENTED") blockers.push(`Commercial authorization is not documented. ${authorization.reasons.join(" ")}`.trim());
  if (!approval && !policyPass) {
    blockers.push(
      isPolicyEvidence(candidate.authorizationEvidence) && authorization.status === "DOCUMENTED"
        ? "The authorization is documented but the image cannot pass without a person: the product correspondence is not confirmed by the source, or it is not a packshot."
        : "No person has approved this image.",
    );
  } else if (approval && (!approval.embeddedTextReviewed || !approval.productMatchConfirmed)) {
    blockers.push("The approval did not cover embedded text and product correspondence.");
  }
  if (!candidate.localFile) blockers.push("No stored copy exists to serve.");

  return {
    id: candidate.id,
    technical,
    match,
    provenance,
    authorization,
    duplicateOf: null,
    status: blockers.length === 0 ? "APPROVED" : "CANDIDATE",
    approvalMode: blockers.length === 0 ? (approval ? "HUMAN" : "POLICY") : null,
    blockers,
  };
}

/** Evaluate in input order. The first copy of a file keeps its place and later copies are duplicates. */
export function evaluateCandidates(candidates: readonly ProductAssetCandidate[], context: EvaluationContext): AssetEvaluation[] {
  const byHash = new Map<string, string>();
  const byUrl = new Map<string, string>();
  return candidates.map((candidate) => {
    const hash = candidate.measured?.sha256 ?? null;
    const urlKey = normalizedAssetUrl(candidate.url);
    const duplicateOf = (hash ? byHash.get(hash) : undefined) ?? byUrl.get(urlKey) ?? null;
    if (hash && !byHash.has(hash)) byHash.set(hash, candidate.id);
    if (!byUrl.has(urlKey)) byUrl.set(urlKey, candidate.id);
    return evaluateOne(candidate, context, duplicateOf);
  });
}

/**
 * The only shape the renderer receives. Candidates and rejected files are counted, never exposed.
 * The alt text is built from the product name alone, so no image metadata can become page copy.
 */
export function buildProductAssetsContract(
  productName: string,
  candidates: readonly ProductAssetCandidate[],
  evaluations: readonly AssetEvaluation[],
): ProductAssetsContract {
  const approved: ApprovedProductAsset[] = [];
  for (const candidate of candidates) {
    const evaluation = evaluations.find((item) => item.id === candidate.id);
    if (!evaluation || evaluation.status !== "APPROVED") continue;
    const measured = candidate.measured;
    const evidence = candidate.authorizationEvidence;
    if (!measured || !evidence || !candidate.localFile || !measured.width || !measured.height || !measured.sha256 || !measured.format) continue;
    if (candidate.kind !== "PACKSHOT" && candidate.kind !== "PACKAGING" && candidate.kind !== "CONTEXTUAL") continue;
    approved.push({
      id: candidate.id,
      src: candidate.localFile,
      alt: `${productName.trim() || "Product"} product image`,
      kind: candidate.kind,
      width: measured.width,
      height: measured.height,
      format: measured.format,
      sha256: measured.sha256,
      origin: candidate.origin,
      sourcePage: candidate.listing.sourcePage,
      authorization: {
        kind: evidence.kind,
        sourceUrl: evidence.sourceUrl,
        verifiedAt: evidence.verifiedAt,
        program: evidence.program?.trim() || null,
        materialId: evidence.materialId?.trim() || null,
        useScope: evidence.useScope ?? "UNSPECIFIED",
        restrictions: (evidence.restrictions ?? []).map((item) => item.text),
      },
      approvalMode: evaluation.approvalMode === "POLICY" ? "POLICY" : "HUMAN",
      approvedAt: candidate.approval?.approvedAt ?? evidence.verifiedAt,
    });
  }
  const hero = approved.find((item) => item.kind === "PACKSHOT") ?? approved.find((item) => item.kind === "PACKAGING") ?? null;
  return {
    version: 1,
    productName,
    hero,
    approved,
    counts: {
      approved: evaluations.filter((item) => item.status === "APPROVED").length,
      candidate: evaluations.filter((item) => item.status === "CANDIDATE").length,
      rejected: evaluations.filter((item) => item.status === "REJECTED").length,
    },
  };
}

/** What the showcase model takes as its image. Null keeps the V3 neutral fallback. */
export function showcaseImageFromContract(contract: ProductAssetsContract | null | undefined): { src: string; alt: string } | null {
  const hero = contract?.hero;
  return hero ? { src: hero.src, alt: hero.alt } : null;
}
