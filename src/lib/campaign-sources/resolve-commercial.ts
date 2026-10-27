import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { classifyUrlRoles, type UrlRoleReport } from "@/lib/campaign-sources/roles";
import { relatedHostEvidence, inspectNonCheckoutUrl, type RelatedHostEvidence, type SafeInspectResult } from "@/lib/campaign-sources/related-hosts";
import { publicAffiliateView, readUserProvidedAffiliateUrl, type UserProvidedAffiliateRecord } from "@/lib/campaign-sources/user-provided";
import { readCampaignSources } from "@/lib/campaign-sources/store";
import { snapshotProductResearch } from "@/lib/product-research/run";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestQualityAssessment } from "@/lib/presell-quality/persist";
import { getCampaignById } from "@/lib/campaigns";

export type CommercialResolution = {
  campaignId: number;
  affiliateUrlRegistered: boolean;
  affiliateUrlSource: "USER_PROVIDED" | null;
  affiliateUrlVerification: "UNVERIFIED" | null;
  publicAffiliate: ReturnType<typeof publicAffiliateView> | null;
  trackingParametersPreserved: boolean;
  checkoutClassification: boolean;
  checkoutNavigated: false;
  sellerInformationDomain: string | null;
  commercialDestinationDomain: string | null;
  salesLandingPageFound: boolean;
  relatedHosts: RelatedHostEvidence[];
  classified: Array<Omit<UrlRoleReport, "url"> & { url: string }>;
  informationalPages: string[];
  blockedDestinations: string[];
  historicalFixtures: string[];
  commercialAuthorization: "BLOCKED";
  publicationReadiness: "BLOCKED";
  usedAsActiveCta: false;
  rootInspect: SafeInspectResult | null;
  httpAccessClaims: string[];
};

export async function resolveCampaignCommercialSources(
  campaignId: number,
  deps: { inspectRoot?: boolean; probe?: Parameters<typeof inspectNonCheckoutUrl>[1] } = {},
): Promise<CommercialResolution> {
  const provided = readUserProvidedAffiliateUrl(campaignId);
  const sources = readCampaignSources(campaignId);
  const classified = [
    ...sources.map((item) => redactReport(classifyUrlRoles(item.originalUrl))),
    ...(provided ? [redactReport(classifyUrlRoles(provided.originalUrl))] : []),
  ].filter((item, index, all) => all.findIndex((row) => row.url === item.url && row.roles.join() === item.roles.join()) === index);

  const informational = classified.filter((item) => item.roles.includes("SELLER_INFORMATION_PAGE") || item.roles.includes("AFFILIATE_RESOURCE_PAGE") || item.roles.includes("SALES_LANDING_PAGE"));
  const blocked = classified.filter((item) => item.checkout || !item.fetchable);
  const historical = classified.filter((item) => item.historicalFixture).map((item) => item.url);
  const infoHost = informational.find((item) => item.host && !item.checkout)?.host ?? null;
  const commercialHost = provided?.host ?? classified.find((item) => item.roles.includes("CHECKOUT_OR_ORDER_PAGE"))?.host ?? null;

  const related = infoHost && commercialHost ? [relatedHostEvidence(infoHost, commercialHost)] : [];
  const salesLandingPageFound = classified.some((item) => item.roles.includes("SALES_LANDING_PAGE") && item.fetchable);

  let rootInspect: SafeInspectResult | null = null;
  const httpAccessClaims: string[] = [];
  if (deps.inspectRoot && commercialHost) {
    rootInspect = await inspectNonCheckoutUrl(`https://${commercialHost}/`, deps.probe);
    if (rootInspect.accessed) httpAccessClaims.push(`Requested https://${commercialHost}/ only. Checkout paths were not opened.`);
    else httpAccessClaims.push(`Did not access checkout. ${rootInspect.reason}`);
  }

  return {
    campaignId,
    affiliateUrlRegistered: Boolean(provided),
    affiliateUrlSource: provided ? "USER_PROVIDED" : null,
    affiliateUrlVerification: provided ? provided.verificationStatus : null,
    publicAffiliate: provided ? publicAffiliateView(provided) : null,
    trackingParametersPreserved: Boolean(provided && Object.keys(provided.attribution).length),
    checkoutClassification: Boolean(provided && provided.roles.includes("CHECKOUT_OR_ORDER_PAGE")),
    checkoutNavigated: false,
    sellerInformationDomain: infoHost,
    commercialDestinationDomain: commercialHost,
    salesLandingPageFound,
    relatedHosts: related,
    classified,
    informationalPages: informational.filter((item) => item.fetchable).map((item) => item.url),
    blockedDestinations: blocked.map((item) => item.url),
    historicalFixtures: historical,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    usedAsActiveCta: false,
    rootInspect,
    httpAccessClaims,
  };
}

function redactReport(report: UrlRoleReport): Omit<UrlRoleReport, "url"> & { url: string } {
  return { ...report, url: sanitizeSharedUrl(report.url) };
}

export function campaignIntegritySnapshot(campaignId: number): {
  affiliateUrl: string;
  publicationStatus: string | null;
  acceptedFacts: Array<{ field: string; value: string; status: string }>;
  approvedAssets: Array<{ assetUrl: string; status: string; galleryKind: string | null }>;
  qualityStatus: string | null;
  qualityScore: number | null;
} {
  const campaign = getCampaignById(campaignId);
  const research = snapshotProductResearch(campaignId);
  const quality = readLatestQualityAssessment(campaignId);
  return {
    affiliateUrl: campaign?.affiliateUrl ?? "",
    publicationStatus: campaign?.publicationStatus ?? null,
    acceptedFacts: acceptedProposals(research.latest).map((item) => ({
      field: item.field,
      value: item.suggestedValue || item.currentValue,
      status: item.status,
    })),
    approvedAssets: (research.latest?.discoveredAssets ?? [])
      .filter((item) => item.status === "USER_APPROVED")
      .map((item) => ({ assetUrl: item.assetUrl, status: item.status, galleryKind: item.galleryKind ?? null })),
    qualityStatus: quality?.assessmentStatus ?? null,
    qualityScore: quality?.overallScore ?? null,
  };
}
