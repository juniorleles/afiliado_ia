import { classifySubmittedUrl } from "@/lib/campaign-sources/classify";
import { fetchResearchSources, type FetchPageFn } from "@/lib/lp-generator/research";
import { resetBrowserRenderBudget } from "@/lib/research-coverage/fetch-rendered";
import type { EnrichmentSource } from "@/lib/product-enrichment/types";
import type { SourceFetchRecord } from "@/lib/lp-generator/types";
import { collectInformationalCandidates } from "@/lib/research-coverage/discover";
import { rankResearchCandidates, type RankedCandidate } from "@/lib/research-coverage/rank";
import { RESEARCH_LIMITS, type CoverageSlot, type ResearchLimits } from "@/lib/research-coverage/types";

export async function fetchCoverageSources(input: {
  urls: string[];
  fetchPage?: FetchPageFn;
  discoverAdditional?: boolean;
  limits?: Partial<ResearchLimits>;
  startedAt?: number;
  gaps?: CoverageSlot[];
  relatedHosts?: string[];
}): Promise<{
  sources: EnrichmentSource[];
  records: SourceFetchRecord[];
  limitations: string[];
  discovered: string[];
  skippedDiscoveries: Array<{ href: string; reason: string }>;
  ranking: { gaps: CoverageSlot[]; selected: RankedCandidate[]; excluded: RankedCandidate[]; inspected: RankedCandidate[] };
}> {
  const limits = { ...RESEARCH_LIMITS, ...input.limits };
  const startedAt = input.startedAt ?? Date.now();
  if (!input.fetchPage) resetBrowserRenderBudget();
  const limitations: string[] = [];
  const allowed = input.urls.filter((url) => {
    const purpose = classifySubmittedUrl(url);
    if (purpose.fetchable) return true;
    limitations.push(`${purpose.sourceStatus}: ${purpose.notes[0] ?? "URL was not fetched."}`);
    return false;
  });
  const seeds = allowed.slice(0, limits.maxSeedUrls);
  const leftoverSeeds = allowed.slice(limits.maxSeedUrls);
  if (leftoverSeeds.length) limitations.push(`Seed URL limit ${limits.maxSeedUrls} omitted ${leftoverSeeds.length} URL(s).`);

  const first = await fetchResearchSources({ urls: seeds, fetchPage: input.fetchPage });
  limitations.push(...first.limitations);

  const gaps = input.gaps ?? [];
  const skippedDiscoveries: Array<{ href: string; reason: string }> = [];
  const pool: Array<{ url: string; canonicalUrl: string; htmlOrder: number; anchorText?: string }> = [];
  if (input.discoverAdditional !== false) {
    const known = [...seeds, ...first.sources.map((item) => item.url)];
    for (const source of first.sources) {
      if (Date.now() - startedAt > limits.maxElapsedMs) {
        limitations.push("Controlled research stopped at the elapsed-time limit.");
        break;
      }
      if (!source.html) continue;
      const found = collectInformationalCandidates({
        html: source.html,
        pageUrl: source.url,
        known: [...known, ...pool.map((item) => item.url)],
        relatedHosts: input.relatedHosts,
      });
      skippedDiscoveries.push(...found.skipped);
      pool.push(...found.candidates);
    }
  }

  const ranked = rankResearchCandidates({
    candidates: pool,
    gaps,
    limit: limits.maxDiscoveredUrls,
  });
  skippedDiscoveries.push(
    ...ranked.excluded.map((item) => ({ href: item.url, reason: item.exclusion ?? "discovered-URL limit after ranking" })),
  );
  const discovered = ranked.selected.map((item) => item.url);
  const ranking = { gaps, selected: ranked.selected, excluded: ranked.excluded, inspected: ranked.inspected };

  const remainingSlots = Math.max(0, limits.maxFetchUrls - first.records.length);
  const extraUrls = discovered.slice(0, remainingSlots);
  if (discovered.length > extraUrls.length) {
    limitations.push("Discovered-URL fetch limit reached. Remaining candidates were not requested.");
  }

  if (!extraUrls.length) {
    return { sources: first.sources, records: first.records, limitations, discovered, skippedDiscoveries, ranking };
  }
  if (Date.now() - startedAt > limits.maxElapsedMs) {
    return { sources: first.sources, records: first.records, limitations, discovered, skippedDiscoveries, ranking };
  }

  const extra = await fetchResearchSources({ urls: extraUrls, fetchPage: input.fetchPage });
  return {
    sources: [...first.sources, ...extra.sources],
    records: [...first.records, ...extra.records],
    limitations: [...limitations, ...extra.limitations],
    discovered,
    skippedDiscoveries,
    ranking,
  };
}
