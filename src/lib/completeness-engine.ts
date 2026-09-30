import type { ProductFacts } from "@/lib/product-facts";

/**
 * Read-only completeness of supplied ProductFacts.
 * It does not invent facts, write storage, or block landing-page generation.
 */

export type SectionStatus = "COMPLETE" | "PARTIAL" | "MISSING";

export type CompletenessSectionId =
  | "identity"
  | "description"
  | "hero"
  | "ingredients"
  | "features"
  | "usage"
  | "warnings"
  | "guarantee"
  | "pricing"
  | "returns"
  | "shipping"
  | "manufacturer"
  | "faq"
  | "images"
  | "visualAssets";

export type TargetExpectation = "Required" | "Recommended" | "Optional" | "count";

export type CompletenessTarget = {
  minimum: number;
  recommended: number;
  expectation: TargetExpectation;
};

export type CompletenessConfig = {
  weights: Record<CompletenessSectionId, number>;
  targets: Record<CompletenessSectionId, CompletenessTarget>;
  bands: { green: number; yellow: number };
  generationWarningBelow: number;
};

export type SectionQuality = "GOOD" | "WEAK" | "MISSING";
export type SectionPresence = "AUTO" | "MANUAL" | "MIXED" | "EMPTY";

export type CompletenessSection = {
  id: CompletenessSectionId;
  label: string;
  status: SectionStatus;
  quality: SectionQuality;
  presence: SectionPresence;
  found: number;
  recommended: number;
  targetLabel: string;
  reason: string;
  editorHash: string;
  expectation: TargetExpectation;
};

export type CompletenessRecommendation = {
  sectionId: CompletenessSectionId;
  text: string;
  action: string;
  editorHash: string;
};

export type ImportCompletenessReport = {
  score: number;
  tone: "green" | "yellow" | "red";
  estimatedQuality: string;
  generationWarning: string | null;
  sections: CompletenessSection[];
  missingSections: CompletenessSection[];
  weakSections: CompletenessSection[];
  recommendations: CompletenessRecommendation[];
  priorityActions: CompletenessRecommendation[];
  completed: CompletenessSection[];
  remaining: CompletenessSection[];
  blocksGeneration: false;
};

export type CompletenessAnalysisInput = {
  facts: ProductFacts;
  headline?: string | null;
  imageUrl?: string | null;
  imageProvenance?: string | null;
  visualAssetCount?: number;
  shippingText?: string | null;
  returnsText?: string | null;
  presence?: Partial<Record<CompletenessSectionId, SectionPresence>>;
  config?: CompletenessConfig;
};

const SECTION_ORDER: CompletenessSectionId[] = [
  "identity",
  "description",
  "hero",
  "ingredients",
  "features",
  "usage",
  "warnings",
  "guarantee",
  "pricing",
  "returns",
  "shipping",
  "manufacturer",
  "faq",
  "images",
  "visualAssets",
];

const LABELS: Record<CompletenessSectionId, string> = {
  identity: "Product Identity",
  description: "Description",
  hero: "Hero",
  ingredients: "Ingredients",
  features: "Features",
  usage: "Usage",
  warnings: "Warnings",
  guarantee: "Guarantee",
  pricing: "Pricing",
  returns: "Returns",
  shipping: "Shipping",
  manufacturer: "Manufacturer",
  faq: "FAQ",
  images: "Images",
  visualAssets: "Visual Assets",
};

const EDITOR_HASH: Record<CompletenessSectionId, string> = {
  identity: "identity",
  description: "description",
  hero: "presentation.headline",
  ingredients: "ingredients",
  features: "features",
  usage: "usage",
  warnings: "warnings",
  guarantee: "guarantee",
  pricing: "pricing",
  returns: "presentation.returns",
  shipping: "presentation.shipping",
  manufacturer: "manufacturer",
  faq: "faq",
  images: "presentation.images",
  visualAssets: "presentation.images",
};

function target(minimum: number, recommended: number, expectation: TargetExpectation): CompletenessTarget {
  return { minimum, recommended, expectation };
}

export const DEFAULT_COMPLETENESS_CONFIG: CompletenessConfig = {
  weights: {
    identity: 15,
    description: 10,
    hero: 10,
    ingredients: 15,
    features: 15,
    usage: 0,
    warnings: 0,
    guarantee: 5,
    pricing: 10,
    returns: 0,
    shipping: 0,
    manufacturer: 0,
    faq: 10,
    images: 10,
    visualAssets: 0,
  },
  targets: {
    identity: target(1, 1, "Required"),
    description: target(40, 80, "Recommended"),
    hero: target(12, 40, "Recommended"),
    ingredients: target(1, 8, "count"),
    features: target(1, 4, "count"),
    usage: target(1, 2, "Recommended"),
    warnings: target(1, 1, "Optional"),
    guarantee: target(1, 1, "Recommended"),
    pricing: target(1, 1, "Recommended"),
    returns: target(1, 1, "Recommended"),
    shipping: target(1, 1, "Recommended"),
    manufacturer: target(1, 1, "Recommended"),
    faq: target(1, 4, "count"),
    images: target(1, 1, "count"),
    visualAssets: target(1, 1, "Recommended"),
  },
  bands: { green: 80, yellow: 50 },
  generationWarningBelow: 80,
};

export function analyzeImportCompleteness(input: CompletenessAnalysisInput): ImportCompletenessReport {
  const config = input.config ?? DEFAULT_COMPLETENESS_CONFIG;
  const counts = countSections(input);
  const sections = SECTION_ORDER.map((id) => {
    const goal = config.targets[id];
    const found = counts[id];
    const status = statusFor(found, goal);
    const quality = qualityFor(status);
    const label = targetLabel(goal);
    return {
      id,
      label: LABELS[id],
      status,
      quality,
      presence: input.presence?.[id] ?? (found > 0 ? "AUTO" : "EMPTY"),
      found,
      recommended: goal.recommended,
      targetLabel: label,
      reason: `Found=${found}. Recommended=${label}.`,
      editorHash: EDITOR_HASH[id],
      expectation: goal.expectation,
    };
  });
  const weightTotal = SECTION_ORDER.reduce((sum, id) => sum + Math.max(0, config.weights[id]), 0);
  const weighted = sections.reduce((sum, section) => {
    const weight = Math.max(0, config.weights[section.id]);
    if (weight === 0 || section.recommended <= 0) return sum;
    return sum + weight * Math.min(1, section.found / section.recommended);
  }, 0);
  const score = weightTotal === 0 ? 0 : Math.round((weighted / weightTotal) * 100);
  const recommendations = sections.filter((section) => section.quality !== "GOOD").map((section) => ({
    sectionId: section.id,
    text: recommendationText(section),
    action: actionLabel(section.id),
    editorHash: section.editorHash,
  }));
  const priorityActions = recommendations
    .filter((item) => sections.find((candidate) => candidate.id === item.sectionId)?.expectation !== "Optional")
    .sort((left, right) => config.weights[right.sectionId] - config.weights[left.sectionId]);
  const bounded = clampScore(score);
  return {
    score: bounded,
    tone: toneFor(bounded, config),
    estimatedQuality: bounded >= config.bands.green ? "High" : bounded >= config.bands.yellow ? "Limited" : "Low",
    generationWarning:
      bounded < config.generationWarningBelow
        ? "This landing page can still be generated, but quality is expected to be limited because important sections are incomplete."
        : null,
    sections,
    missingSections: sections.filter((section) => section.quality === "MISSING"),
    weakSections: sections.filter((section) => section.quality === "WEAK"),
    recommendations,
    priorityActions,
    completed: sections.filter((section) => section.quality === "GOOD"),
    remaining: sections.filter((section) => section.quality !== "GOOD"),
    blocksGeneration: false,
  };
}

function countSections(input: CompletenessAnalysisInput): Record<CompletenessSectionId, number> {
  const facts = input.facts;
  const description = clean(facts.description);
  const headline = clean(input.headline);
  const imageUrl = clean(input.imageUrl) || clean(facts.productImageUrl);
  const provenance = (input.imageProvenance || facts.productImageProvenance || "").trim();
  const imageReady = Boolean(imageUrl) && isHttpUrl(imageUrl) && provenance !== "PLACEHOLDER" && provenance !== "NOT_FOUND";
  return {
    identity: clean(facts.productName) ? 1 : 0,
    description: description.length,
    hero: headline.length,
    ingredients: filled(facts.ingredientsOrComponents),
    features: filled(facts.features),
    usage: filled(facts.usageInformation),
    warnings: filled(facts.cautions),
    guarantee: clean(facts.guaranteeInformation) ? 1 : 0,
    pricing: pricingCount(facts),
    returns: operationalCount(facts.returnsInformation) + (clean(input.returnsText) ? 1 : 0),
    shipping: operationalCount(facts.shippingInformation) + (clean(input.shippingText) ? 1 : 0),
    manufacturer: clean(facts.manufacturer) ? 1 : 0,
    faq: faqCount(facts),
    images: imageReady ? 1 : 0,
    visualAssets: Math.max(0, Math.floor(input.visualAssetCount ?? 0)),
  };
}

function statusFor(found: number, goal: CompletenessTarget): SectionStatus {
  if (found <= 0) return "MISSING";
  if (found >= goal.recommended) return "COMPLETE";
  return "PARTIAL";
}

function qualityFor(status: SectionStatus): SectionQuality {
  if (status === "COMPLETE") return "GOOD";
  if (status === "PARTIAL") return "WEAK";
  return "MISSING";
}

function targetLabel(goal: CompletenessTarget): string {
  if (goal.expectation === "count") return `${goal.recommended}+`;
  return goal.expectation;
}

function actionLabel(id: CompletenessSectionId): string {
  if (id === "pricing") return "Open Pricing Editor";
  if (id === "features") return "Open Features section";
  if (id === "faq") return "Open FAQ section";
  if (id === "images" || id === "visualAssets") return "Open Images section";
  if (id === "manufacturer") return "Open Manufacturer section";
  if (id === "ingredients") return "Open Ingredients section";
  if (id === "description") return "Open Description section";
  if (id === "identity") return "Open Identity section";
  if (id === "hero") return "Open Hero section";
  if (id === "usage") return "Open Usage section";
  if (id === "warnings") return "Open Warnings section";
  if (id === "guarantee") return "Open Guarantee section";
  if (id === "returns") return "Open Returns section";
  if (id === "shipping") return "Open Shipping section";
  return "Open section";
}

function recommendationText(section: CompletenessSection): string {
  const gap = Math.max(1, section.recommended - section.found);
  if (section.id === "features") return `Add ${gap} ${gap === 1 ? "Feature" : "Features"}`;
  if (section.id === "faq") return `Add ${gap} FAQ ${gap === 1 ? "entry" : "entries"}`;
  if (section.id === "ingredients") return `Add ${gap} ${gap === 1 ? "Ingredient" : "Ingredients"}`;
  if (section.id === "usage") return `Add ${gap} Usage ${gap === 1 ? "step" : "steps"}`;
  if (section.id === "warnings") return gap === 1 && section.found === 0 ? "Add Warnings" : `Add ${gap} Warnings`;
  if (section.id === "visualAssets") return gap === 1 && section.found === 0 ? "Add Visual Assets" : `Add ${gap} Visual Assets`;
  if (section.id === "images") return "Add Images";
  return `Add ${section.label}`;
}

function toneFor(score: number, config: CompletenessConfig): "green" | "yellow" | "red" {
  if (score >= config.bands.green) return "green";
  if (score >= config.bands.yellow) return "yellow";
  return "red";
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function filled(items: string[] | undefined): number {
  return (items ?? []).map((item) => clean(item)).filter((item) => item.length > 0 && item.toUpperCase() !== "NOT_FOUND").length;
}

function pricingCount(facts: ProductFacts): number {
  if (clean(facts.pricingInformation)) return 1;
  return (facts.offerFacts ?? []).some((offer) => clean(offer.unitPrice) || clean(offer.totalPrice)) ? 1 : 0;
}

function operationalCount(items: Array<{ statement?: string }> | undefined): number {
  return (items ?? []).map((item) => clean(item.statement)).filter(Boolean).length;
}

function faqCount(facts: ProductFacts): number {
  const seen = new Set<string>();
  for (const snippet of facts.sourceSnippets ?? []) {
    if (snippet.field !== "faq") continue;
    const question = clean(snippet.question);
    const answer = clean(snippet.text);
    if (!question && !answer) continue;
    seen.add(`${question}\n${answer}`);
  }
  return seen.size;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function projectCompletenessDraft(facts: ProductFacts, field: string, raw: string): ProductFacts {
  const next: ProductFacts = {
    ...facts,
    features: [...(facts.features ?? [])],
    ingredientsOrComponents: [...(facts.ingredientsOrComponents ?? [])],
    usageInformation: [...(facts.usageInformation ?? [])],
    cautions: [...(facts.cautions ?? [])],
    sourceSnippets: [...(facts.sourceSnippets ?? [])],
    offerFacts: facts.offerFacts ? facts.offerFacts.map((offer) => ({ ...offer })) : undefined,
    returnsInformation: facts.returnsInformation ? [...facts.returnsInformation] : undefined,
    shippingInformation: facts.shippingInformation ? [...facts.shippingInformation] : undefined,
    confidence: { ...facts.confidence },
  };
  if (field === "productName") next.productName = raw.trim();
  else if (field === "description") next.description = raw.trim();
  else if (field === "manufacturer") next.manufacturer = raw.trim();
  else if (field === "features") next.features = listValues(raw);
  else if (field === "ingredients") next.ingredientsOrComponents = listValues(raw);
  else if (field === "warnings") next.cautions = listValues(raw);
  else if (field === "usage") next.usageInformation = usageValues(raw);
  else if (field === "guarantee") next.guaranteeInformation = guaranteeValue(raw);
  else if (field === "pricing") next.pricingInformation = pricingValue(raw);
  else if (field === "faq") {
    const rest = next.sourceSnippets.filter((snippet) => snippet.field !== "faq");
    next.sourceSnippets = [
      ...rest,
      ...faqValues(raw).map((item) => ({
        field: "faq",
        question: item.question,
        text: item.answer,
        sourceUrl: facts.sourceUrl,
        confidence: "MANUAL" as const,
      })),
    ];
  }
  return next;
}

function listValues(raw: string): string[] {
  const parsed = parseJson(raw);
  if (Array.isArray(parsed)) return parsed.map((item) => clean(String(item))).filter(Boolean);
  return raw.split(/\r?\n/).map((item) => clean(item)).filter(Boolean);
}

function usageValues(raw: string): string[] {
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "instruction" in parsed) {
    return [clean(String((parsed as { instruction?: string }).instruction))].filter(Boolean);
  }
  return listValues(raw);
}

function guaranteeValue(raw: string): string {
  const parsed = parseJson(raw);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && "text" in parsed) {
    return clean(String((parsed as { text?: string }).text));
  }
  return clean(raw);
}

function pricingValue(raw: string): string {
  const parsed = parseJson(raw);
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const row = item as { unitPrice?: string; totalPrice?: string };
      const price = clean(row.unitPrice) || clean(row.totalPrice);
      if (price) return price;
    }
    return "";
  }
  return clean(raw);
}

function faqValues(raw: string): Array<{ question: string; answer: string }> {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as { question?: string; answer?: string };
      return { question: clean(row.question), answer: clean(row.answer) };
    })
    .filter((item): item is { question: string; answer: string } => Boolean(item && (item.question || item.answer)));
}

function parseJson(raw: string): unknown {
  const text = raw.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
