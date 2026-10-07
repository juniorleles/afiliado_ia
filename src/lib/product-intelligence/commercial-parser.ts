/**
 * Host record domain: commercial parser.
 *
 * Reads duck-typed ProductFacts, landing page evidence, SearchEvidence, and
 * CompetitionEvidence and restates measurable purchase, market, and business
 * constructs. Presence tokens mean a construct was observed. They are not
 * judgments, approvals, or refusals. It never fetches a page and never
 * invents a missing field. This layer stays offline.
 */
import type { CommercialExtractedRecord, CommercialIssue, CommercialPresence } from "./commercial-evidence";

export interface CommercialParser {
  parse(input: unknown): { record: CommercialExtractedRecord; issues: CommercialIssue[] };
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

function presenceOf(value: unknown): CommercialPresence {
  if (value === "PRESENT" || value === true) return "PRESENT";
  if (Array.isArray(value) && value.some((item) => typeof item === "string" && item.trim() !== "")) return "PRESENT";
  if (typeof value === "string" && value.trim() !== "" && value !== "ABSENT") return "PRESENT";
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return "PRESENT";
  return "ABSENT";
}

function firstPresence(...values: unknown[]): CommercialPresence {
  return values.some((value) => presenceOf(value) === "PRESENT") ? "PRESENT" : "ABSENT";
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = textOf(value);
    if (text) return text;
  }
  return null;
}

function firstList(...values: unknown[]): string[] {
  for (const value of values) {
    const list = listOf(value);
    if (list.length > 0) return list;
  }
  return [];
}

function emptyRecord(): CommercialExtractedRecord {
  return {
    directPurchaseIntent: "ABSENT",
    priceVisibility: "ABSENT",
    strongCallToAction: "ABSENT",
    salesFunnelPresence: "ABSENT",
    checkoutPresence: "ABSENT",
    guarantee: null,
    refundPolicy: null,
    recurringBilling: "ABSENT",
    upsellPresence: "ABSENT",
    downsellPresence: "ABSENT",
    leadCapture: "ABSENT",
    emailCapture: "ABSENT",
    affiliateResources: [],
    commercialSearchPresence: "ABSENT",
    brandSearchPresence: "ABSENT",
    reviewSearchPresence: "ABSENT",
    comparisonSearchPresence: "ABSENT",
    affiliateSearchPresence: "ABSENT",
    sponsoredSearchPresence: "ABSENT",
    vendorReputation: "ABSENT",
    productMaturity: "ABSENT",
    offerStability: "ABSENT",
    supportAvailability: "ABSENT",
    localization: "ABSENT",
    languageCoverage: null,
  };
}

export function createCommercialParser(): CommercialParser {
  return {
    parse(input) {
      if (!isPlainRecord(input) || !isPlainRecord(input.competitionEvidence)) {
        return {
          record: emptyRecord(),
          issues: [{ field: "competitionEvidence", message: "Missing CompetitionEvidence: a CompetitionEvidence record is required." }],
        };
      }
      const facts = isPlainRecord(input.productFacts) ? input.productFacts : {};
      const page = isPlainRecord(input.landingPageEvidence) ? input.landingPageEvidence : {};
      const search = isPlainRecord(input.searchEvidence) ? input.searchEvidence : {};
      const competition = input.competitionEvidence;
      const priceVisibility = firstPresence(page.priceVisibility, facts.priceVisibility);
      const strongCallToAction = firstPresence(page.primaryCta, page.strongCallToAction, facts.strongCallToAction);
      const checkoutPresence = firstPresence(page.checkoutPresence, facts.checkoutPresence, competition.checkoutPresence);
      const upsellPresence = firstPresence(page.upsellPresence, facts.upsellPresence, competition.upsellPresence);
      const downsellPresence = firstPresence(page.downsellPresence, facts.downsellPresence, competition.downsellPresence);
      const salesFunnelPresence = firstPresence(page.offerStructure, page.salesFunnelPresence, upsellPresence, downsellPresence);
      const guarantee = firstText(page.guarantee, facts.guarantee);
      const refundPolicy = firstText(page.refundPolicy, facts.refundPolicy);
      const commission = firstText(facts.commissionType, page.commissionType);
      const recurringBilling = commission && /recurring/i.test(commission) ? "PRESENT" : firstPresence(facts.recurringBilling, page.recurringBilling);
      const contact = firstText(page.contactInformation, facts.contactInformation);
      const emailCapture = firstPresence(page.emailCapture, facts.emailCapture, contact && /^mailto:/i.test(contact) ? "PRESENT" : "ABSENT");
      const leadCapture = firstPresence(page.leadCapture, facts.leadCapture, emailCapture);
      const affiliateResources = firstList(facts.affiliateResources, page.affiliateResources, competition.affiliateResources);
      const languageCoverage = firstText(facts.language, page.language, search.language, competition.language);
      const reviewSearch = firstPresence(competition.reviewSites, search.reviewWebsites, page.reviews, competition.reviewSearchPresence);
      const comparisonSearch = firstPresence(competition.comparisonSites, search.comparisonWebsites, competition.comparisonSearchPresence);
      const affiliateSearch = firstPresence(competition.affiliateAdvertisers, search.affiliateAdvertisers, competition.affiliateSearchPresence, competition.affiliateAds);
      const sponsoredSearch = firstPresence(competition.sponsoredCompetition, competition.searchAdsPresent, search.sponsoredResultPresence, competition.sponsoredSearchPresence);
      const brandSearch = firstPresence(competition.brandPresence, search.officialWebsite, search.knowledgePanelPresence, competition.officialAdvertisers, competition.brandSearchPresence);
      const commercialSearch = firstPresence(search.searchResultPresence, competition.organicCompetition, competition.commercialSearchPresence, sponsoredSearch);
      const vendorReputation = firstPresence(page.trustBadges, page.authoritySignals, competition.authorityDomains, facts.vendorReputation);
      const supportAvailability = firstPresence(facts.supportUrl, page.contactInformation, facts.supportAvailability);
      const record: CommercialExtractedRecord = {
        directPurchaseIntent: priceVisibility === "PRESENT" && strongCallToAction === "PRESENT" ? "PRESENT" : checkoutPresence,
        priceVisibility,
        strongCallToAction,
        salesFunnelPresence,
        checkoutPresence,
        guarantee,
        refundPolicy,
        recurringBilling,
        upsellPresence,
        downsellPresence,
        leadCapture,
        emailCapture,
        affiliateResources,
        commercialSearchPresence: commercialSearch,
        brandSearchPresence: brandSearch,
        reviewSearchPresence: reviewSearch,
        comparisonSearchPresence: comparisonSearch,
        affiliateSearchPresence: affiliateSearch,
        sponsoredSearchPresence: sponsoredSearch,
        vendorReputation,
        productMaturity: reviewSearch,
        offerStability: guarantee || refundPolicy ? "PRESENT" : "ABSENT",
        supportAvailability,
        localization: languageCoverage ? "PRESENT" : "ABSENT",
        languageCoverage,
      };
      return { record, issues: [] };
    },
  };
}
