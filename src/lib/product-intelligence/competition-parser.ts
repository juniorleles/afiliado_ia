/**
 * Host record domain: competition parser.
 *
 * Reads duck-typed ProductFacts, landing page evidence, and SearchEvidence
 * and restates measurable advertiser, market, and advertisement constructs.
 * Presence tokens mean a construct was observed. They are not judgments.
 * It never fetches a page and never invents a missing field. This layer
 * stays offline.
 */
import type { CompetitionExtractedRecord, CompetitionIssue, CompetitionPresence } from "./competition-evidence";

export interface CompetitionParser {
  parse(input: unknown): { record: CompetitionExtractedRecord; issues: CompetitionIssue[] };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function listOf(value: unknown): string[] {
  if (typeof value === "string" && value.trim() !== "") return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "").map((item) => item.trim());
}

function presenceOf(value: unknown): CompetitionPresence {
  if (value === "PRESENT" || value === true) return "PRESENT";
  if (Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim() !== "")) return "PRESENT";
  if (typeof value === "string" && value.trim() !== "" && value !== "ABSENT") return "PRESENT";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return "PRESENT";
  return "ABSENT";
}

function uniqueOf(...groups: readonly (readonly string[])[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (!seen.has(item)) {
        seen.add(item);
        out.push(item);
      }
    }
  }
  return out;
}

function emptyRecord(): CompetitionExtractedRecord {
  return {
    numberOfAdvertisers: 0,
    officialAdvertisers: [],
    affiliateAdvertisers: [],
    marketplaceAdvertisers: [],
    reviewSites: [],
    comparisonSites: [],
    brandPresence: "ABSENT",
    organicCompetition: "ABSENT",
    sponsoredCompetition: "ABSENT",
    brandStrength: "ABSENT",
    affiliateDensity: 0,
    authorityDomains: [],
    largePublishers: [],
    independentPublishers: [],
    marketplacePresence: "ABSENT",
    searchAdsPresent: "ABSENT",
    officialAds: "ABSENT",
    affiliateAds: "ABSENT",
    shoppingAds: "ABSENT",
    videoAdsPresence: "ABSENT",
  };
}

export function createCompetitionParser(): CompetitionParser {
  return {
    parse(input) {
      if (!isPlainRecord(input) || !isPlainRecord(input.searchEvidence)) {
        return {
          record: emptyRecord(),
          issues: [{ field: "searchEvidence", message: "Missing SearchEvidence: a SearchEvidence record is required." }],
        };
      }
      const search = input.searchEvidence;
      const page = isPlainRecord(input.landingPageEvidence) ? input.landingPageEvidence : {};
      const officialAdvertisers = uniqueOf(listOf(search.officialAdvertisers), listOf(search.officialAdvertiser));
      const affiliateAdvertisers = listOf(search.affiliateAdvertisers);
      const marketplaceAdvertisers = listOf(search.marketplaceAdvertisers);
      const advertisers = uniqueOf(officialAdvertisers, affiliateAdvertisers, marketplaceAdvertisers);
      const sponsoredCount = typeof search.sponsoredResultCount === "number" && Number.isFinite(search.sponsoredResultCount) ? Math.max(0, search.sponsoredResultCount) : 0;
      const numberOfAdvertisers = advertisers.length > 0 ? advertisers.length : sponsoredCount;
      const reviewSites = uniqueOf(listOf(search.reviewWebsites), listOf(search.reviewSites));
      const comparisonSites = uniqueOf(listOf(search.comparisonWebsites), listOf(search.comparisonSites));
      const authorityDomains = uniqueOf(listOf(search.authorityDomains), listOf(page.authoritySignals));
      const brandSite = textOf(search.officialWebsite);
      const knowledgePanel = presenceOf(search.knowledgePanelPresence);
      const organic = presenceOf(search.searchResultPresence) === "PRESENT" || presenceOf(search.organicCompetition) === "PRESENT";
      const sponsored = presenceOf(search.sponsoredResultPresence) === "PRESENT" || sponsoredCount > 0;
      const marketplace = presenceOf(search.marketplacePresence) === "PRESENT" || marketplaceAdvertisers.length > 0;
      const shopping = presenceOf(search.shoppingAds) === "PRESENT" || presenceOf(search.shoppingAdPresence) === "PRESENT" || listOf(search.shoppingAdvertisers).length > 0;
      const video = presenceOf(search.videoAdsPresence) === "PRESENT" || presenceOf(search.videoAds) === "PRESENT";
      const record: CompetitionExtractedRecord = {
        numberOfAdvertisers,
        officialAdvertisers,
        affiliateAdvertisers,
        marketplaceAdvertisers,
        reviewSites,
        comparisonSites,
        brandPresence: brandSite || officialAdvertisers.length > 0 ? "PRESENT" : "ABSENT",
        organicCompetition: organic ? "PRESENT" : "ABSENT",
        sponsoredCompetition: sponsored ? "PRESENT" : "ABSENT",
        brandStrength: knowledgePanel,
        affiliateDensity: affiliateAdvertisers.length,
        authorityDomains,
        largePublishers: listOf(search.largePublishers),
        independentPublishers: listOf(search.independentPublishers),
        marketplacePresence: marketplace ? "PRESENT" : "ABSENT",
        searchAdsPresent: sponsored ? "PRESENT" : "ABSENT",
        officialAds: officialAdvertisers.length > 0 ? "PRESENT" : "ABSENT",
        affiliateAds: affiliateAdvertisers.length > 0 ? "PRESENT" : "ABSENT",
        shoppingAds: shopping ? "PRESENT" : "ABSENT",
        videoAdsPresence: video ? "PRESENT" : "ABSENT",
      };
      return { record, issues: [] };
    },
  };
}
