/**
 * Composition fact firewall: consumer-visible factual copy may only come from
 * validated generation (variant headline/body/CTA) plus authorized identity.
 * Raw ProductFacts must not be used as a factual fallback after Claim Projection.
 */

const STRUCTURAL_UI_LABELS = new Set([
  "review",
  "buying guide",
  "buyer guide",
  "editorial",
  "quick summary",
  "overview",
  "key features",
  "features",
  "faq",
  "frequently asked questions",
  "how to use",
  "ingredients / components",
  "ingredients",
  "components",
  "guarantee",
  "things to consider",
  "pros",
  "cons",
  "pros and cons",
  "final thoughts",
  "what is this product?",
  "what is this product",
  "learn more",
  "view product details",
  "check current price",
  "check current details",
  "visit official website",
  "affiliate disclosure",
  "advertisement",
  "hero",
  "pricing",
  "manufacturer",
]);

export const COMPOSITION_FACT_FIREWALL = "COMPOSITION_FACT_FIREWALL" as const;

export function stripStructuralMarkup(text: string): string {
  return text
    .replace(/^#+\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNonFactualUiCopy(text: string): boolean {
  const stripped = stripStructuralMarkup(text);
  if (!stripped) return true;
  const lower = stripped.toLowerCase().replace(/[:.]+$/, "").trim();
  if (STRUCTURAL_UI_LABELS.has(lower)) return true;
  const faqPrefix = lower.match(/^faq\s*[-:]\s*(.*)$/);
  if (faqPrefix && (!faqPrefix[1] || STRUCTURAL_UI_LABELS.has(faqPrefix[1]))) return true;
  if (/^affiliate disclosure\b/.test(lower)) return true;
  return false;
}

function normalizeFactual(text: string): string {
  return text
    .toLowerCase()
    .replace(/[…]+/g, " ")
    .replace(/^#+\s*/g, "")
    .replace(/^faq\s*[-:]\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitFactualUnits(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((item) => item.trim())
    .filter(Boolean);
}

function isSensitiveFactualUnit(text: string): boolean {
  return (
    /\d/.test(text) ||
    /\b(day|days|daily|morning|evening|capsule|capsules|dose|dosage|price|guarantee|refund|manufactur|ingredient|mg|mcg)\b/i.test(
      text,
    )
  );
}

export function composerAddedFactualCopy(authorizedCopy: string, composedVisible: string): string[] {
  const authorized = normalizeFactual(authorizedCopy);
  const added: string[] = [];
  for (const unit of splitFactualUnits(composedVisible)) {
    if (isNonFactualUiCopy(unit)) continue;
    const normalized = normalizeFactual(unit);
    if (!normalized) continue;
    if (normalized.length < 12 && !isSensitiveFactualUnit(unit)) continue;
    if (!authorized.includes(normalized)) added.push(unit.trim());
  }
  return added;
}

/** Adapter markdown vs hydrated declared copy. Structural UI headings are not factual delta. */
export function adapterAddedFactualCopy(declaredCopy: string, adaptedCopy: string): string[] {
  return composerAddedFactualCopy(declaredCopy, adaptedCopy);
}

export function compositionFactFirewall(input: {
  authorizedCopy: string;
  composedVisible: string;
}): { status: "PASS" | "FAIL"; addedFactualCopy: string[]; code: typeof COMPOSITION_FACT_FIREWALL } {
  const addedFactualCopy = composerAddedFactualCopy(input.authorizedCopy, input.composedVisible);
  return {
    status: addedFactualCopy.length === 0 ? "PASS" : "FAIL",
    addedFactualCopy,
    code: COMPOSITION_FACT_FIREWALL,
  };
}

export function authorizedVariantCopy(variant: { headline: string; body: string; ctaLabel: string }, productName?: string): string {
  return [productName || "", variant.headline, variant.body, variant.ctaLabel].join("\n");
}

/** Composition-safe factual input: already-authorized generated copy only. */
export type CompositionFacts = {
  authorizedCopy: string;
  productName: string;
  provenance: "VALIDATED_GENERATED_COPY";
};

export function compositionFactsFromVariant(
  variant: { headline: string; body: string; ctaLabel: string },
  productName?: string,
): CompositionFacts {
  return {
    authorizedCopy: authorizedVariantCopy(variant, productName),
    productName: productName || "",
    provenance: "VALIDATED_GENERATED_COPY",
  };
}

export function compositionTraceComplete(input: {
  authorizedCopy: string;
  composedVisible: string;
}): { complete: boolean; rawProductFactFallbackBlocks: string[] } {
  const added = composerAddedFactualCopy(input.authorizedCopy, input.composedVisible);
  return {
    complete: added.length === 0,
    rawProductFactFallbackBlocks: added,
  };
}
