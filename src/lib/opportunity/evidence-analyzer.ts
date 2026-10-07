/**
 * Evidence Signal: analyzer.
 *
 * Decides, for each evidence dimension, whether ProductFacts holds it and how
 * the holding is backed, then cross-checks the other supplied platform outputs
 * for consistency. It looks at presence and provenance only: it reads no
 * wording, calls no AI, crawls nothing, and uses no HTTP. It never changes its
 * inputs and returns no score and no recommendation.
 *
 * ProductFacts is the only authority. A value whose provenance is NOT_FOUND is
 * not evidence, and no other input can bring it back. DIRECT_SOURCE means the
 * source stated it, not that anyone verified it.
 */
import type { ContentSection } from "@/lib/content-boundary";
import type { PlanSection } from "@/lib/presentation-plan";
import type { CompletenessSectionId } from "@/lib/completeness-engine";
import type { ProductFacts } from "@/lib/product-facts";
import {
  EVIDENCE_DIMENSIONS,
  type EvidenceDimension,
  type EvidenceDimensionState,
  type EvidenceInputs,
  type EvidenceResult,
} from "./evidence-result";
import { validateEvidenceInputs } from "./evidence-validator";
import type { OpportunityIssue } from "./opportunity-validator";
import type { OpportunityMetadata } from "./opportunity-types";

export class EvidenceInputError extends Error {
  constructor(readonly issues: OpportunityIssue[]) {
    super("Evidence inputs are invalid.");
    this.name = "EvidenceInputError";
  }
}

export interface EvidenceAnalyzerOptions {
  /** Milliseconds clock for executionTime. */
  now?: () => number;
}

/** The provenances that mean "the source stated it" or "an operator entered it". */
export const EVIDENCE_AUTHORITATIVE_PROVENANCES: readonly string[] = ["DIRECT_SOURCE", "MANUAL"];
const AUTHORITATIVE = EVIDENCE_AUTHORITATIVE_PROVENANCES;

const COMPLETENESS_SECTION: Partial<Record<EvidenceDimension, CompletenessSectionId>> = {
  INGREDIENTS: "ingredients",
  FEATURES: "features",
  FAQ: "faq",
  GUARANTEE: "guarantee",
  PRICING: "pricing",
  RETURNS: "returns",
  WARNINGS: "warnings",
  SHIPPING: "shipping",
  MANUFACTURER: "manufacturer",
};

const PLAN_SECTIONS_FOR: Partial<Record<EvidenceDimension, PlanSection[]>> = {
  INGREDIENTS: ["ingredients"],
  FEATURES: ["features"],
  FAQ: ["faq"],
  GUARANTEE: ["guarantee"],
  PRICING: ["pricing"],
  WARNINGS: ["warnings"],
  MANUFACTURER: ["manufacturer"],
  SUPPORTING_CONTENT: ["description", "usage"],
};

const BOUNDARY_DIMENSION: Record<string, EvidenceDimension> = {
  INGREDIENT: "INGREDIENTS",
  FEATURE: "FEATURES",
  FAQ: "FAQ",
  GUARANTEE: "GUARANTEE",
  PRICING: "PRICING",
  RETURN_POLICY: "RETURNS",
  WARNING: "WARNINGS",
  SHIPPING: "SHIPPING",
  MANUFACTURER: "MANUFACTURER",
  PRODUCT_DESCRIPTION: "SUPPORTING_CONTENT",
  USAGE: "SUPPORTING_CONTENT",
};

interface Dimension {
  /** Items of evidence found. */
  count: number;
  provenances: string[];
  authoritative: boolean;
  /** Values exist but their provenance is NOT_FOUND, so they were not counted. */
  suppressed: boolean;
  /** Every counted statement is marked not eligible for copy. */
  copyBlocked: boolean;
}

const clean = (value: string | null | undefined): string => (value ?? "").replace(/\s+/g, " ").trim();

function filled(items: readonly string[] | undefined): string[] {
  return (items ?? []).map(clean).filter((item) => item.length > 0 && item.toUpperCase() !== "NOT_FOUND");
}

function dimension(count: number, provenances: string[], extra: Partial<Dimension> = {}): Dimension {
  return {
    count,
    provenances,
    authoritative: count > 0 && provenances.length > 0 && provenances.every((p) => AUTHORITATIVE.includes(p)),
    suppressed: false,
    copyBlocked: false,
    ...extra,
  };
}

const EMPTY: Dimension = dimension(0, []);

function scalar(value: string | undefined, provenance: string): Dimension {
  if (clean(value).length === 0 || clean(value).toUpperCase() === "NOT_FOUND") return EMPTY;
  if (provenance === "NOT_FOUND") return dimension(0, [], { suppressed: true });
  return dimension(1, [provenance]);
}

function list(values: readonly string[] | undefined, provenance: string): Dimension {
  const n = filled(values).length;
  if (n === 0) return EMPTY;
  if (provenance === "NOT_FOUND") return dimension(0, [], { suppressed: true });
  return dimension(n, [provenance]);
}

function merge(parts: Dimension[]): Dimension {
  const count = parts.reduce((sum, p) => sum + p.count, 0);
  const provenances = parts.flatMap((p) => p.provenances);
  const suppressed = parts.some((p) => p.suppressed) && count === 0;
  return dimension(count, provenances, { suppressed });
}

interface Statement {
  statement?: string;
  provenance: string;
  copyEligibility?: string;
  question?: string;
  sourceUrl?: string;
}

function operational(items: readonly Statement[] | undefined): Dimension {
  const kept = (items ?? []).filter((item) => clean(item.statement).length > 0 && item.provenance !== "NOT_FOUND");
  const raw = (items ?? []).filter((item) => clean(item.statement).length > 0);
  if (kept.length === 0) return raw.length > 0 ? dimension(0, [], { suppressed: true }) : EMPTY;
  return dimension(
    kept.length,
    kept.map((item) => item.provenance),
    { copyBlocked: kept.every((item) => item.copyEligibility === "NO") },
  );
}

function faq(facts: ProductFacts): Dimension {
  const seen = new Map<string, string>();
  for (const snippet of facts.sourceSnippets ?? []) {
    if (snippet.field !== "faq" || snippet.confidence === "NOT_FOUND") continue;
    const question = clean(snippet.question);
    const answer = clean(snippet.text);
    if (question || answer) seen.set(`${question.toLowerCase()}\n${answer.toLowerCase()}`, snippet.confidence);
  }
  const operationalRows: Statement[] = [
    ...(facts.returnsInformation ?? []),
    ...(facts.shippingInformation ?? []),
    ...(facts.productFormat ? [facts.productFormat] : []),
  ];
  for (const row of operationalRows) {
    const question = clean(row.question);
    if (!question || !clean(row.statement) || row.provenance === "NOT_FOUND") continue;
    const key = `${question.toLowerCase()}\n${clean(row.statement).toLowerCase()}`;
    if (!seen.has(key)) seen.set(key, row.provenance);
  }
  return dimension(seen.size, [...seen.values()]);
}

function pricing(facts: ProductFacts): Dimension {
  const text = scalar(facts.pricingInformation, facts.confidence.pricingInformation);
  const offers = (facts.offerFacts ?? []).filter((offer) => clean(offer.unitPrice) || clean(offer.totalPrice));
  const offerPart = dimension(offers.length, offers.map((offer) => offer.confidence));
  return merge([text, offerPart]);
}

function supportingContent(facts: ProductFacts): Dimension {
  const format = facts.productFormat && clean(facts.productFormat.statement) ? operational([facts.productFormat]) : EMPTY;
  return merge([
    scalar(facts.description, facts.confidence.description),
    list(facts.usageInformation, facts.confidence.usageInformation),
    format,
    operational(facts.ingredientContext),
  ]);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Distinct recorded http(s) source locations. A recorded location is the quality bar here. */
function evidenceSources(facts: ProductFacts): Dimension {
  const urls = new Set<string>();
  const add = (value: string | undefined) => {
    const url = clean(value);
    if (url && isHttpUrl(url)) urls.add(url);
  };
  add(facts.sourceUrl);
  for (const snippet of facts.sourceSnippets ?? []) add(snippet.sourceUrl);
  for (const row of [...(facts.returnsInformation ?? []), ...(facts.shippingInformation ?? [])]) add(row.sourceUrl);
  add(facts.productFormat?.sourceUrl);
  for (const entry of facts.ingredientContext ?? []) add(entry.sourceUrl);
  for (const offer of facts.offerFacts ?? []) add(offer.sourceUrl);
  return { count: urls.size, provenances: [], authoritative: urls.size > 0, suppressed: false, copyBlocked: false };
}

function measure(facts: ProductFacts): Record<EvidenceDimension, Dimension> {
  const c = facts.confidence;
  return {
    INGREDIENTS: list(facts.ingredientsOrComponents, c.ingredientsOrComponents),
    FEATURES: list(facts.features, c.features),
    FAQ: faq(facts),
    GUARANTEE: scalar(facts.guaranteeInformation, c.guaranteeInformation),
    PRICING: pricing(facts),
    RETURNS: operational(facts.returnsInformation),
    WARNINGS: list(facts.cautions, c.cautions),
    SHIPPING: operational(facts.shippingInformation),
    MANUFACTURER: scalar(facts.manufacturer, c.manufacturer),
    SUPPORTING_CONTENT: supportingContent(facts),
    EVIDENCE_SOURCES: evidenceSources(facts),
  };
}

function stateOf(d: Dimension): EvidenceDimensionState {
  if (d.count === 0) return "MISSING";
  return d.authoritative ? "AVAILABLE_AUTHORITATIVE" : "AVAILABLE_OTHER";
}

const normalizeName = (value: string): string => clean(value).toLowerCase();

/** Analyzes validated inputs. Throws EvidenceInputError when they are not valid. */
export function analyzeEvidence(inputs: EvidenceInputs, options: EvidenceAnalyzerOptions = {}): EvidenceResult {
  const now = options.now ?? (() => performance.now());
  const start = now();
  const problems = validateEvidenceInputs(inputs);
  if (problems.length > 0) throw new EvidenceInputError(problems);

  const facts = inputs.facts;
  const dims = measure(facts);
  const states = Object.fromEntries(EVIDENCE_DIMENSIONS.map((d) => [d, stateOf(dims[d])])) as Record<EvidenceDimension, EvidenceDimensionState>;
  const available = EVIDENCE_DIMENSIONS.filter((d) => states[d] !== "MISSING");
  const missing = EVIDENCE_DIMENSIONS.filter((d) => states[d] === "MISSING");
  const authoritativeCount = available.filter((d) => states[d] === "AVAILABLE_AUTHORITATIVE").length;
  const confidence = available.length === 0 ? null : Math.round((authoritativeCount / available.length) * 1000) / 1000;

  const warnings: string[] = [];
  for (const d of EVIDENCE_DIMENSIONS) {
    const dim = dims[d];
    if (dim.suppressed) warnings.push(`${d}: values are present but their provenance is NOT_FOUND, so they are not counted as evidence.`);
    if (states[d] === "AVAILABLE_OTHER") {
      const others = [...new Set(dim.provenances.filter((p) => !AUTHORITATIVE.includes(p)))].sort();
      warnings.push(`${d}: evidence rests on ${others.join(", ")} provenance, not a direct source statement or manual entry.`);
    }
    if (dim.copyBlocked) warnings.push(`${d}: every statement is marked not eligible for copy.`);
  }
  if (facts.importWarnings.length > 0) {
    warnings.push(`Import reported ${facts.importWarnings.length} warning${facts.importWarnings.length === 1 ? "" : "s"}.`);
  }
  if (available.length === 0) warnings.push("No evidence dimension is available.");

  // Completeness: compared by section status only. Its score is not read.
  if (inputs.completeness) {
    const byId = new Map(inputs.completeness.sections.map((s) => [s.id, s.status]));
    for (const d of EVIDENCE_DIMENSIONS) {
      const section = COMPLETENESS_SECTION[d];
      const status = section ? byId.get(section) : undefined;
      if (!section || status === undefined || dims[d].suppressed) continue;
      if (states[d] === "MISSING" && status !== "MISSING") {
        warnings.push(`${d}: completeness reports ${status} but ProductFacts holds no evidence.`);
      } else if (states[d] !== "MISSING" && status === "MISSING") {
        warnings.push(`${d}: completeness reports MISSING but ProductFacts holds evidence.`);
      }
    }
  }

  // Presentation plan: a shown section needs evidence. A hidden one is a copy-eligibility choice.
  if (inputs.presentationPlan) {
    for (const d of EVIDENCE_DIMENSIONS) {
      const shown = (PLAN_SECTIONS_FOR[d] ?? []).filter((s) => inputs.presentationPlan!.sectionVisibility[s]);
      if (shown.length > 0 && states[d] === "MISSING") {
        warnings.push(`${d}: the presentation plan shows ${shown.join(" and ")} but ProductFacts holds no evidence.`);
      }
    }
  }

  // Boundary classification: a product section on the source page that yielded nothing is a gap.
  let boundaryCorroborated = 0;
  if (inputs.boundary) {
    const seen = new Set<EvidenceDimension>();
    for (const section of inputs.boundary as readonly ContentSection[]) {
      const d = BOUNDARY_DIMENSION[section.classification];
      if (d && section.confidence !== "LOW") seen.add(d);
    }
    for (const d of EVIDENCE_DIMENSIONS) {
      if (!seen.has(d)) continue;
      if (states[d] === "MISSING") warnings.push(`${d}: the source page shows a matching section, but no evidence was extracted.`);
      else boundaryCorroborated += 1;
    }
  }

  const research = inputs.research ?? null;
  if (research) {
    if (research.status === "UNAVAILABLE") warnings.push("Research is unavailable.");
    if (research.status === "STALE") warnings.push("Research is stale.");
    const a = normalizeName(research.productName);
    const b = normalizeName(facts.productName);
    if (a && b && a !== b) warnings.push("Research was run for a different product name than ProductFacts.");
  }

  const metadata: OpportunityMetadata = {
    availableDimensions: available.join(","),
    missingDimensions: missing.join(","),
    availableCount: available.length,
    missingCount: missing.length,
    authoritativeCount,
    sourceCount: dims.EVIDENCE_SOURCES.count,
    importWarningCount: facts.importWarnings.length,
    completenessSupplied: Boolean(inputs.completeness),
    presentationPlanSupplied: Boolean(inputs.presentationPlan),
    boundarySupplied: Boolean(inputs.boundary),
    boundaryCorroborated,
    researchSupplied: research !== null,
    researchStatus: research?.status ?? null,
    researchQuality: research?.quality ?? null,
    researchUsableSources: research?.diversity.USABLE_SOURCES ?? null,
    provenanceNote: "DIRECT_SOURCE means the source stated it; it is not independently verified.",
  };
  for (const d of EVIDENCE_DIMENSIONS) {
    metadata[`dimension.${d}`] = states[d];
    metadata[`count.${d}`] = dims[d].count;
  }
  for (const [key, value] of Object.entries(inputs.metadata ?? {})) metadata[`input.${key}`] = value;

  return {
    status: "COMPLETED",
    confidence,
    availableDimensions: available,
    missingDimensions: missing,
    warnings,
    metadata,
    executionTime: Math.max(0, now() - start),
  };
}
