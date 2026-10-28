import { randomBytes } from "node:crypto";
import { getCampaignById } from "@/lib/campaigns";
import { readCampaignBrief } from "@/lib/campaign-brief";
import { emptyProductFacts, type ProductFacts } from "@/lib/product-facts";
import { parseCampaignFacts, resolveProductFacts, listManualOverrides } from "@/lib/manual-overrides";
import { knowledgeChecks, knowledgePercent, readKnowledgeText, saveProductKnowledge, type KnowledgeText } from "@/lib/product-knowledge";
import { extractSources } from "@/lib/product-enrichment/extract";
import { mergeExtracted } from "@/lib/product-enrichment/merge";
import { enrichProduct } from "@/lib/product-enrichment/pipeline";
import { enrichPresellContent } from "@/lib/presell-enrichment/enrich";
import { buildEvidenceRegistry } from "@/lib/presell-enrichment/registry";
import { buildProductContract, type ContractInput } from "@/lib/product-contract/build";
import { buildConversionBrief } from "@/lib/conversion-strategy/build";
import { buildPageBlueprint } from "@/lib/page-blueprint/blueprint";
import { classifyCopyText } from "@/lib/page-blueprint/semantic-grounding";
import { inspectContentQuality } from "@/lib/lp-generator/content-quality";
import { inspectEditorialNeutrality } from "@/lib/editorial-neutrality/inspect";
import { fetchCoverageSources } from "@/lib/research-coverage/run";
import { GAP_FILL_RESEARCH_LIMITS } from "@/lib/research-coverage/types";
import { classifySourceClass } from "@/lib/research-coverage/classify-source";
import { extractPriceCandidates, verifyPrices } from "@/lib/research-coverage/price";
import { scoreProductCoverage } from "@/lib/research-coverage/score";
import { RESEARCH_LIMITS } from "@/lib/research-coverage/types";
import type { EnrichmentSource } from "@/lib/product-enrichment/types";
import type { FetchPageFn } from "@/lib/lp-generator/research";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  getPublicSiteName,
  getPublicSiteUrl,
} from "@/lib/public-site";
import { adaptContractToKnowledge, attachRunSourceFallback, mergeFieldDecisions, reviewCompletion } from "@/lib/product-research/adapter";
import { applyEditorialRecovery } from "@/lib/product-research/recover";
import { coverageGapsFromProposals } from "@/lib/product-research/gaps";
import { resolveResearchSeeds } from "@/lib/product-research/seeds";
import { activeResearchRun, listProductResearchRuns, readLatestProductResearch, readProductResearchRun, writeProductResearchRun } from "@/lib/product-research/store";
import type { ProductResearchRun } from "@/lib/product-research/types";
import { classifySubmittedUrl } from "@/lib/campaign-sources/classify";
import { mergeCampaignSources, readCampaignSources, upsertCampaignSource, writeCampaignSources } from "@/lib/campaign-sources/store";
import { readPrimaryAffiliatePage } from "@/lib/campaign-sources/primary-page";
import { processPrimaryAffiliatePage } from "@/lib/presell-quality/primary-page-research";
import { extractAffiliatePolicy } from "@/lib/affiliate-policy/extract";
import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";
import { galleryKindFromAsset, mergeAssetDecisions } from "@/lib/product-research/asset-display";

const running = new Set<number>();

function priorLockedReview(campaignId: number, currentRunId: string) {
  let proposals: ProductResearchRun["proposals"] = [];
  let assets: DiscoveredAffiliateAsset[] = [];
  let decisions: ProductResearchRun["decisions"] = [];
  for (const runId of listProductResearchRuns(campaignId)) {
    if (runId === currentRunId) continue;
    const prior = readProductResearchRun(campaignId, runId);
    if (!prior) continue;
    if (prior.proposals.some((item) => item.status === "ACCEPTED" || item.status === "REJECTED")) {
      proposals = prior.proposals;
      decisions = prior.decisions;
    }
    if ((prior.discoveredAssets ?? []).some((item) => item.status === "USER_APPROVED" || item.status === "REJECTED")) {
      assets = prior.discoveredAssets ?? [];
    }
  }
  return { proposals, assets, decisions };
}

function contractInputOf(facts: ProductFacts, slug: string): ContractInput {
  return {
    facts,
    slug,
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
  };
}

function emptyRun(input: {
  campaignId: number;
  productName: string;
  current: KnowledgeText;
}): ProductResearchRun {
  const now = new Date().toISOString();
  return {
    version: 1,
    runId: `pr-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`,
    campaignId: input.campaignId,
    productName: input.productName,
    status: "NOT_RESEARCHED",
    stage: "idle",
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    seeds: [],
    seedRejection: null,
    limitations: [],
    sources: [],
    coverageTotal: 0,
    coverageMax: 100,
    reviewAccepted: 0,
    reviewTotal: knowledgeChecks(input.current).length,
    publicationReadiness: "BLOCKED",
    publicationReason: "Publication approval is human. Research coverage is not commercial authorization.",
    grounding: "NOT_EVALUATED",
    neutrality: "NOT_EVALUATED",
    contentQuality: "NOT_EVALUATED",
    commercialAuthorization: "BLOCKED",
    proposals: [],
    decisions: [],
    error: null,
    campaignSources: [],
    affiliatePolicy: null,
    discoveredAssets: [],
  };
}

export function createProductResearchJob(input: {
  campaignId: number;
  productUrl?: string | null;
  affiliateResourceUrl?: string | null;
  authorizedDestinationUrl?: string | null;
  trackingHopUrl?: string | null;
}): ProductResearchRun {
  const campaign = getCampaignById(input.campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const active = activeResearchRun(input.campaignId);
  if (active) return active;
  const brief = readCampaignBrief(input.campaignId);
  const current = readKnowledgeText(campaign, brief).text;
  const productName = brief?.productName || campaign.name;
  const imported = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
  const facts = resolveProductFacts(imported, listManualOverrides(input.campaignId));
  const productUrl = input.productUrl || current.productUrl;
  const affiliateResourceUrl = input.affiliateResourceUrl || current.affiliateResourceUrl || "";
  const authorizedDestinationUrl = input.authorizedDestinationUrl || current.authorizedDestinationUrl || "";
  const trackingHopUrl = input.trackingHopUrl || current.trackingHopUrl || campaign.affiliateUrl;
  const salesPurpose = productUrl ? classifySubmittedUrl(productUrl, "SALES_PAGE") : null;
  if (productUrl && salesPurpose && !salesPurpose.fetchable) {
    upsertCampaignSource(input.campaignId, "SALES_PAGE", productUrl);
  }
  if (
    (productUrl && !current.productUrl.trim() && salesPurpose?.fetchable) ||
    (affiliateResourceUrl && !current.affiliateResourceUrl)
  ) {
    saveProductKnowledge(input.campaignId, {
      ...current,
      productUrl: salesPurpose?.fetchable ? productUrl : current.productUrl,
      affiliateResourceUrl: affiliateResourceUrl || current.affiliateResourceUrl,
    });
  }
  const sources = mergeCampaignSources(input.campaignId, {
    salesUrl: salesPurpose?.fetchable ? productUrl : "",
    affiliateResourceUrl,
    authorizedDestinationUrl,
    trackingHopUrl,
  });
  const seeds = resolveResearchSeeds({
    productUrl: salesPurpose?.fetchable ? productUrl : "",
    sourceUrl: facts.sourceUrl && classifySubmittedUrl(facts.sourceUrl).fetchable ? facts.sourceUrl : "",
    affiliateResourceUrl,
    affiliateUrl: campaign.affiliateUrl,
  });
  const run = emptyRun({ campaignId: input.campaignId, productName, current });
  run.seeds = seeds.seeds;
  run.seedRejection = seeds.rejection;
  run.campaignSources = sources.map((item) => ({
    sourceId: item.sourceId,
    sourceType: item.sourceType,
    sourceStatus: item.sourceStatus,
    originalUrl: item.originalUrl,
    notes: item.notes,
  }));
  const primary = readPrimaryAffiliatePage(input.campaignId);
  run.limitations = [
    ...seeds.skipped.map((item) => `${item.status}: ${item.reason}`),
    ...sources.filter((item) => !classifySubmittedUrl(item.originalUrl, item.sourceType).fetchable).map((item) => item.notes[0] ?? item.sourceStatus),
    primary
      ? "PRIMARY_AFFILIATE_LANDING_PAGE is first. Secondary sources wait until that page is inventoried or its access limits are recorded."
      : "",
  ].filter((item, index, all) => item && all.indexOf(item) === index);
  if (!seeds.seeds.length && !(primary && primary.readAllowed)) {
    run.status = "NEED_URL";
    run.stage = "blocked";
    run.finishedAt = new Date().toISOString();
    run.error = seeds.rejection;
    return writeProductResearchRun(run);
  }
  run.status = "QUEUED";
  run.stage = "queued";
  if (primary && !seeds.seeds.length) {
    run.seedRejection = null;
    run.error = null;
  }
  return writeProductResearchRun(run);
}

export async function executeProductResearch(input: {
  campaignId: number;
  runId: string;
  fetchPage?: FetchPageFn;
}): Promise<ProductResearchRun> {
  const existing = readProductResearchRun(input.campaignId, input.runId);
  if (!existing) throw new Error("Research run not found.");
  if (existing.campaignId !== input.campaignId) throw new Error("Research run does not belong to this campaign.");
  if (existing.status === "COMPLETED" || existing.status === "NEED_URL") return existing;
  if (running.has(input.campaignId)) return existing;
  running.add(input.campaignId);
  const run = { ...existing, status: "RESEARCHING" as const, stage: "fetch", startedAt: existing.startedAt ?? new Date().toISOString() };
  writeProductResearchRun(run);
  try {
    const campaign = getCampaignById(input.campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    const brief = readCampaignBrief(input.campaignId);
    const current = readKnowledgeText(campaign, brief).text;
    const productName = brief?.productName || campaign.name;
    const imported = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
    const seedFacts = resolveProductFacts(imported, listManualOverrides(input.campaignId));
    const base = seedFacts.productName ? seedFacts : emptyProductFacts(productName, run.seeds[0] ?? "", "MANUAL");
    base.confidence.productName = base.confidence.productName === "NOT_FOUND" ? "MANUAL" : base.confidence.productName;

    const priorLocked = priorLockedReview(input.campaignId, run.runId);
    const priorRun = {
      proposals: priorLocked.proposals,
      discoveredAssets: priorLocked.assets,
      decisions: priorLocked.decisions,
    };
    run.stage = "primary";
    writeProductResearchRun(run);
    const primaryResult = await processPrimaryAffiliatePage({
      campaignId: input.campaignId,
      fetchPage: input.fetchPage,
      renderPage: input.fetchPage
        ? async ({ url }) => ({
            ok: false,
            status: "BROWSER_UNAVAILABLE",
            requestedUrl: url,
            finalUrl: null,
            html: "",
            visibleText: "",
            title: null,
            expandedControls: 0,
            transactionalClicks: 0,
            elapsedMs: 0,
            reason: "Injected fetchPage skips Playwright. HTTP fallback is used when safe.",
          })
        : undefined,
    });
    const fetched = await fetchCoverageSources({
      urls: run.seeds,
      fetchPage: input.fetchPage,
      discoverAdditional: primaryResult.secondaryResearch.allowed,
      gaps: coverageGapsFromProposals(priorRun?.proposals),
      limits: GAP_FILL_RESEARCH_LIMITS,
    });
    run.limitations = [
      `Primary page ${primaryResult.extractionStatus}: ${primaryResult.rootCause}`,
      primaryResult.secondaryResearch.reason,
      ...fetched.limitations,
    ];
    const sources: EnrichmentSource[] = fetched.sources;
    const sourceClassByUrl = new Map<string, string>();
    for (const source of sources) {
      const classified = classifySourceClass({ url: source.url, html: source.html, pageCategory: source.pageCategory });
      sourceClassByUrl.set(source.url, classified.sourceClass);
    }
    run.sources = fetched.records.map((item) => {
      const purpose = classifySubmittedUrl(item.url);
      return {
        url: item.url,
        ok: item.ok,
        sourceClass: sourceClassByUrl.get(item.url) ?? null,
        sourceType: purpose.sourceType,
        extractionMode: fetched.sources.find((source) => source.url === item.url)?.extractionMode ?? "HTTP",
      };
    });
    const stored = readCampaignSources(input.campaignId).map((item) => {
      const match = fetched.records.find((record) => record.url === item.normalizedUrl || record.url === item.originalUrl);
      if (!match) return item;
      const classified = classifySourceClass({
        url: match.url,
        html: fetched.sources.find((source) => source.url === match.url)?.html,
      });
      return {
        ...item,
        fetchedAt: new Date().toISOString(),
        finalUrl: match.url,
        sourceClassification: classified.sourceClass,
        sourceStatus: match.ok ? (item.sourceStatus === "NOT_CHECKED" ? "VALID" : item.sourceStatus) : "UNAVAILABLE",
      };
    });
    writeCampaignSources(input.campaignId, stored);
    run.campaignSources = stored.map((item) => ({
      sourceId: item.sourceId,
      sourceType: item.sourceType,
      sourceStatus: item.sourceStatus,
      originalUrl: item.originalUrl,
      notes: item.notes,
    }));
    if (!sources.length) {
      if (primaryResult.extractionStatus === "COMPLETE" || primaryResult.extractionStatus === "PARTIAL") {
        run.status = "COMPLETED";
        run.stage = "review";
        run.finishedAt = new Date().toISOString();
        run.error = null;
        run.limitations.push("Secondary informational pages were not fetched. The primary affiliate page inventory remains.");
        return writeProductResearchRun(run);
      }
      run.status = fetched.records.some((item) => !item.ok) ? "FAILED" : "COMPLETED";
      run.stage = "empty";
      run.finishedAt = new Date().toISOString();
      run.error = "No usable source was fetched.";
      return writeProductResearchRun(run);
    }

    run.stage = "extract";
    writeProductResearchRun(run);
    const extracted = extractSources(sources);
    run.affiliatePolicy = extractAffiliatePolicy({
      campaignId: input.campaignId,
      texts: sources.map((source) => ({
        text: source.html ?? "",
        sourceUrl: source.url,
      })),
    });
    const mappedAssets = extracted.visualCandidates.slice(0, 8).map((item): DiscoveredAffiliateAsset => {
      const draft = {
        assetUrl: item.url,
        sourceUrl: item.sourceUrl,
        assetType: "IMAGE" as const,
        context: "Public image discovered on a researched page. Approval is still required.",
        declaredAuthorization: "UNSTATED" as const,
        usageRestrictions: ["Not approved for Renderer V4. Promotional claims in the image are not product evidence."],
        status: "REVIEW_REQUIRED" as const,
      };
      return { ...draft, galleryKind: galleryKindFromAsset(draft), hero: false, decidedAt: null };
    });
    const priorAssets = priorRun?.discoveredAssets ?? run.discoveredAssets;
    run.discoveredAssets = mergeAssetDecisions(priorAssets, mappedAssets);
    const merged = mergeExtracted(base, extracted);
    const enriched = enrichProduct({
      scenarioKey: `campaign-${input.campaignId}`,
      contractInput: contractInputOf(merged.facts, campaign.slug),
      sources,
    });
    const presell = enrichPresellContent({
      facts: enriched.afterFacts,
      sources,
      withheld: enriched.withheld,
      conflicts: enriched.conflicts,
      contract: enriched.afterContract,
    });
    const built = buildProductContract({
      ...contractInputOf(presell.facts, campaign.slug),
      benefitCandidates: presell.benefitCandidates,
    });
    const registry = buildEvidenceRegistry({
      sources,
      facts: presell.facts,
      withheld: enriched.withheld,
      conflicts: enriched.conflicts,
    });
    const prices = verifyPrices(
      sources.flatMap((source) =>
        extractPriceCandidates({
          html: source.html ?? "",
          url: source.url,
          retrievedAt: source.retrievedAt ?? null,
          sourceClass: (sourceClassByUrl.get(source.url) as never) ?? "UNKNOWN",
        }),
      ),
    );
    const coverage = scoreProductCoverage({
      contract: built.contract,
      priceStatus: prices.status,
      provenancePresent: registry.entries.some((item) => Boolean(item.url)),
    });
    const proposals = mergeFieldDecisions(
      priorRun?.proposals,
      attachRunSourceFallback(
        adaptContractToKnowledge({
          current,
          contract: built.contract,
          registry,
          sourceClassByUrl,
          priceStatus: prices.status,
          productName: campaign.name || run.productName,
        }),
        run.sources,
      ),
    );
    const recovered = applyEditorialRecovery({
      ...run,
      proposals,
      discoveredAssets: run.discoveredAssets,
    });
    const recoveredProposals = recovered.proposals;
    const briefCopy = buildConversionBrief(built.contract);
    const page = buildPageBlueprint({ contract: built.contract, brief: briefCopy });
    const grounding = classifyCopyText({ path: "introduction", text: page.copy.introduction.text, contract: built.contract });
    const leftover = inspectEditorialNeutrality(page.copy).filter((item) => item.action !== "KEEP");
    const quality = inspectContentQuality({ copy: page.copy, contract: built.contract, brief: briefCopy });
    const review = reviewCompletion(recoveredProposals);
    run.coverageTotal = coverage.total;
    run.coverageMax = coverage.max;
    run.reviewAccepted = review.accepted;
    run.reviewTotal = review.total;
    run.proposals = recoveredProposals;
    run.discoveredAssets = recovered.discoveredAssets;
    run.decisions = priorRun?.decisions ?? run.decisions;
    run.evidenceRegistry = {
      entries: registry.entries.map((item) => ({
        id: item.id,
        field: item.field,
        originalText: item.originalText.slice(0, 280),
        url: item.url,
        collectedAt: item.collectedAt,
        verification: item.verification,
        sourceType: item.sourceType ?? null,
        sourceClassification: item.sourceClassification ?? null,
      })),
    };
    run.grounding = grounding.allowed ? "PASS" : "BLOCKED";
    run.neutrality = leftover.length === 0 ? "PASS" : "BLOCKED";
    run.contentQuality = quality.length === 0 ? "PASS" : "BLOCKED";
    run.status = "COMPLETED";
    run.stage = "review";
    run.finishedAt = new Date().toISOString();
    return writeProductResearchRun(run);
  } catch (error) {
    run.status = "FAILED";
    run.stage = "failed";
    run.finishedAt = new Date().toISOString();
    run.error = error instanceof Error ? error.message : "Research failed.";
    return writeProductResearchRun(run);
  } finally {
    running.delete(input.campaignId);
  }
}

export function snapshotProductResearch(campaignId: number): {
  latest: ProductResearchRun | null;
  reviewPercent: number;
  knowledgePercent: number;
} {
  const campaign = getCampaignById(campaignId);
  const brief = readCampaignBrief(campaignId);
  const text = campaign ? readKnowledgeText(campaign, brief).text : null;
  let latest = campaign ? readLatestProductResearch(campaignId) : null;
  if (latest?.proposals.some((item) => item.suggestedValue.trim() && !item.sourceUrl)) {
    latest = writeProductResearchRun({
      ...latest,
      proposals: attachRunSourceFallback(latest.proposals, latest.sources),
    });
  }
  return {
    latest,
    reviewPercent: latest ? reviewCompletion(latest.proposals).percent : 0,
    knowledgePercent: text ? knowledgePercent(knowledgeChecks(text)) : 0,
  };
}
