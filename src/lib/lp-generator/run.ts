import { randomBytes } from "node:crypto";
import { emptyProductFacts, type ProductFacts } from "@/lib/product-facts";
import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import { overlayReviewMedia } from "@/lib/lp-generator/review-assets";
import { applySandboxToModel } from "@/lib/sandbox/cta";
import { buildSandboxCtaPath } from "@/lib/sandbox/href";
import { writeSandboxSession } from "@/lib/sandbox/store";
import { buildProductContract, type ContractInput } from "@/lib/product-contract/build";
import { buildConversionBrief } from "@/lib/conversion-strategy/build";
import { extractSources } from "@/lib/product-enrichment/extract";
import { mergeExtracted } from "@/lib/product-enrichment/merge";
import { enrichProduct } from "@/lib/product-enrichment/pipeline";
import type { EnrichmentSource } from "@/lib/product-enrichment/types";
import { buildPageBlueprint } from "@/lib/page-blueprint/blueprint";
import { buildSalesCopy } from "@/lib/page-blueprint/copy";
import { offlineCopyAdapter, type CopyAdapter } from "@/lib/page-blueprint/adapter";
import { resolveCommercialCopy } from "@/lib/lp-generator/ai-copy/resolve";
import type { AiCopyCaller } from "@/lib/lp-generator/ai-copy/types";
import { diagnoseAiProvider } from "@/lib/lp-generator/ai-copy/provider";
import { inspectContentQuality, repairContentQuality } from "@/lib/lp-generator/content-quality";
import { persistQualityInspection } from "@/lib/lp-generator/quality-persist";
import { commercialHeadline, structureResearchFacts } from "@/lib/lp-generator/structure";
import { composeV4Model } from "@/lib/product-showcase/v4/model";
import { overlayApprovedAssets } from "@/lib/real-product-assets/overlay";
import { productKeyFromName } from "@/lib/real-product-assets/extract";
import { readCatalog } from "@/lib/real-product-assets/store";
import type { ProductCatalog } from "@/lib/real-product-assets/types";
import { buildAdaptivePlan } from "@/lib/product-showcase/adaptive-plan";
import { buildEditorialDocument, editorialLead } from "@/lib/product-showcase/editorial";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  getPublicSiteName,
  getPublicSiteUrl,
} from "@/lib/public-site";
import { diskFreeGb, diskIsBelowStop } from "@/lib/quality-gate/disk";
import { collectSourceUrls, type FetchPageFn } from "@/lib/lp-generator/research";
import { fetchCoverageSources } from "@/lib/research-coverage/run";
import { evaluateGenerationGates, pipelineDefects } from "@/lib/lp-generator/gates";
import { generationHash, inputIsReady, normalizeGenerationInput } from "@/lib/lp-generator/input";
import {
  DEFAULT_GENERATION_ROOT,
  emptyRecord,
  findReusableGeneration,
  readGeneration,
  writeGeneration,
  writeGenerationModel,
} from "@/lib/lp-generator/store";
import type { GenerationInput, GenerationRecord, GenerationState } from "@/lib/lp-generator/types";

export type RunGenerationOptions = {
  force?: boolean;
  storeRoot?: string;
  fetchPage?: FetchPageFn;
  injectedSources?: EnrichmentSource[];
  readCatalog?: (productKey: string) => ProductCatalog | null;
  adapter?: CopyAdapter;
  aiCaller?: AiCopyCaller;
  allowPaidAi?: boolean;
  now?: () => string;
  injectedFacts?: ProductFacts;
  injectedApprovedAssets?: DiscoveredAffiliateAsset[];
  sandboxMode?: boolean;
  campaignId?: number;
  researchRunId?: string;
};

function newId(): string {
  return `lp-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
}

function seedFacts(input: GenerationInput): ProductFacts {
  const facts = emptyProductFacts(input.productName, input.salesUrl, "MANUAL");
  facts.confidence.productName = "MANUAL";
  if (input.category) {
    facts.productFormat = {
      value: input.category,
      statement: input.category,
      provenance: "MANUAL",
      copyEligibility: "YES",
      policyFindings: [],
      sourceUrl: input.salesUrl,
      sourcePageCategory: "PRIMARY",
    };
  }
  return facts;
}

function contractInputOf(facts: ProductFacts, hop: { href: string | null; previewOnly: boolean }): ContractInput {
  const plan = buildAdaptivePlan({ facts });
  const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
  const { lead, summary } = editorialLead(editorial.blocks.find((block) => block.id === "introduction"));
  return {
    facts,
    slug: productKeyFromName(facts.productName),
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: hop.href
      ? { href: hop.href, label: "View offer", previewOnly: hop.previewOnly }
      : { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
    valueProposition: { headline: commercialHeadline(facts.productName), supporting: summary },
  };
}

function mark(record: GenerationRecord, state: GenerationState, started: number): void {
  record.status = state;
  record.timings.stages.push({ state, ms: Date.now() - started });
}

export async function runGeneration(
  raw: Parameters<typeof normalizeGenerationInput>[0],
  options: RunGenerationOptions = {},
): Promise<GenerationRecord> {
  const root = options.storeRoot ?? DEFAULT_GENERATION_ROOT;
  const now = options.now ?? (() => new Date().toISOString());
  const normalized = normalizeGenerationInput(raw);
  if (!inputIsReady(normalized)) {
    const failed = emptyRecord(normalized.input, newId(), generationHash(normalized.input), now());
    failed.status = "FAILED";
    failed.errors = normalized.issues.map((item) => `${item.field}: ${item.message}`);
    failed.timings.finishedAt = now();
    writeGeneration(failed, root);
    return failed;
  }

  const hash = generationHash(normalized.input);
  if (!options.force) {
    const reusable = findReusableGeneration(hash, root);
    if (reusable) {
      return { ...reusable, reusedFrom: reusable.id };
    }
  }

  const free = diskFreeGb();
  if (diskIsBelowStop(free)) {
    const failed = emptyRecord(normalized.input, newId(), hash, now());
    failed.status = "FAILED";
    failed.errors = [`Disk has ${free} GB free. Generation stops below 5 GB.`];
    failed.timings.finishedAt = now();
    writeGeneration(failed, root);
    return failed;
  }

  const id = newId();
  const record = emptyRecord(normalized.input, id, hash, now());
  record.productKey = productKeyFromName(normalized.input.productName);
  record.assets.productKey = record.productKey;
  if (options.campaignId) record.campaignId = options.campaignId;
  if (options.researchRunId) record.researchRunId = options.researchRunId;
  const hop = options.sandboxMode ? { href: null, previewOnly: true, placeholderRejected: false } : normalized.hop;
  record.timings.startedAt = now();
  record.limitations = [];
  if (hop.placeholderRejected) {
    record.limitations.push("HopLink placeholder rejected. Preview has no purchase CTA.");
  }
  if (!hop.href) {
    record.limitations.push("No authorized HopLink was supplied. The landing page stays in preview mode.");
  }
  if (options.sandboxMode) {
    record.limitations.push("SANDBOX generation: commercial CTA stays off. Only a local simulation path may be armed.");
  }
  if (normalized.input.language.toLowerCase() !== "en") {
    record.limitations.push("Copy engines emit English. The requested language was stored and not applied.");
  }
  writeGeneration(record, root);

  const clock = Date.now();
  try {
    mark(record, "RESEARCHING", clock);
    writeGeneration(record, root);

    let sources: EnrichmentSource[] = options.injectedSources ?? [];
    if (options.injectedFacts) {
      record.sources = [];
      record.limitations.push("Contract uses only human-approved review facts. Live source extraction did not run.");
    } else if (!options.injectedSources) {
      const fetched = await fetchCoverageSources({
        urls: collectSourceUrls(normalized.input),
        fetchPage: options.fetchPage,
        discoverAdditional: true,
      });
      sources = fetched.sources;
      record.sources = fetched.records;
      record.limitations.push(...fetched.limitations);
    } else {
      record.sources = sources.map((source) => ({
        url: source.url,
        requestedUrl: source.url,
        ok: true,
        status: 200,
        reason: null,
        hopPlaceholder: false,
        pageCategory: source.pageCategory ?? "PRIMARY",
        bytes: source.html?.length ?? 0,
      }));
      record.limitations.push("Research sources were supplied by the caller; no live fetch ran for this generation.");
    }

    if (sources.length === 0 && !options.injectedFacts) {
      record.limitations.push("No source page could be read. The contract uses only the operator-supplied identity.");
    }

    mark(record, "BUILDING_CONTRACT", clock);
    writeGeneration(record, root);
    const cleaned = options.injectedFacts
      ? structureResearchFacts({
          operatorName: normalized.input.productName,
          category: normalized.input.category,
          facts: options.injectedFacts,
          purchaseLink: null,
        })
      : (() => {
          const seed = seedFacts(normalized.input);
          const extracted = extractSources(sources);
          const merged = mergeExtracted(seed, extracted);
          const structured = structureResearchFacts({
            operatorName: normalized.input.productName,
            category: normalized.input.category,
            facts: merged.facts,
            purchaseLink: hop.previewOnly ? null : hop.href,
          });
          const enriched = enrichProduct({
            scenarioKey: id,
            contractInput: contractInputOf(structured.facts, hop),
            sources,
          });
          return structureResearchFacts({
            operatorName: normalized.input.productName,
            category: normalized.input.category,
            facts: enriched.afterFacts,
            purchaseLink: hop.previewOnly ? null : hop.href,
          });
        })();
    record.research = {
      productName: cleaned.research.productName,
      category: cleaned.research.category,
      ingredientCount: cleaned.research.ingredients.length,
      featureCount: cleaned.research.features.length,
      droppedCount: cleaned.research.dropped.length,
    };
    const rebuilt = buildProductContract(contractInputOf(cleaned.facts, hop));
    const contract = rebuilt.contract;
    const brief = buildConversionBrief(contract);

    mark(record, "GENERATING_STRATEGY", clock);
    writeGeneration(record, root);

    mark(record, "GENERATING_COPY", clock);
    writeGeneration(record, root);
    const diagnosis = diagnoseAiProvider();
    const rawCopy = buildSalesCopy(contract, brief);
    const resolved = await resolveCommercialCopy({
      copy: rawCopy,
      contract,
      brief,
      research: cleaned.research,
      language: normalized.input.language,
      market: normalized.input.market,
      allowPaidAi: options.allowPaidAi ?? diagnosis.authorized,
      caller: options.aiCaller,
    });
    const repaired = repairContentQuality({ copy: resolved.copy, contract, brief });
    const { copy, blueprint } = buildPageBlueprint({
      contract,
      brief,
      copy: repaired.copy,
      adapter: options.adapter ?? offlineCopyAdapter(),
    });
    record.ai = {
      provider: resolved.run.provider,
      model: resolved.run.model,
      status: resolved.run.status,
      fallbackUsed: resolved.run.fallbackUsed,
      latencyMs: resolved.run.latencyMs,
      costEstimate: resolved.run.costEstimate,
      usage: resolved.run.usage ?? null,
      requestId: resolved.run.requestId ?? null,
      costUsd: resolved.run.costUsd ?? null,
      costStatus: resolved.run.costStatus ?? null,
    };
    record.copy = {
      producer: copy.producer,
      aiUsed: resolved.run.status === "USED",
      aiConfigured: diagnosis.configured,
      headline: copy.headline.text,
      sectionCount: copy.sections.length,
    };
    if (resolved.run.fallbackUsed) {
      record.limitations.push(
        resolved.run.status === "BLOCKED_AUTHORIZATION"
          ? "Paid AI is configured but not authorized. Deterministic commercial copy was used and is not real AI."
          : resolved.run.status === "BLOCKED_CONFIGURATION"
            ? "No commercial-copy AI provider is ready. Deterministic commercial copy was used and is not real AI."
            : `AI copy did not apply (${resolved.run.status}). Deterministic commercial copy was used and is not real AI.`,
      );
    }
    if (repaired.repairs.length) {
      record.limitations.push(`Content quality repairs: ${repaired.repairs.join("; ")}.`);
    }

    mark(record, "SELECTING_ASSETS", clock);
    writeGeneration(record, root);
    const reviewMedia = options.injectedApprovedAssets
      ? selectReviewMedia({
          assets: options.injectedApprovedAssets,
          productName: normalized.input.productName,
          campaignId: options.campaignId ?? null,
        })
      : null;
    const catalog = reviewMedia ? null : (options.readCatalog ?? readCatalog)(record.productKey);
    if (reviewMedia) {
      record.assets.approvedAvailable = reviewMedia.approvedCount;
      record.assets.pendingCount = options.injectedApprovedAssets.filter(
        (item) => item.status !== "USER_APPROVED" && item.status !== "REJECTED",
      ).length;
      record.assets.blockedCount = options.injectedApprovedAssets.filter((item) => item.status === "REJECTED").length;
      if (reviewMedia.heroStatus === "HERO_IMAGE_MISSING") {
        record.limitations.push("HERO_IMAGE_MISSING. No approved packshot was eligible. Renderer V4 uses its editorial fallback.");
      }
      if (reviewMedia.approvedCount === 0) {
        record.limitations.push("No USER_APPROVED campaign images were supplied. Pending or rejected images were not used.");
      }
    } else {
      record.assets.approvedAvailable = catalog?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0;
      record.assets.pendingCount = catalog?.images.filter((item) => item.status === "PENDING_USER_APPROVAL").length ?? 0;
      record.assets.blockedCount =
        catalog?.images.filter((item) => item.status === "REJECTED" || item.status === "REVOKED" || item.status === "BLOCKED_BY_POLICY")
          .length ?? 0;
      if (!catalog) {
        record.limitations.push("No real-asset catalog exists for this product. The page stays editorial.");
      } else if (record.assets.approvedAvailable === 0) {
        record.limitations.push("No USER_APPROVED images are on file. Pending or blocked images were not used.");
      }
    }

    mark(record, "RENDERING", clock);
    writeGeneration(record, root);
    const composed = composeV4Model({ scenarioKey: id, contract, brief, copy, blueprint });
    let model = reviewMedia
      ? overlayReviewMedia(composed, reviewMedia)
      : overlayApprovedAssets(composed, catalog, {
          mode: normalized.input.goal === "SEND_TO_OFFER" ? "PRESELL_BOFU" : "PRESELL_EDITORIAL",
        });
    if (options.sandboxMode) {
      const sid = `sbx-${id}`;
      const ctaPath = buildSandboxCtaPath({
        sessionId: sid,
        productKey: record.productKey || id,
        landingPageId: id,
        presellMode: "PRESELL_EDITORIAL",
      });
      writeSandboxSession({
        version: 1,
        sessionId: sid,
        productKey: record.productKey || id,
        landingPageId: id,
        presellMode: "PRESELL_EDITORIAL",
        ctaPath,
        createdAt: now(),
        productionPromotionBlocked: true,
      });
      model = applySandboxToModel(model, { href: ctaPath });
      record.sandbox = { enabled: true, sessionId: sid, ctaPath, productionPromotionBlocked: true };
    }
    writeGenerationModel(id, model, root);
    record.previewPath = `/admin/lab/lp-generator/${id}/preview`;
    record.assets.approvedUsed = [
      ...(model.commercialImage
        ? [{ id: assetIdFromSrc(model.commercialImage.src), src: model.commercialImage.src, role: "hero" as const, status: "USER_APPROVED" as const }]
        : []),
      ...(model.galleryImages ?? []).map((image) => ({
        id: assetIdFromSrc(image.src),
        src: image.src,
        role: "gallery" as const,
        status: "USER_APPROVED" as const,
      })),
    ].filter((item) => item.id);
    record.strategy = {
      status: brief.status,
      conversionGoal: brief.conversionGoal,
      composition: model.composition,
      narrativeShape: blueprint.narrative.shape,
      blueprintVersion: blueprint.blueprintVersion,
    };

    mark(record, "VALIDATING", clock);
    writeGeneration(record, root);
    const finalQuality = inspectContentQuality({ copy: model.copy, contract, brief });
    const qualityStatus = finalQuality.length === 0 ? (repaired.repairs.length ? "REPAIRED" : "PASS") : "BLOCKED";
    const qualityInspection = persistQualityInspection({
      copy: model.copy,
      contract,
      brief,
      repaired: { status: qualityStatus, defects: finalQuality, repairs: repaired.repairs, copy: model.copy },
      timestamp: now(),
    });
    record.qualityInspection = qualityInspection;
    if (qualityInspection.persistence === "INCONSISTENT") {
      record.errors.push(qualityInspection.reason ?? "QUALITY_GATE_PERSISTENCE=INCONSISTENT");
    }
    const defects = [
      ...pipelineDefects({ contract, brief, copy, blueprint, model, catalog }),
      ...finalQuality,
    ];
    const evaluated = evaluateGenerationGates({ defects, contentQuality: qualityStatus });
    record.defects = defects;
    record.gates = evaluated.gates;
    record.gateLabels = evaluated.labels;

    const blocking = defects.filter((item) => item.severity === "BLOCKING");
    const renderable = contract.status === "RENDERABLE";
    if (qualityInspection.persistence === "INCONSISTENT") {
      record.status = "FAILED";
    } else if (!renderable || blocking.some((item) => item.kind === "DISK")) {
      record.status = "FAILED";
      record.errors.push(renderable ? "A blocking disk or technical defect stopped the generation." : "The product contract is insufficient for a page.");
    } else if (
      blocking.length ||
      !evaluated.labels.CONTENT_PASS ||
      qualityStatus === "BLOCKED" ||
      brief.status === "INSUFFICIENT_DATA" ||
      brief.status === "BLOCKED"
    ) {
      record.status = "NEEDS_REVIEW";
    } else {
      record.status = "PREVIEW_READY";
    }
    record.timings.finishedAt = now();
    record.timings.durationMs = Date.now() - clock;
    writeGeneration(record, root);
    return record;
  } catch (err) {
    const message = err instanceof Error ? err.message : "generation failed";
    record.status = "FAILED";
    record.errors.push(message);
    record.timings.finishedAt = now();
    record.timings.durationMs = Date.now() - clock;
    writeGeneration(record, root);
    return record;
  }
}

function assetIdFromSrc(src: string): string {
  const parts = src.split("/");
  return parts[parts.length - 1] ?? "";
}

export function loadGeneration(id: string, root = DEFAULT_GENERATION_ROOT): GenerationRecord | null {
  return readGeneration(id, root);
}

export { normalizeGenerationInput, inputIsReady, generationHash };
