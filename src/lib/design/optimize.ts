import { getCampaignBySlug, updateCampaignCreative, updateCampaignDesign, type Campaign } from "@/lib/campaigns";
import { parsePresellPage } from "@/lib/presell-page";
import { parseDesignPlan, serializeDesignPlan, type DesignPlan, type HeroVariant, type VisualTheme } from "@/lib/design/plan";
import { applyActionCodes, createDesignPlan, plansEqual, uniqueActionCodes } from "@/lib/design/planner";
import { runVisualQaForSlug } from "@/lib/visual-qa/run";
import type { VisualQaReport } from "@/lib/visual-qa/types";
import { evaluateProductAsset } from "@/lib/assets/status";
import { createCreativeCompositionPlan, applyCreativeActionCodes } from "@/lib/creative/planner";
import { parseCreativeCompositionPlan, serializeCreativeCompositionPlan, creativePlansEqual } from "@/lib/creative/plan";
import { CREATIVE_COMPOSITION_VERSION, type CreativeCompositionPlan } from "@/lib/creative/types";

export const MAX_VISUAL_OPTIMIZATION_ITERATIONS = 2;

export type OptimizationStop =
  | "PASS"
  | "MAX_ITERATIONS"
  | "NO_SAFE_CHANGES"
  | "NO_IMPROVEMENT"
  | "MISSING_PAGE"
  | "CONTENT_GATE_UNRELATED";

export type OptimizationResult = {
  campaign: Campaign;
  plan: DesignPlan;
  iterations: number;
  earlyStop: OptimizationStop;
  before: VisualQaReport | null;
  after: VisualQaReport | null;
  aiUsedForPlanning: false;
};

export function presentationFields(campaign: Campaign): {
  headline: string;
  body: string;
  ctaLabel: string;
  affiliateUrl: string;
  pageComposition: string | null;
} {
  return {
    headline: campaign.headline,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    affiliateUrl: campaign.affiliateUrl,
    pageComposition: campaign.pageComposition ?? null,
  };
}

/** Copy-only fields. Product image attach may rewrite hero.image inside pageComposition. */
export function copyFields(campaign: Campaign): {
  headline: string;
  body: string;
  ctaLabel: string;
  affiliateUrl: string;
} {
  return {
    headline: campaign.headline,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    affiliateUrl: campaign.affiliateUrl,
  };
}

export function assertNoCopyRewrite(before: Campaign, after: Campaign): void {
  if (JSON.stringify(copyFields(before)) !== JSON.stringify(copyFields(after))) {
    throw new Error("Unsafe factual transformation rejected: product asset updates may not rewrite campaign copy.");
  }
}

export function assertNoFactualRewrite(before: Campaign, after: Campaign): void {
  const a = presentationFields(before);
  const b = presentationFields(after);
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error("Unsafe factual transformation rejected: design updates may not rewrite campaign copy.");
  }
}

export function planForCampaign(
  campaign: Campaign,
  options: { theme?: VisualTheme; heroVariant?: HeroVariant; themeLocked?: boolean } = {},
): DesignPlan {
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) {
    throw new Error("MISSING_PAGE");
  }
  const existing = parseDesignPlan(campaign.designPlanJson);
  const theme = options.theme ?? existing?.visualTheme;
  const asset = evaluateProductAsset({ page, campaign });
  let heroVariant = options.heroVariant;
  if (!heroVariant && existing?.heroVariant && existing.productAssetStatus === asset.status) {
    heroVariant = existing.heroVariant;
  }
  const locked = options.themeLocked ?? Boolean(options.theme) ?? existing?.themeLocked ?? false;
  return createDesignPlan({
    page,
    theme,
    heroVariant,
    themeLocked: locked,
    productAssetStatus: asset.status,
    productAssetProvenance: asset.provenance,
  });
}

export function saveDesignPlan(campaign: Campaign, plan: DesignPlan): Campaign {
  const next = updateCampaignDesign(campaign.id, {
    designPlanJson: serializeDesignPlan(plan),
    visualTheme: plan.visualTheme,
    designVersion: DESIGN_VERSION,
    productAssetStatus: plan.productAssetStatus,
    productAssetMetadata: JSON.stringify({
      status: plan.productAssetStatus,
      provenance: plan.productAssetProvenance,
    }),
  });
  assertNoFactualRewrite(campaign, next);
  return next;
}

const DESIGN_VERSION = 2;

function severityCounts(report: VisualQaReport): { high: number; warning: number } {
  const all = [...report.deterministicFindings, ...report.visualFindings];
  return {
    high: all.filter((f) => f.severity === "HIGH").length,
    warning: all.filter((f) => f.severity === "WARNING").length,
  };
}

export function saveCreativePlan(campaign: Campaign, plan: CreativeCompositionPlan): Campaign {
  const next = updateCampaignCreative(campaign.id, {
    creativeCompositionJson: serializeCreativeCompositionPlan(plan),
    creativeCompositionVersion: CREATIVE_COMPOSITION_VERSION,
  });
  assertNoCopyRewrite(campaign, next);
  return next;
}

export async function applyDesignToCampaign(
  slug: string,
  options: { theme?: VisualTheme; heroVariant?: HeroVariant } = {},
): Promise<{ campaign: Campaign; plan: DesignPlan; creative: CreativeCompositionPlan | null }> {
  const campaign = getCampaignBySlug(slug);
  if (!campaign) throw new Error("Campaign not found");
  const plan = planForCampaign(campaign, {
    theme: options.theme,
    heroVariant: options.heroVariant,
    themeLocked: Boolean(options.theme),
  });
  let saved = saveDesignPlan(campaign, plan);
  const page = parsePresellPage(saved.pageComposition);
  const creative = page ? createCreativeCompositionPlan({ page, design: plan }) : null;
  if (creative) saved = saveCreativePlan(saved, creative);
  return { campaign: saved, plan, creative };
}

export async function runVisualOptimization(
  slug: string,
  options: { theme?: VisualTheme; maxIterations?: number; persistQa?: boolean } = {},
): Promise<OptimizationResult> {
  const max = options.maxIterations ?? MAX_VISUAL_OPTIMIZATION_ITERATIONS;
  let campaign = getCampaignBySlug(slug);
  if (!campaign) throw new Error("Campaign not found");
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) {
    return {
      campaign,
      plan: planForCampaign(campaign, { theme: options.theme }),
      iterations: 0,
      earlyStop: "MISSING_PAGE",
      before: null,
      after: null,
      aiUsedForPlanning: false,
    };
  }

  let plan = planForCampaign(campaign, { theme: options.theme, themeLocked: Boolean(options.theme) });
  campaign = saveDesignPlan(campaign, plan);
  let creative =
    parseCreativeCompositionPlan(campaign.creativeCompositionJson) ??
    createCreativeCompositionPlan({ page, design: plan });
  campaign = saveCreativePlan(campaign, creative);

  const before = await runVisualQaForSlug(slug, options.persistQa !== false);
  if (before.status === "PASS") {
    return { campaign, plan, iterations: 0, earlyStop: "PASS", before, after: before, aiUsedForPlanning: false };
  }

  let last = before;
  let iterations = 0;
  for (let i = 0; i < max; i += 1) {
    const codes = uniqueActionCodes([...last.deterministicFindings, ...last.visualFindings, ...last.highPriority]);
    if (codes.length === 0) {
      return { campaign, plan, iterations, earlyStop: "NO_SAFE_CHANGES", before, after: last, aiUsedForPlanning: false };
    }
    const nextPlan = applyActionCodes(structuredClone(plan), codes, page);
    const rebuilt = createCreativeCompositionPlan({ page, design: nextPlan, findings: [...last.deterministicFindings, ...last.visualFindings] });
    const nextCreative = applyCreativeActionCodes(rebuilt, codes);
    if (plansEqual(plan, nextPlan) && creativePlansEqual(creative, nextCreative)) {
      return { campaign, plan, iterations, earlyStop: "NO_SAFE_CHANGES", before, after: last, aiUsedForPlanning: false };
    }
    plan = nextPlan;
    creative = nextCreative;
    campaign = saveDesignPlan(campaign, plan);
    campaign = saveCreativePlan(campaign, creative);
    iterations += 1;
    const report = await runVisualQaForSlug(slug, options.persistQa !== false);
    if (report.status === "PASS") {
      return { campaign, plan, iterations, earlyStop: "PASS", before, after: report, aiUsedForPlanning: false };
    }
    const prevCounts = severityCounts(last);
    const nextCounts = severityCounts(report);
    if (nextCounts.high >= prevCounts.high && nextCounts.warning >= prevCounts.warning) {
      return {
        campaign,
        plan,
        iterations,
        earlyStop: "NO_IMPROVEMENT",
        before,
        after: report,
        aiUsedForPlanning: false,
      };
    }
    last = report;
  }

  return { campaign, plan, iterations, earlyStop: "MAX_ITERATIONS", before, after: last, aiUsedForPlanning: false };
}
