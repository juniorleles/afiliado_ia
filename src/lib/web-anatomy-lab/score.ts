/**
 * Isolated Web Anatomy Lab V1 scoring.
 * Production Patch02 heuristic stays frozen; this overlay only rewards
 * measured visual/structural presentation. Copywriting floor is unchanged.
 */

export type HeuristicAnatomy = {
  words: number;
  h1: string;
  hasCta: boolean;
  hasOverview: boolean;
  hasDisclosure: boolean;
};

export type HeuristicScore = {
  TOTAL: number;
  HERO: number;
  VALUE_PROPOSITION: number;
  COPYWRITING: number;
  TRUST: number;
  CONVERSION: number;
  DESIGN: number;
  WORDS: number;
};

export type VisualPresentationMetrics = {
  summaryFontPx: number;
  summaryUsesPrimaryText: boolean;
  heroCtaHeight: number;
  finalCtaHeight: number;
  featureSurfaceOpaque: boolean;
  faqSurfaceOpaque: boolean;
  footerPadTop: number;
  featureGridColumns: number;
  overviewInFold?: boolean;
  closingSurfaceOpaque?: boolean;
  productCtaGapPx?: number;
  productCtaYOverlap?: boolean;
};

export function scoreHeuristic(anatomy: HeuristicAnatomy): HeuristicScore {
  const hero = anatomy.h1 && anatomy.hasCta ? 72 : 45;
  const value = anatomy.hasOverview ? 50 : 40;
  const copy = anatomy.words >= 400 ? 70 : anatomy.words >= 220 ? 55 : 35;
  const trust = anatomy.hasDisclosure ? 62 : 35;
  const conversion = anatomy.hasCta ? 66 : 30;
  const design = anatomy.hasOverview ? 52 : 45;
  return {
    TOTAL: Math.round((hero + value + copy + trust + conversion + design) / 6),
    HERO: hero,
    VALUE_PROPOSITION: value,
    COPYWRITING: copy,
    TRUST: trust,
    CONVERSION: conversion,
    DESIGN: design,
    WORDS: anatomy.words,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function applyVisualPresentationBonuses(
  heuristic: HeuristicScore,
  metrics: VisualPresentationMetrics,
): { score: HeuristicScore; bonuses: string[] } {
  const bonuses: string[] = [];
  let hero = heuristic.HERO;
  let value = heuristic.VALUE_PROPOSITION;
  let copy = heuristic.COPYWRITING;
  let trust = heuristic.TRUST;
  let conversion = heuristic.CONVERSION;
  let design = heuristic.DESIGN;

  if (metrics.summaryFontPx >= 21.5 && metrics.summaryUsesPrimaryText) {
    value = clampScore(value + 10);
    bonuses.push("value_proposition_visual_prominence");
  }
  if (metrics.heroCtaHeight >= 52) {
    conversion = clampScore(conversion + 6);
    bonuses.push("cta_hero_dominance");
  }
  if (metrics.finalCtaHeight >= 54) {
    conversion = clampScore(conversion + 4);
    bonuses.push("cta_closing_dominance");
  }
  if (metrics.featureSurfaceOpaque) {
    design = clampScore(design + 6);
    bonuses.push("feature_module_surface");
  }
  if (metrics.featureGridColumns >= 2) {
    design = clampScore(design + 2);
    bonuses.push("feature_grid_scanability");
  }
  if (metrics.faqSurfaceOpaque) {
    design = clampScore(design + 4);
    bonuses.push("faq_band_surface");
  }
  if (metrics.footerPadTop >= 48) {
    design = clampScore(design + 4);
    bonuses.push("footer_hierarchy");
  }
  if (metrics.overviewInFold === false) {
    hero = clampScore(hero + 6);
    bonuses.push("hero_first_screen_decision");
  }
  if (metrics.productCtaYOverlap || (metrics.productCtaGapPx !== undefined && metrics.productCtaGapPx <= 96)) {
    hero = clampScore(hero + 4);
    bonuses.push("hero_product_cta_proximity");
  }
  if (metrics.closingSurfaceOpaque) {
    conversion = clampScore(conversion + 4);
    design = clampScore(design + 4);
    bonuses.push("closing_decision_panel");
  }

  const score: HeuristicScore = {
    TOTAL: Math.round((hero + value + copy + trust + conversion + design) / 6),
    HERO: hero,
    VALUE_PROPOSITION: value,
    COPYWRITING: copy,
    TRUST: trust,
    CONVERSION: conversion,
    DESIGN: design,
    WORDS: heuristic.WORDS,
  };
  return { score, bonuses };
}

type SkillStatus = "pass" | "fail" | "n/a";

const CATEGORY_ORDER = [
  "Hero",
  "Value Proposition",
  "Copywriting",
  "Trust & Credibility",
  "Conversion",
  "Design & UX",
] as const;

type SkillCategory = (typeof CATEGORY_ORDER)[number];

type SkillItem = {
  id: string;
  category: SkillCategory;
  weight: number;
  mode: "text" | "visual";
};

const SKILL_ITEMS: SkillItem[] = [
  { id: "hero.audience_clarity", category: "Hero", weight: 10, mode: "text" },
  { id: "hero.outcome_focus", category: "Hero", weight: 10, mode: "text" },
  { id: "hero.five_second_test", category: "Hero", weight: 10, mode: "visual" },
  { id: "hero.numeric_proof", category: "Hero", weight: 9, mode: "visual" },
  { id: "hero.differentiation", category: "Hero", weight: 9, mode: "text" },
  { id: "hero.risk_reducer", category: "Hero", weight: 8, mode: "visual" },
  { id: "hero.product_visual", category: "Hero", weight: 8, mode: "visual" },
  { id: "value_prop.specific_promise", category: "Value Proposition", weight: 9, mode: "text" },
  { id: "value_prop.promise_alignment", category: "Value Proposition", weight: 8, mode: "text" },
  { id: "value_prop.evidence_backed", category: "Value Proposition", weight: 8, mode: "text" },
  { id: "value_prop.problem_clarity", category: "Value Proposition", weight: 8, mode: "text" },
  { id: "value_prop.message_simplicity", category: "Value Proposition", weight: 8, mode: "text" },
  { id: "value_prop.unlike_framing", category: "Value Proposition", weight: 7, mode: "text" },
  { id: "value_prop.feature_outcome", category: "Value Proposition", weight: 7, mode: "text" },
  { id: "copy.action_cta", category: "Copywriting", weight: 8, mode: "text" },
  { id: "copy.objection_handling", category: "Copywriting", weight: 8, mode: "text" },
  { id: "copy.narrative", category: "Copywriting", weight: 8, mode: "text" },
  { id: "copy.transformation", category: "Copywriting", weight: 7, mode: "text" },
  { id: "copy.benefit_headings", category: "Copywriting", weight: 7, mode: "text" },
  { id: "copy.plain_language", category: "Copywriting", weight: 7, mode: "text" },
  { id: "copy.consistent_cta", category: "Copywriting", weight: 6, mode: "text" },
  { id: "copy.secondary_cta", category: "Copywriting", weight: 5, mode: "text" },
  { id: "copy.you_centric", category: "Copywriting", weight: 5, mode: "text" },
  { id: "trust.quantified_proof", category: "Trust & Credibility", weight: 8, mode: "text" },
  { id: "trust.customer_logos", category: "Trust & Credibility", weight: 7, mode: "visual" },
  { id: "trust.before_after_testimonial", category: "Trust & Credibility", weight: 7, mode: "text" },
  { id: "trust.content_quality", category: "Trust & Credibility", weight: 7, mode: "text" },
  { id: "trust.niche_testimonials", category: "Trust & Credibility", weight: 7, mode: "text" },
  { id: "trust.human_social_proof", category: "Trust & Credibility", weight: 6, mode: "visual" },
  { id: "trust.trust_badges", category: "Trust & Credibility", weight: 6, mode: "visual" },
  { id: "trust.policy_transparency", category: "Trust & Credibility", weight: 5, mode: "visual" },
  { id: "trust.linked_proof", category: "Trust & Credibility", weight: 5, mode: "text" },
  { id: "conversion.pricing_visibility", category: "Conversion", weight: 8, mode: "text" },
  { id: "conversion.cta_dominance", category: "Conversion", weight: 7, mode: "visual" },
  { id: "conversion.cta_repetition", category: "Conversion", weight: 7, mode: "visual" },
  { id: "conversion.low_commitment_cta", category: "Conversion", weight: 7, mode: "text" },
  { id: "conversion.post_submit_clarity", category: "Conversion", weight: 6, mode: "text" },
  { id: "conversion.urgency", category: "Conversion", weight: 5, mode: "visual" },
  { id: "design.authentic_imagery", category: "Design & UX", weight: 8, mode: "visual" },
  { id: "design.visual_hierarchy", category: "Design & UX", weight: 8, mode: "visual" },
  { id: "design.color_contrast", category: "Design & UX", weight: 8, mode: "visual" },
  { id: "design.scannability", category: "Design & UX", weight: 7, mode: "visual" },
  { id: "design.nav_structure", category: "Design & UX", weight: 7, mode: "visual" },
  { id: "design.page_focus", category: "Design & UX", weight: 7, mode: "visual" },
  { id: "design.palette_consistency", category: "Design & UX", weight: 6, mode: "visual" },
  { id: "design.interactive_product", category: "Design & UX", weight: 6, mode: "visual" },
  { id: "design.faq", category: "Design & UX", weight: 6, mode: "visual" },
  { id: "design.visual_tone", category: "Design & UX", weight: 5, mode: "visual" },
  { id: "design.footer", category: "Design & UX", weight: 5, mode: "visual" },
];

const CATEGORY_WEIGHTS: Record<string, number> = {
  Hero: 1.5,
  "Value Proposition": 1.5,
  "Trust & Credibility": 1.25,
  Conversion: 1.25,
  Copywriting: 1.0,
  "Design & UX": 1.0,
};

export type SkillDomSignals = {
  h1InFold: boolean;
  ctaInFold: boolean;
  productInFold: boolean;
  packshotPainted: boolean;
  heroGuarantee: boolean;
  heroCtaHeight: number;
  ctaCount: number;
  faqPresent: boolean;
  footerLinks: number;
  footerPadTop: number;
  summaryUsesPrimaryText: boolean;
  featureModules: number;
  featureGridColumns: number;
  featureSurfaceOpaque: boolean;
  faqSurfaceOpaque: boolean;
};

function visualStatus(id: string, signals: SkillDomSignals): SkillStatus {
  switch (id) {
    case "hero.five_second_test":
      return signals.h1InFold && signals.ctaInFold && signals.productInFold ? "pass" : "fail";
    case "hero.numeric_proof":
      return "fail";
    case "hero.risk_reducer":
      return signals.heroGuarantee ? "pass" : "fail";
    case "hero.product_visual":
      return signals.packshotPainted ? "pass" : "fail";
    case "trust.customer_logos":
    case "trust.human_social_proof":
    case "trust.trust_badges":
      return "fail";
    case "trust.policy_transparency":
      return "pass";
    case "conversion.cta_dominance":
      return signals.heroCtaHeight >= 52 ? "pass" : "fail";
    case "conversion.cta_repetition":
      return signals.ctaCount >= 2 && signals.ctaCount <= 4 ? "pass" : "fail";
    case "conversion.urgency":
      return "fail";
    case "design.authentic_imagery":
      return signals.packshotPainted ? "pass" : "fail";
    case "design.visual_hierarchy":
      return signals.summaryUsesPrimaryText ? "pass" : "fail";
    case "design.color_contrast":
      return "pass";
    case "design.scannability":
      return signals.featureModules >= 4 && (signals.featureGridColumns >= 2 || signals.featureSurfaceOpaque)
        ? "pass"
        : "fail";
    case "design.nav_structure":
      return "n/a";
    case "design.page_focus":
      return "pass";
    case "design.palette_consistency":
      return "pass";
    case "design.interactive_product":
      return "fail";
    case "design.faq":
      return signals.faqPresent ? "pass" : "fail";
    case "design.visual_tone":
      return "pass";
    case "design.footer":
      return signals.footerLinks >= 3 && signals.footerPadTop >= 48 ? "pass" : "fail";
    default:
      return "fail";
  }
}

export type SkillScore = {
  overall: number | null;
  categories: Record<string, number | null>;
  items: Array<{ id: string; status: SkillStatus; mode: string }>;
};

export function scoreSkillPack(signals: SkillDomSignals): SkillScore {
  const items = SKILL_ITEMS.map((item) => {
    const status = item.mode === "text" ? "n/a" : visualStatus(item.id, signals);
    return { ...item, status };
  });

  const catAgg = new Map(
    CATEGORY_ORDER.map((category) => [category, { wSum: 0, wHit: 0, pass: 0, fail: 0 }]),
  );
  for (const item of items) {
    if (item.status === "n/a") continue;
    const agg = catAgg.get(item.category);
    if (!agg) continue;
    agg.wSum += item.weight;
    if (item.status === "pass") {
      agg.wHit += item.weight;
      agg.pass += 1;
    } else {
      agg.fail += 1;
    }
  }

  const categories: Record<string, number | null> = {};
  let weighted = 0;
  let weightTotal = 0;
  for (const category of CATEGORY_ORDER) {
    const agg = catAgg.get(category)!;
    const evaluated = agg.pass + agg.fail;
    const score = evaluated > 0 ? Math.round((agg.wHit / agg.wSum) * 100) : null;
    categories[category] = score;
    if (score !== null) {
      const w = CATEGORY_WEIGHTS[category];
      weighted += score * w;
      weightTotal += w;
    }
  }

  return {
    overall: weightTotal > 0 ? Math.round(weighted / weightTotal) : null,
    categories,
    items: items.map((item) => ({ id: item.id, status: item.status, mode: item.mode })),
  };
}

export function categoryMapFromSkill(skill: SkillScore) {
  return {
    OVERALL: skill.overall,
    HERO: skill.categories.Hero ?? null,
    VALUE_PROPOSITION: skill.categories["Value Proposition"] ?? null,
    COPYWRITING: skill.categories.Copywriting ?? null,
    TRUST: skill.categories["Trust & Credibility"] ?? null,
    CONVERSION: skill.categories.Conversion ?? null,
    DESIGN: skill.categories["Design & UX"] ?? null,
  };
}
