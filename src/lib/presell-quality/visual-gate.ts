import {
  FORBIDDEN_REFERENCE_CHROME,
  MAX_DESIGN_ITERATIONS,
  PAID_AI_BUDGET_USD,
  QUALITY_SCORE_TARGET,
  VISUAL_SCORE_TARGET,
  type VisualDimension,
  weightedVisualScore,
} from "@/lib/presell-quality/premium-design";

export type ViewportInspect = {
  width: number;
  height: number;
  overflowX: boolean;
  rendered: boolean;
  heroLoaded: boolean;
  brokenImages: number;
  liveHop: boolean;
  previewCta: boolean;
  previewCtaEnabled: boolean;
  packshotSrc: string | null;
  hasIngredients: boolean;
  hasGuarantee: boolean;
  hasShipping: boolean;
  hasFaq: boolean;
  hasFooter: boolean;
  forbiddenChrome: boolean;
  consoleErrors: string[];
};

export type VisualEvaluation = {
  scores: Record<VisualDimension, number>;
  rationales: Record<VisualDimension, string>;
  overall: number;
  criticalDefects: string[];
  noCriticalVisualDefects: boolean;
  target: typeof VISUAL_SCORE_TARGET;
  source: "CURSOR_MULTIMODAL" | "DETERMINISTIC_ONLY" | "NOT_EXECUTED";
  comparedToReference: boolean;
};

export function criticalVisualDefects(inspect: {
  desktop: ViewportInspect;
  tablet: ViewportInspect;
  mobile: ViewportInspect;
}): string[] {
  const defects: string[] = [];
  for (const [name, view] of [
    ["desktop", inspect.desktop],
    ["tablet", inspect.tablet],
    ["mobile", inspect.mobile],
  ] as const) {
    if (!view.rendered) defects.push(`${name}: page did not render`);
    if (view.overflowX) defects.push(`${name}: horizontal overflow`);
    if (view.brokenImages > 0) defects.push(`${name}: broken images`);
    if (view.liveHop) defects.push(`${name}: live commercial hop`);
    if (view.previewCtaEnabled) defects.push(`${name}: preview CTA is enabled`);
    if (view.forbiddenChrome) defects.push(`${name}: forbidden promotional chrome`);
  }
  if (inspect.desktop.packshotSrc && !inspect.desktop.heroLoaded) {
    defects.push("desktop: packshot did not load");
  }
  return defects;
}

export function evaluateVisualGate(input: {
  visual: VisualEvaluation;
  qualityScore: number | null;
  qualityTargetReached: boolean;
  contentSafetyPass: boolean;
  mobilePass: boolean;
  tabletPass: boolean;
  desktopPass: boolean;
}): {
  visualQualityGate: "PASS" | "FAIL";
  blockers: string[];
} {
  const blockers: string[] = [];
  if (input.visual.source === "NOT_EXECUTED") blockers.push("Visual AI review was not executed.");
  if (!input.visual.comparedToReference) blockers.push("Reference image comparison was not executed.");
  if (input.visual.overall < VISUAL_SCORE_TARGET) blockers.push(`Visual score ${input.visual.overall} < ${VISUAL_SCORE_TARGET}.`);
  if (!input.visual.noCriticalVisualDefects) blockers.push("Critical visual defects remain.");
  if (input.qualityScore == null) blockers.push("Existing quality rubric was not scored in this execution.");
  else if (!input.qualityTargetReached || input.qualityScore < QUALITY_SCORE_TARGET) {
    blockers.push(`Quality score ${input.qualityScore ?? "n/a"} < ${QUALITY_SCORE_TARGET}.`);
  }
  if (!input.contentSafetyPass) blockers.push("Content safety gate failed.");
  if (!input.desktopPass) blockers.push("Desktop test failed.");
  if (!input.tabletPass) blockers.push("Tablet test failed.");
  if (!input.mobilePass) blockers.push("Mobile test failed.");
  return { visualQualityGate: blockers.length ? "FAIL" : "PASS", blockers };
}

export function iterationLimitReached(count: number): boolean {
  return count >= MAX_DESIGN_ITERATIONS;
}

export function paidAiBlockedFor54au(): boolean {
  return PAID_AI_BUDGET_USD <= 0;
}

export function markupHasForbiddenChrome(markup: string): boolean {
  return FORBIDDEN_REFERENCE_CHROME.test(markup);
}
