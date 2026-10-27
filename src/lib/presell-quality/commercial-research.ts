import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { classifySubmittedUrl, sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { relatedHostEvidence } from "@/lib/campaign-sources/related-hosts";
import { classifyUrlRoles } from "@/lib/campaign-sources/roles";
import { readCampaignSources } from "@/lib/campaign-sources/store";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { extractSources } from "@/lib/product-enrichment/extract";
import type { EnrichmentSource } from "@/lib/product-enrichment/types";
import type { FetchPageFn } from "@/lib/lp-generator/research";
import { fetchCoverageSources } from "@/lib/research-coverage/run";
import { classifySourceClass } from "@/lib/research-coverage/classify-source";
import { RESEARCH_LIMITS } from "@/lib/research-coverage/types";
import { coverageGapsFromProposals } from "@/lib/product-research/gaps";
import { readLatestProductResearch } from "@/lib/product-research/store";
import type { FieldProposal } from "@/lib/product-research/types";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { sha256Text } from "@/lib/presell-quality/fingerprint";
import { validateFactCandidate, type FactCandidate } from "@/lib/presell-quality/recovery";
import { stageImageCandidates, type ImageRecoveryCandidate } from "@/lib/presell-quality/asset-recovery";
import { proposeEditorialPlan, type EditorialPlan } from "@/lib/presell-quality/editorial-plan";
import { selectReviewMedia } from "@/lib/product-research/media-contract";
import { getSearchProviderStatus, createWebSearch } from "@/lib/source-resolution/provider";
import type { SearchHit } from "@/lib/source-resolution/types";
import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";

export const EXPANSION_SOURCE_CLASSES = [
  "MANUFACTURER_OR_BRAND",
  "SELLER",
  "AFFILIATE_RESOURCE",
  "INDEPENDENT_INFORMATION",
  "SCIENTIFIC_OR_REGULATORY",
  "UNKNOWN",
] as const;
export type ExpansionSourceClass = (typeof EXPANSION_SOURCE_CLASSES)[number];

const SCIENTIFIC_HOST = /(^|\.)(nih\.gov|pubmed\.ncbi\.nlm\.nih\.gov|who\.int|ftc\.gov|fda\.gov|europa\.eu)$|(^|\.)gov$/i;
const CHECKOUT_PATH = /\/(cart|checkout|payment|order-now|ordernow|buy-now|buynow)(\/|$|\.)/i;

export type SourceInventoryRow = {
  requestedUrl: string;
  finalUrl: string;
  ok: boolean;
  httpStatus: number | null;
  extracted: boolean;
  htmlBytes: number;
  sourceClass: ExpansionSourceClass;
  classReason: string;
  roles: string[];
  fetchable: boolean;
  checkout: boolean;
  accessed: boolean;
  blockReason: string | null;
};

export type CommercialExpansionResult = {
  campaignId: number;
  fingerprint: string;
  skippedAsRedundant: boolean;
  seeds: string[];
  relatedHosts: string[];
  searchProvider: string;
  searchConfigured: boolean;
  searchQueries: string[];
  searchHits: Array<{ url: string; title: string; query: string }>;
  inventory: SourceInventoryRow[];
  factCandidates: FactCandidate[];
  factsVerified: number;
  factsApprovedForUse: 0;
  imageCandidates: ImageRecoveryCandidate[];
  heroEligibleImages: number;
  editorialPlan: EditorialPlan;
  editorialPlanStatus: "PREPARED_NOT_APPLIED";
  regenerationReady: false;
  remainingEvidenceGaps: string[];
  remainingAssetGaps: string[];
  sugardefender24Root: { requested: boolean; accessed: boolean; extracted: boolean; httpStatus: number | null; reason: string };
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
  limitations: string[];
};

function expansionFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "expansion-54ae.json");
}

export function readCommercialExpansion(campaignId: number): CommercialExpansionResult | null {
  const file = expansionFile(campaignId);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CommercialExpansionResult;
  } catch {
    return null;
  }
}

function mapSourceClass(raw: string, host: string): { sourceClass: ExpansionSourceClass; reason: string } {
  if (SCIENTIFIC_HOST.test(host)) return { sourceClass: "SCIENTIFIC_OR_REGULATORY", reason: "Regulatory or scientific host." };
  if (raw === "INDEPENDENT_REFERENCE") return { sourceClass: "INDEPENDENT_INFORMATION", reason: "Independent reference host or page." };
  if (raw === "MANUFACTURER_OR_BRAND" || raw === "SELLER" || raw === "AFFILIATE_RESOURCE") {
    return { sourceClass: raw, reason: `Existing classifier: ${raw}.` };
  }
  if (raw === "REVIEW_OR_TESTIMONIAL" || raw === "MARKETPLACE") {
    return { sourceClass: "UNKNOWN", reason: `${raw} is not treated as independent product evidence.` };
  }
  return { sourceClass: "UNKNOWN", reason: "No stronger class was justified." };
}

function publicUrl(url: string): string {
  return sanitizeSharedUrl(url);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isCheckoutUrl(url: string): boolean {
  try {
    return CHECKOUT_PATH.test(new URL(url).pathname);
  } catch {
    return CHECKOUT_PATH.test(url);
  }
}

function proposal(field: FieldProposal["field"], text: string, sourceUrl: string, sourceClass: string): FieldProposal {
  return {
    field,
    currentValue: "",
    suggestedValue: text,
    status: "FOUND_REVIEW_REQUIRED",
    evidenceIds: text ? ["exp-54ae"] : [],
    sourceUrl,
    sourceClass,
    verification: sourceClass === "SELLER" || sourceClass === "AFFILIATE_RESOURCE" ? "SELLER_STATED" : "UNVERIFIED",
    restriction: null,
    collectedAt: new Date().toISOString(),
    eligibleForBatch: false,
    notes: [],
    evidenceExcerpt: text.slice(0, 280),
  };
}

function expansionSeeds(
  campaignId: number,
  extraSeeds: string[] = [],
): { seeds: string[]; relatedHosts: string[]; limitations: string[] } {
  const sources = readCampaignSources(campaignId);
  const seeds: string[] = [];
  const limitations: string[] = [];
  for (const url of extraSeeds) {
    const roles = classifyUrlRoles(url);
    const purpose = classifySubmittedUrl(url);
    if (roles.checkout || !purpose.fetchable) {
      limitations.push(`${publicUrl(url)} was not seeded: ${roles.notes[0] ?? purpose.sourceStatus}`);
      continue;
    }
    if (!seeds.includes(url)) seeds.push(url);
  }
  for (const item of sources) {
    if (item.origin === "HISTORICAL_FIXTURE") continue;
    if (isCheckoutUrl(item.originalUrl) || item.sourceStatus === "CHECKOUT_SUSPECTED") continue;
    const purpose = classifySubmittedUrl(item.originalUrl);
    if (!purpose.fetchable) continue;
    if (!seeds.includes(item.originalUrl)) seeds.push(item.originalUrl);
  }
  const hosts = [...new Set(seeds.map(hostOf).filter(Boolean))];
  const relatedHosts = hosts.filter((host, index) =>
    hosts.some((other, otherIndex) => otherIndex !== index && relatedHostEvidence(host, other).related),
  );
  return { seeds, relatedHosts, limitations };
}

async function searchExternal(queries: string[], fetchPage?: FetchPageFn): Promise<{ hits: Array<SearchHit & { query: string }>; status: string; configured: boolean; limitations: string[] }> {
  const status = getSearchProviderStatus();
  const limitations: string[] = [];
  if (!status.realWebSearchAvailable) {
    return { hits: [], status: status.name, configured: false, limitations: [status.message] };
  }
  const created = createWebSearch(fetch ?? globalThis.fetch, undefined);
  const hits: Array<SearchHit & { query: string }> = [];
  for (const query of queries) {
    try {
      const found = await created.search(query);
      for (const hit of found.slice(0, 4)) {
        if (isCheckoutUrl(hit.url)) {
          limitations.push(`Search hit skipped as checkout: ${publicUrl(hit.url)}`);
          continue;
        }
        if (!classifySubmittedUrl(hit.url).fetchable) {
          limitations.push(`Search hit not fetchable: ${publicUrl(hit.url)}`);
          continue;
        }
        hits.push({ ...hit, query });
      }
    } catch (error) {
      limitations.push(error instanceof Error ? error.message : "Search failed.");
    }
  }
  void fetchPage;
  return { hits, status: status.name, configured: true, limitations };
}

export async function runCommercialEvidenceExpansion(
  campaignId: number,
  deps: {
    fetchPage?: FetchPageFn;
    search?: (query: string) => Promise<SearchHit[]>;
    skipSearch?: boolean;
    extraSeeds?: string[];
  } = {},
): Promise<CommercialExpansionResult> {
  const run = readLatestProductResearch(campaignId);
  const accepted = acceptedProposals(run);
  const { seeds, relatedHosts, limitations } = expansionSeeds(campaignId, deps.extraSeeds);
  const queries = [
    "Sugar Defender official manufacturer",
    "Sugar Defender supplement facts warnings",
    "Sugar Defender affiliate resource official",
  ];
  const fingerprint = sha256Text(JSON.stringify({ campaignId, seeds, relatedHosts, queries }));
  const prior = readCommercialExpansion(campaignId);
  if (prior && prior.fingerprint === fingerprint) {
    return { ...prior, skippedAsRedundant: true };
  }

  const fetched = await fetchCoverageSources({
    urls: seeds,
    fetchPage: deps.fetchPage,
    discoverAdditional: true,
    relatedHosts,
    gaps: coverageGapsFromProposals(run?.proposals),
    limits: { maxFetchUrls: RESEARCH_LIMITS.maxFetchUrls, maxDiscoveredUrls: RESEARCH_LIMITS.maxDiscoveredUrls },
  });

  const search = deps.skipSearch
    ? { hits: [], status: "SKIPPED", configured: false, limitations: ["External search skipped."] }
    : deps.search
      ? { hits: (await Promise.all(queries.map(async (query) => (await deps.search!(query)).map((hit) => ({ ...hit, query }))))).flat(), status: "MOCK", configured: true, limitations: [] }
      : await searchExternal(queries, deps.fetchPage);

  const extraUrls = search.hits
    .map((hit) => hit.url)
    .filter((url, index, all) => all.indexOf(url) === index)
    .filter((url) => !fetched.records.some((row) => row.url === url || row.requestedUrl === url))
    .slice(0, 4);
  const extra = extraUrls.length
    ? await fetchCoverageSources({ urls: extraUrls, fetchPage: deps.fetchPage, discoverAdditional: false, relatedHosts: [] })
    : { sources: [] as EnrichmentSource[], records: [], limitations: [] as string[], discovered: [], skippedDiscoveries: [], ranking: { gaps: [], selected: [], excluded: [], inspected: [] } };

  const sources = [...fetched.sources, ...extra.sources];
  const records = [...fetched.records, ...extra.records];
  const extracted = extractSources(sources);
  const inventory: SourceInventoryRow[] = records.map((record) => {
    const html = sources.find((item) => item.url === record.url)?.html ?? "";
    const classified = classifySourceClass({ url: record.url, html, pageCategory: record.pageCategory });
    const mapped = mapSourceClass(classified.sourceClass, hostOf(record.url));
    const roles = classifyUrlRoles(record.requestedUrl || record.url);
    return {
      requestedUrl: publicUrl(record.requestedUrl || record.url),
      finalUrl: publicUrl(record.url),
      ok: record.ok,
      httpStatus: record.status,
      extracted: Boolean(html),
      htmlBytes: html.length,
      sourceClass: mapped.sourceClass,
      classReason: mapped.reason,
      roles: roles.roles,
      fetchable: roles.fetchable,
      checkout: roles.checkout,
      accessed: record.ok,
      blockReason: record.ok ? null : record.reason,
    };
  });

  const classByUrl = new Map(inventory.map((item) => [item.finalUrl, item.sourceClass]));
  const fieldMap: Array<{ field: FieldProposal["field"]; texts: string[] }> = [
    { field: "warnings", texts: extracted.facts.cautions },
    { field: "faq", texts: extracted.snippets.filter((item) => item.field === "faq").map((item) => item.text) },
    { field: "benefits", texts: extracted.facts.features },
    { field: "pricing", texts: [extracted.facts.pricingInformation, ...extracted.offers.map((item) => `${item.packageName} ${item.unitPrice}`)].filter((item): item is string => Boolean(item)) },
    { field: "manufacturer", texts: extracted.facts.manufacturer ? [extracted.facts.manufacturer] : [] },
  ];
  const factCandidates = fieldMap.flatMap(({ field, texts }) => {
    const unique = [...new Set(texts.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean))];
    return unique.map((text) => {
      const snippet = extracted.snippets.find((item) => item.text.includes(text.slice(0, 40)));
      const sourceUrl = snippet?.sourceUrl ?? sources[0]?.url ?? seeds[0] ?? "";
      const sourceClass = classByUrl.get(publicUrl(sourceUrl)) ?? "UNKNOWN";
      return validateFactCandidate({ proposal: proposal(field, text, sourceUrl, sourceClass), accepted });
    });
  });

  const discoveredAssets: DiscoveredAffiliateAsset[] = [
    ...(run?.discoveredAssets ?? []),
    ...extracted.visualCandidates.slice(0, 8).map((item) => ({
      assetUrl: item.url,
      sourceUrl: item.sourceUrl,
      assetType: "IMAGE" as const,
      context: "Image discovered during commercial expansion. Approval is still required.",
      declaredAuthorization: "UNSTATED" as const,
      usageRestrictions: ["Not approved for Renderer V4. Public availability is not a rights grant."],
      status: "REVIEW_REQUIRED" as const,
      galleryKind: "OTHER" as const,
      hero: false,
      decidedAt: null,
    })),
  ];
  const images = stageImageCandidates({
    assets: discoveredAssets,
    productName: run?.productName || "Product",
    campaignId,
  });
  const media = selectReviewMedia({
    assets: run?.discoveredAssets,
    productName: run?.productName || "Product",
    campaignId,
  });
  const editorialPlan = proposeEditorialPlan({ run, media });
  const rootRow = inventory.find((item) => item.requestedUrl.replace(/\/$/, "") === "https://sugardefender24.com");
  const remainingEvidenceGaps = ["warnings", "faq", "benefits", "pricing", "manufacturer"].filter(
    (field) => !accepted.some((item) => item.field === field) && !factCandidates.some((item) => item.field === field && item.usable),
  );

  const result: CommercialExpansionResult = {
    campaignId,
    fingerprint,
    skippedAsRedundant: false,
    seeds,
    relatedHosts,
    searchProvider: search.status,
    searchConfigured: search.configured,
    searchQueries: queries,
    searchHits: search.hits.map((hit) => ({ url: publicUrl(hit.url), title: hit.title, query: hit.query })),
    inventory,
    factCandidates,
    factsVerified: factCandidates.filter((item) => item.usable && item.verification && item.verification !== "UNVERIFIED").length,
    factsApprovedForUse: 0,
    imageCandidates: images.candidates,
    heroEligibleImages: images.heroEligibleCount,
    editorialPlan,
    editorialPlanStatus: "PREPARED_NOT_APPLIED",
    regenerationReady: false,
    remainingEvidenceGaps,
    remainingAssetGaps: images.heroEligibleCount === 0 ? ["No hero-eligible packshot. Use EDITORIAL_NO_IMAGE."] : [],
    sugardefender24Root: {
      requested: seeds.includes("https://sugardefender24.com/"),
      accessed: Boolean(rootRow?.accessed),
      extracted: Boolean(rootRow?.extracted),
      httpStatus: rootRow?.httpStatus ?? null,
      reason: rootRow ? (rootRow.extracted ? "HTML extracted from the domain root." : rootRow.blockReason ?? "Fetched without extractable HTML.") : "Root was not in the seed list.",
    },
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    limitations: [...limitations, ...fetched.limitations, ...extra.limitations, ...search.limitations],
  };
  mkdirSync(path.dirname(expansionFile(campaignId)), { recursive: true });
  writeFileSync(expansionFile(campaignId), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}
