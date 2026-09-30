import type { ProductFacts } from "@/lib/product-facts";

export const GENERATED_VISUAL_IS_EVIDENCE = false as const;
export const IMAGE_TEXT_REIMPORT_ALLOWED = false as const;
export const ART_DIRECTION_IS_EVIDENCE = false as const;

export const FORBIDDEN_CLAIMS = [
  "testimonials",
  "reviews",
  "ratings",
  "doctor endorsements",
  "certifications",
  "research claims",
  "scientific claims",
  "statistics",
  "pricing",
  "discounts",
  "scarcity",
  "urgency",
  "timers",
  "stock warnings",
  "invented guarantees",
  "invented ingredients",
  "results",
  "medical claims",
  "invented slogans",
  "invented benefit statements",
  "product results",
] as const;

export const FORBIDDEN_VISUAL_PATTERNS = [
  "fake urgency",
  "countdown timers",
  "review stars",
  "invented authority badges",
  "scarcity banners",
  "dashboard cards",
  "aggressive advertorial layout",
  "poster",
  "single-scene advertisement",
  "social-media creative",
  "billboard",
  "result-implying lifestyle",
  "before and after",
  "person presented as a product outcome",
  "invented benefit icons",
  "medical crosses",
  "doctor symbols",
  "certification seals",
  "joint-health symbols",
  "capsule benefit symbols",
] as const;

/** Generated image text is decorative. It cannot enter facts, grounding, or consumer copy. */
export function reimportImageText(_text: string): { allowed: false; reason: "IMAGE_TEXT_REIMPORT_ALLOWED=NO" } {
  return { allowed: false, reason: "IMAGE_TEXT_REIMPORT_ALLOWED=NO" };
}

/** Visual artifacts are not a factual source. Facts are returned unchanged. */
export function rejectVisualMutation(facts: ProductFacts): ProductFacts {
  return facts;
}
