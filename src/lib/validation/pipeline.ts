import type { VariantApproach } from "@/lib/ai/generate-variants";
import { generateVariants, lintVariant, VARIANT_APPROACHES } from "@/lib/ai/generate-variants";
import { validateGrounding } from "@/lib/ai/grounding-validator";
import type { EvidenceTrace } from "@/lib/ai/structured-generation";
import { createCreativeCompositionPlan } from "@/lib/creative/planner";
import { createDesignPlan } from "@/lib/design/planner";
import type { PageTemplateId } from "@/lib/presell-page";
import {
  applyProductImageToPage,
  composePresellPage,
  consumerVisibleText,
  serializePresellPage,
} from "@/lib/presell-page";
import { buildGateTrace, snapshotGroundingStage } from "@/lib/validation/gate-trace";
import { evaluateProductAsset } from "@/lib/assets/status";
import type { ProductFacts } from "@/lib/product-facts";
import { isCopyEligibleImageProvenance } from "@/lib/product-facts";
import { runMarketResearch } from "@/lib/market-research/research";
import { withFreshness } from "@/lib/market-research/freshness";
import { selectStrategy } from "@/lib/strategy/select";
import type { StrategyFamily } from "@/lib/strategy/types";
import { buildSourceQa } from "@/lib/validation/conditions";
import { buildStructureFingerprint } from "@/lib/validation/fingerprint";
import {
  emptyAiReview,
  emptyVisualQa,
  insertValidationCandidate,
  updateValidationRun,
  getValidationRun,
} from "@/lib/validation/store";
import { collectCandidateFailures } from "@/lib/validation/taxonomy";
import type {
  AssetQaSnapshot,
  PipelineStageId,
  PipelineStageRecord,
  StageOutcome,
  ValidationCandidate,
} from "@/lib/validation/types";
import { PIPELINE_STAGES } from "@/lib/validation/types";

export function approachToTemplate(approach: VariantApproach): PageTemplateId {
  if (approach === "BUYER_GUIDE") return "BUYER_GUIDE";
  if (approach === "EDUCATIONAL") return "EDITORIAL";
  return "REVIEW";
}

export function markStage(
  stages: PipelineStageRecord[],
  id: PipelineStageId,
  outcome: StageOutcome,
  notes: string,
  error?: string,
): PipelineStageRecord[] {
  const next = stages.map((stage) => ({ ...stage }));
  const at = new Date().toISOString();
  const existing = next.find((stage) => stage.id === id);
  if (existing) {
    existing.outcome = outcome;
    existing.notes = notes;
    existing.at = at;
    existing.error = error;
    return next;
  }
  next.push({ id, outcome, at, notes, error });
  return next;
}

export function initialStages(): PipelineStageRecord[] {
  return PIPELINE_STAGES.map((id) => ({
    id,
    outcome: "SKIPPED" as StageOutcome,
    at: new Date().toISOString(),
    notes: "not run yet",
  }));
}

export function skipRemaining(stages: PipelineStageRecord[], fromId: PipelineStageId, reason: string): PipelineStageRecord[] {
  const start = PIPELINE_STAGES.indexOf(fromId);
  let next = stages;
  for (let i = start + 1; i < PIPELINE_STAGES.length; i += 1) {
    next = markStage(next, PIPELINE_STAGES[i]!, "SKIPPED", reason);
  }
  return next;
}

function assetQaFromPage(page: ReturnType<typeof composePresellPage>): AssetQaSnapshot {
  const meta = evaluateProductAsset({
    page,
    campaign: {
      productImageSrc: page.hero.image.src || null,
      productImageProvenance: page.hero.image.provenance === "PLACEHOLDER" ? "NOT_FOUND" : page.hero.image.provenance,
    },
  });
  const found = meta.status === "READY";
  return {
    packshotFound: found,
    packshotRole: meta.role,
    packshotDimensions: meta.width && meta.height ? { width: meta.width, height: meta.height } : null,
    packshotProvenance: meta.provenance,
    packshotClassification: meta.role,
    rejectedAssetCount: meta.qualityFindings.filter((item) => /banner|unusable|cta|logo/i.test(item)).length,
  };
}

export function composeCandidateFromVariant(input: {
  runId: string;
  productKey: string;
  facts: ProductFacts;
  approach: VariantApproach;
  headline: string;
  body: string;
  ctaLabel: string;
  strategyMeta?: ValidationCandidate["strategyMeta"];
  /** Slot traces from the generation lint, when that path produced them. */
  evidenceTrace?: readonly EvidenceTrace[];
}): Omit<ValidationCandidate, "id" | "createdAt" | "updatedAt" | "publicationStatus" | "humanReview" | "humanNotes"> {
  let stages = initialStages();
  stages = markStage(stages, "IMPORT", "OK", `origin=${input.facts.origin} quality=${input.facts.importQuality}`);
  stages = markStage(
    stages,
    "PRODUCT_FACTS",
    input.facts.importQuality === "INSUFFICIENT" ? "BLOCKED" : "OK",
    `completeness recorded; missing fields remain NOT_FOUND`,
  );

  const variant = {
    approach: input.approach,
    headline: input.headline,
    body: input.body,
    ctaLabel: input.ctaLabel,
  };
  stages = markStage(stages, "AI_CONTENT", "OK", input.approach);

  const linted = lintVariant(variant, input.facts.productName, "https://invalid.local/validation-preview", input.facts);
  const groundingOutcome =
    linted.grounding.status === "UNGROUNDED" ? "FAIL" : linted.grounding.status === "REVIEW_REQUIRED" ? "BLOCKED" : "OK";
  stages = markStage(stages, "GROUNDING", groundingOutcome, linted.grounding.status);
  const policyOutcome = linted.lint.gate === "BLOCKED" ? "BLOCKED" : linted.lint.gate === "REVIEW_REQUIRED" ? "BLOCKED" : "OK";
  stages = markStage(
    stages,
    "POLICY_LINTER",
    policyOutcome,
    `policy=${linted.lint.gate} publication=${linted.finalGate} warnings=${linted.lint.warningCount} blocking=${linted.lint.blockingCount}`,
  );

  const template = approachToTemplate(input.approach);
  let page = composePresellPage({ variant, facts: input.facts, template });
  if (input.facts.productImageUrl && isCopyEligibleImageProvenance(input.facts.productImageProvenance)) {
    page = applyProductImageToPage(page, {
      src: input.facts.productImageUrl,
      alt: `${input.facts.productName} product image`,
      provenance: input.facts.productImageProvenance,
    });
  }
  const assetQa = assetQaFromPage(page);
  const sourceQa = buildSourceQa(input.facts, assetQa);
  const design = createDesignPlan({
    page,
    productAssetStatus: assetQa.packshotFound ? "READY" : "NEEDS_ASSET",
    productAssetProvenance: assetQa.packshotProvenance === "MANUAL" || assetQa.packshotProvenance === "DIRECT_SOURCE"
      ? assetQa.packshotProvenance
      : "NOT_FOUND",
    strategyHint: input.approach,
  });
  stages = markStage(stages, "DESIGN_PLAN", "OK", `${design.visualTheme}/${design.heroVariant}`);
  const creative = createCreativeCompositionPlan({ page, design });
  stages = markStage(stages, "CREATIVE_COMPOSITION", "OK", `${creative.scenes.length} scenes`);

  const fingerprint = buildStructureFingerprint({
    page,
    design,
    creative,
    approach: input.approach,
  });

  const evaluatedAt = new Date().toISOString();
  const preRepresentation = `${input.headline}\n${input.body}\n${input.ctaLabel}`;
  const finalRepresentation = consumerVisibleText(page);
  const finalGrounding = validateGrounding(finalRepresentation, input.facts);
  const gateTrace = buildGateTrace({
    evaluatedAt,
    preComposition: snapshotGroundingStage({
      stage: "PRE_COMPOSITION_GROUNDING",
      representation: preRepresentation,
      grounding: linted.grounding,
      facts: input.facts,
      evidenceTrace: input.evidenceTrace,
      evaluatedAt,
    }),
    finalComposition: snapshotGroundingStage({
      stage: "FINAL_COMPOSITION_GROUNDING",
      representation: finalRepresentation,
      grounding: finalGrounding,
      facts: input.facts,
      evaluatedAt,
    }),
    policyGate: linted.lint.gate,
    publicationGate: linted.finalGate,
    blockingRules: linted.lint.majorFindings.filter((f) => f.status === "fail").map((f) => `${f.ruleId}: ${f.message}`),
    warnings: linted.lint.majorFindings.filter((f) => f.status === "warn").map((f) => `${f.ruleId}: ${f.message}`),
    authorityViolations: linted.generationPlanViolations,
  });

  const draft: Omit<ValidationCandidate, "id" | "createdAt" | "updatedAt" | "publicationStatus" | "humanReview" | "humanNotes"> = {
    runId: input.runId,
    productKey: input.productKey,
    productName: input.facts.productName,
    approach: input.approach,
    template,
    theme: design.visualTheme,
    heroVariant: design.heroVariant,
    stages,
    fingerprint,
    conditions: sourceQa.conditions,
    contentQa: {
      groundingStatus: linted.grounding.status,
      policyGate: linted.lint.gate,
      finalGate: linted.finalGate,
      warnings: linted.lint.majorFindings.filter((f) => f.status === "warn").map((f) => `${f.ruleId}: ${f.message}`),
      blockingRules: linted.lint.majorFindings
        .filter((f) => f.status === "fail")
        .map((f) => `${f.ruleId}: ${f.message}`),
      gateTrace,
    },
    sourceQa,
    assetQa,
    visualQa: emptyVisualQa(),
    aiReview: emptyAiReview(),
    performance: null,
    failures: [],
    desktopScreenshot: null,
    mobileScreenshot: null,
    pageCompositionJson: serializePresellPage(page),
    designPlanJson: JSON.stringify(design),
    creativeJson: JSON.stringify(creative),
    factsJson: JSON.stringify(input.facts),
    campaignId: null,
    strategyMeta: input.strategyMeta || null,
  };
  draft.failures = collectCandidateFailures(draft);
  return draft;
}

export async function generateCandidatesForProduct(input: {
  runId: string;
  productKey: string;
  facts: ProductFacts;
  searchWeb?: (query: string) => Promise<Array<{ url: string; title: string; snippet: string }>>;
}): Promise<ValidationCandidate[]> {
  const run = getValidationRun(input.runId);
  if (!run) throw new Error("validation run not found");
  updateValidationRun(input.runId, { status: "RUNNING" });

  const research = withFreshness(await runMarketResearch({ facts: input.facts, searchWeb: input.searchWeb }));
  const healthSensitive =
    input.facts.ingredientsOrComponents.length > 0 ||
    /\b(supplement|probiotic|vitamin|joint|health|capsule|tablet)\b/i.test(
      `${input.facts.description || ""} ${input.facts.features.join(" ")}`,
    );
  const strategy = selectStrategy({
    factsName: input.facts.productName,
    healthSensitive,
    factsSufficient: input.facts.importQuality !== "INSUFFICIENT",
    research,
  });
  const product = run.products.find((item) => item.key === input.productKey);
  if (product) {
    product.MARKET_RESEARCH_STATUS = research.status;
    product.MARKET_RESEARCH_QUALITY = research.quality;
    product.MARKET_RESEARCH_DATE = research.researchedAt;
    product.MARKET_SOURCES = research.sources.length;
    product.RECOMMENDED_STRATEGY = strategy.recommendedStrategy;
    product.STRATEGY_CONFIDENCE = strategy.confidence;
    product.STRATEGY_RATIONALE = strategy.rationale;
    product.ALTERNATIVES = strategy.alternatives.map((item) => item.strategy);
  }
  updateValidationRun(input.runId, {
    products: run.products,
    marketResearch: research,
    strategy,
  });

  let variants;
  try {
    variants = await generateVariants({
      productName: input.facts.productName,
      sourceUrl: input.facts.sourceUrl,
      facts: input.facts,
      marketResearch: research,
    });
  } catch (err) {
    const stages = skipRemaining(
      markStage(initialStages(), "IMPORT", "OK", "facts already imported"),
      "AI_CONTENT",
      err instanceof Error ? err.message : "generation failed",
    );
    const failed = insertValidationCandidate({
      runId: input.runId,
      productKey: input.productKey,
      productName: input.facts.productName,
      approach: "REVIEW",
      template: "REVIEW",
      theme: "",
      heroVariant: "",
      stages: markStage(stages, "AI_CONTENT", "FAIL", "generateVariants threw", err instanceof Error ? err.message : "error"),
      fingerprint: null,
      conditions: input.facts.importQuality === "SUFFICIENT" ? [] : ["DIFFICULT_IMPORT_SOURCE", "LIMITED_PRODUCT_FACTS"],
      contentQa: {
        groundingStatus: "UNAVAILABLE",
        policyGate: "UNAVAILABLE",
        finalGate: "UNAVAILABLE",
        warnings: [],
        blockingRules: [],
      },
      sourceQa: {
        importQuality: input.facts.importQuality,
        productAssetStatus: "UNKNOWN",
        productFactCompleteness: "EMPTY",
        sourceProvenance: input.facts.origin,
        conditions: [],
      },
      assetQa: {
        packshotFound: false,
        packshotRole: null,
        packshotDimensions: null,
        packshotProvenance: "NOT_FOUND",
        packshotClassification: null,
        rejectedAssetCount: 0,
      },
      visualQa: emptyVisualQa(),
      aiReview: emptyAiReview(),
      performance: null,
      failures: [
        {
          type: "GENERATION_FAILURE",
          stage: "AI_CONTENT",
          message: err instanceof Error ? err.message : "generation failed",
        },
      ],
      desktopScreenshot: null,
      mobileScreenshot: null,
      pageCompositionJson: null,
      designPlanJson: null,
      creativeJson: null,
      factsJson: JSON.stringify(input.facts),
      campaignId: null,
    });
    return [failed];
  }

  const created: ValidationCandidate[] = [];
  for (const approach of VARIANT_APPROACHES) {
    const variant = variants.find((item) => item.approach === approach);
    if (!variant) {
      created.push(
        insertValidationCandidate({
          ...composeCandidateFromVariant({
            runId: input.runId,
            productKey: input.productKey,
            facts: input.facts,
            approach,
            headline: input.facts.productName,
            body: input.facts.description || "Source facts were insufficient to generate this approach.",
            ctaLabel: "See details",
          }),
          stages: skipRemaining(
            markStage(initialStages(), "AI_CONTENT", "FAIL", `${approach} missing from model response`),
            "AI_CONTENT",
            `${approach} missing`,
          ),
          failures: [{ type: "GENERATION_FAILURE", stage: "AI_CONTENT", message: `${approach} missing` }],
        }),
      );
      continue;
    }
    created.push(
      insertValidationCandidate(
        composeCandidateFromVariant({
          runId: input.runId,
          productKey: input.productKey,
          facts: input.facts,
          approach,
          headline: variant.headline,
          body: variant.body,
          ctaLabel: variant.ctaLabel,
          strategyMeta: {
            recommended: approach === strategy.recommendedStrategy,
            confidence: strategy.confidence,
            rationale: strategy.rationale,
            researchedAt: research.researchedAt,
          },
        }),
      ),
    );
  }
  return created;
}
