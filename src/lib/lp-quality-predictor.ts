import type { ImportCompletenessReport, CompletenessSection, CompletenessSectionId } from "@/lib/completeness-engine";
import { planPresentation, type PresentationPlan } from "@/lib/presentation-plan";
import { analyzeProductProfile } from "@/lib/product-profile";
import type { ProductFacts } from "@/lib/product-facts";

/**
 * Deterministic landing-page quality estimate.
 * It reads a completeness report and the presentation plan.
 * It does not invent facts, write storage, call a model, or block generation.
 */

export const LP_QUALITY_LABELS = ["Excellent", "Good", "Fair", "Limited", "Poor"] as const;
export type LpQualityLabel = (typeof LP_QUALITY_LABELS)[number];

export const DENSITY_LABELS = ["High", "Medium", "Low"] as const;
export type DensityLabel = (typeof DENSITY_LABELS)[number];

export const READINESS_LABELS = ["Ready", "Partial", "Thin"] as const;
export type ReadinessLabel = (typeof READINESS_LABELS)[number];

export type QualityFactorId =
  | "hero"
  | "description"
  | "features"
  | "ingredients"
  | "faq"
  | "pricing"
  | "guarantee"
  | "warnings"
  | "images"
  | "manualOverrides"
  | "completenessScore"
  | "presentationRichness";

export type LpQualityConfig = {
  weights: Record<QualityFactorId, number>;
  bands: { excellent: number; good: number; fair: number; limited: number };
  densityBands: { high: number; medium: number };
  readinessBands: { ready: number; partial: number };
  visualWeights: { images: number; visualAssets: number; plan: number };
  informationWeights: { description: number; features: number; ingredients: number; faq: number };
  conversionWeights: { pricing: number; guarantee: number; hero: number; images: number; bonus: number };
  croWeights: { features: number; faq: number; pricing: number; guarantee: number; warnings: number; bonus: number };
  confidence: { agreement: number; coverage: number };
  manualNeutral: number;
  densityScores: { LOW: number; MEDIUM: number; HIGH: number; PREMIUM: number };
  spacingScores: { COMPACT: number; NORMAL: number; AIRY: number };
  maxActions: number;
  actions: Record<string, string>;
};

export type LpQualityReason = { text: string; tone: "support" | "gap" };

export type LpQualityAction = { text: string; editorHash: string };

export type LpQualityPrediction = {
  quality: LpQualityLabel;
  tone: "green" | "yellow" | "red";
  score: number;
  confidence: number;
  visualDensity: DensityLabel;
  informationDensity: DensityLabel;
  conversionReadiness: ReadinessLabel;
  croReadiness: ReadinessLabel;
  reasons: LpQualityReason[];
  actions: LpQualityAction[];
  blocksGeneration: false;
};

export type LpQualityInput = {
  facts: ProductFacts;
  report: ImportCompletenessReport;
  bonusText?: string | null;
  config?: LpQualityConfig;
};

const FACTOR_SECTION: Partial<Record<QualityFactorId, CompletenessSectionId>> = {
  hero: "hero",
  description: "description",
  features: "features",
  ingredients: "ingredients",
  faq: "faq",
  pricing: "pricing",
  guarantee: "guarantee",
  warnings: "warnings",
  images: "images",
};

export const DEFAULT_LP_QUALITY_CONFIG: LpQualityConfig = {
  weights: {
    hero: 8,
    description: 8,
    features: 12,
    ingredients: 10,
    faq: 10,
    pricing: 12,
    guarantee: 8,
    warnings: 3,
    images: 8,
    manualOverrides: 5,
    completenessScore: 10,
    presentationRichness: 6,
  },
  bands: { excellent: 88, good: 72, fair: 56, limited: 38 },
  densityBands: { high: 67, medium: 34 },
  readinessBands: { ready: 70, partial: 40 },
  visualWeights: { images: 50, visualAssets: 20, plan: 30 },
  informationWeights: { description: 25, features: 25, ingredients: 25, faq: 25 },
  conversionWeights: { pricing: 30, guarantee: 20, hero: 20, images: 20, bonus: 10 },
  croWeights: { features: 20, faq: 25, pricing: 20, guarantee: 15, warnings: 10, bonus: 10 },
  confidence: { agreement: 60, coverage: 40 },
  manualNeutral: 0.5,
  densityScores: { LOW: 0.25, MEDIUM: 0.5, HIGH: 0.75, PREMIUM: 1 },
  spacingScores: { COMPACT: 0.35, NORMAL: 0.6, AIRY: 1 },
  maxActions: 3,
  actions: {
    hero: "Add Hero",
    description: "Add Description",
    features: "Add Features",
    ingredients: "Add Ingredients",
    faq: "Add FAQ",
    pricing: "Add Pricing",
    guarantee: "Add Guarantee",
    warnings: "Add Warnings",
    images: "Add Images",
  },
};

export function predictLpQuality(input: LpQualityInput): LpQualityPrediction {
  const config = input.config ?? DEFAULT_LP_QUALITY_CONFIG;
  const plan = planPresentation(input.facts, analyzeProductProfile(input.facts));
  const bonus = hasBonus(input.facts, input.bonusText);
  const strengths = factorStrengths(input.report, plan, bonus, config);
  const score = weighted(strengths, config.weights);
  const quality = labelFor(score, config);
  const visual = visualScore(input.report, plan, config);
  const information = informationScore(input.report, config);
  const conversion = readinessScore(
    {
      pricing: ratio(section(input.report, "pricing")),
      guarantee: ratio(section(input.report, "guarantee")),
      hero: ratio(section(input.report, "hero")),
      images: ratio(section(input.report, "images")),
      bonus: bonus ? 1 : 0,
    },
    config.conversionWeights,
  );
  const cro = readinessScore(
    {
      features: ratio(section(input.report, "features")),
      faq: ratio(section(input.report, "faq")),
      pricing: ratio(section(input.report, "pricing")),
      guarantee: ratio(section(input.report, "guarantee")),
      warnings: ratio(section(input.report, "warnings")),
      bonus: bonus ? 1 : 0,
    },
    config.croWeights,
  );
  return {
    quality,
    tone: toneFor(quality),
    score,
    confidence: confidenceFor(input.report, score, config),
    visualDensity: densityLabel(visual, config),
    informationDensity: densityLabel(information, config),
    conversionReadiness: readinessLabel(conversion, config),
    croReadiness: readinessLabel(cro, config),
    reasons: reasonsFor(input.report, bonus),
    actions: actionsFor(input.report, config),
    blocksGeneration: false,
  };
}

function factorStrengths(
  report: ImportCompletenessReport,
  plan: PresentationPlan,
  bonus: boolean,
  config: LpQualityConfig,
): Record<QualityFactorId, number> {
  return {
    hero: ratio(section(report, "hero")),
    description: ratio(section(report, "description")),
    features: ratio(section(report, "features")),
    ingredients: ratio(section(report, "ingredients")),
    faq: ratio(section(report, "faq")),
    pricing: ratio(section(report, "pricing")),
    guarantee: ratio(section(report, "guarantee")),
    warnings: ratio(section(report, "warnings")),
    images: ratio(section(report, "images")),
    manualOverrides: manualStrength(report, config),
    completenessScore: clamp01(report.score / 100),
    presentationRichness: richness(plan, bonus, config),
  };
}

function section(report: ImportCompletenessReport, id: CompletenessSectionId): CompletenessSection | undefined {
  return report.sections.find((item) => item.id === id);
}

function ratio(item: CompletenessSection | undefined): number {
  if (!item || item.recommended <= 0) return 0;
  return clamp01(item.found / item.recommended);
}

function manualStrength(report: ImportCompletenessReport, config: LpQualityConfig): number {
  const reviewed = report.sections.some(
    (item) => (item.presence === "MANUAL" || item.presence === "MIXED") && item.found > 0,
  );
  return reviewed ? 1 : config.manualNeutral;
}

function richness(plan: PresentationPlan, bonus: boolean, config: LpQualityConfig): number {
  const visible = plan.sectionOrder.length / 12;
  const variants = [plan.sectionVariants.ingredients, plan.sectionVariants.features, plan.sectionVariants.pricing].filter(
    (variant) => variant !== "NONE",
  ).length / 3;
  const emphasis = plan.emphasisProfile.length / 4;
  const density = config.densityScores[plan.density];
  const spacing = config.spacingScores[plan.spacingProfile];
  const bonusScore = bonus ? 1 : 0;
  return clamp01((visible + variants + emphasis + density + spacing + bonusScore) / 6);
}

function visualScore(report: ImportCompletenessReport, plan: PresentationPlan, config: LpQualityConfig): number {
  const planVisual = clamp01(
    (variantScore(plan.sectionVariants.features) + variantScore(plan.sectionVariants.ingredients) + config.spacingScores[plan.spacingProfile]) / 3,
  );
  return weighted(
    {
      images: ratio(section(report, "images")),
      visualAssets: ratio(section(report, "visualAssets")),
      plan: planVisual,
    },
    config.visualWeights,
  );
}

function variantScore(variant: string): number {
  if (variant === "DENSE" || variant === "MOSAIC" || variant === "GRID") return 1;
  if (variant === "CARDS" || variant === "EDITORIAL" || variant === "COMPARISON") return 0.7;
  if (variant === "HIGHLIGHT" || variant === "COMPACT" || variant === "LIST" || variant === "SINGLE") return 0.4;
  return 0;
}

function informationScore(report: ImportCompletenessReport, config: LpQualityConfig): number {
  return weighted(
    {
      description: ratio(section(report, "description")),
      features: ratio(section(report, "features")),
      ingredients: ratio(section(report, "ingredients")),
      faq: ratio(section(report, "faq")),
    },
    config.informationWeights,
  );
}

function readinessScore<T extends string>(parts: Record<T, number>, weights: Record<T, number>): number {
  return weighted(parts, weights);
}

function weighted<T extends string>(parts: Record<T, number>, weights: Record<T, number>): number {
  let total = 0;
  let used = 0;
  for (const key of Object.keys(weights) as T[]) {
    const weight = Math.max(0, weights[key]);
    total += weight;
    used += weight * clamp01(parts[key] ?? 0);
  }
  if (total === 0) return 0;
  return clampScore(Math.round((used / total) * 100));
}

function labelFor(score: number, config: LpQualityConfig): LpQualityLabel {
  if (score >= config.bands.excellent) return "Excellent";
  if (score >= config.bands.good) return "Good";
  if (score >= config.bands.fair) return "Fair";
  if (score >= config.bands.limited) return "Limited";
  return "Poor";
}

function densityLabel(score: number, config: LpQualityConfig): DensityLabel {
  if (score >= config.densityBands.high) return "High";
  if (score >= config.densityBands.medium) return "Medium";
  return "Low";
}

function readinessLabel(score: number, config: LpQualityConfig): ReadinessLabel {
  if (score >= config.readinessBands.ready) return "Ready";
  if (score >= config.readinessBands.partial) return "Partial";
  return "Thin";
}

function toneFor(quality: LpQualityLabel): "green" | "yellow" | "red" {
  if (quality === "Excellent" || quality === "Good") return "green";
  if (quality === "Fair" || quality === "Limited") return "yellow";
  return "red";
}

function confidenceFor(report: ImportCompletenessReport, score: number, config: LpQualityConfig): number {
  const measured = Object.values(FACTOR_SECTION);
  const definite = measured.filter((id) => {
    const item = section(report, id);
    return item?.quality === "GOOD" || item?.quality === "MISSING";
  }).length;
  const agreement = 1 - Math.abs(report.score - score) / 100;
  const coverage = measured.length === 0 ? 0 : definite / measured.length;
  return clampScore(Math.round(agreement * config.confidence.agreement + coverage * config.confidence.coverage));
}

function reasonsFor(report: ImportCompletenessReport, bonus: boolean): LpQualityReason[] {
  const reasons: LpQualityReason[] = [];
  const pricing = section(report, "pricing");
  const features = section(report, "features");
  const faq = section(report, "faq");
  const ingredients = section(report, "ingredients");
  const guarantee = section(report, "guarantee");
  if (pricing?.quality === "MISSING") reasons.push({ text: "Pricing missing", tone: "gap" });
  if (features && features.quality === "WEAK" && features.found > 0) {
    const noun = features.found === 1 ? "Feature" : "Features";
    reasons.push({ text: `Only ${features.found} ${noun}`, tone: "gap" });
  }
  if (faq && faq.quality !== "GOOD") reasons.push({ text: "Low FAQ coverage", tone: "gap" });
  if (!bonus) reasons.push({ text: "No Bonus", tone: "gap" });
  if (ingredients && ingredients.quality !== "GOOD") reasons.push({ text: "Few Ingredients", tone: "gap" });
  if (pricing?.quality === "GOOD") reasons.push({ text: "Complete Pricing", tone: "support" });
  if (features?.quality === "GOOD") reasons.push({ text: "Strong Features", tone: "support" });
  if (faq?.quality === "GOOD") reasons.push({ text: "Complete FAQ", tone: "support" });
  if (guarantee?.quality === "GOOD") reasons.push({ text: "Complete Guarantee", tone: "support" });
  return reasons;
}

function actionsFor(report: ImportCompletenessReport, config: LpQualityConfig): LpQualityAction[] {
  return (Object.keys(FACTOR_SECTION) as QualityFactorId[])
    .filter((id) => {
      const item = section(report, FACTOR_SECTION[id] as CompletenessSectionId);
      return item && item.quality !== "GOOD" && item.expectation !== "Optional";
    })
    .sort((left, right) => config.weights[right] - config.weights[left])
    .slice(0, config.maxActions)
    .map((id) => {
      const item = section(report, FACTOR_SECTION[id] as CompletenessSectionId);
      return { text: config.actions[id] ?? `Add ${item?.label ?? "section"}`, editorHash: item?.editorHash ?? id };
    });
}

function hasBonus(facts: ProductFacts, bonusText: string | null | undefined): boolean {
  if (clean(bonusText)) return true;
  return (facts.offerFacts ?? []).some((offer) => clean(offer.bonuses));
}

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, score));
}
