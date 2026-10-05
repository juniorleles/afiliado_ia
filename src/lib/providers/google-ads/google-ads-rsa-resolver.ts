/**
 * Host record domain: responsive search ad resolver.
 *
 * Attaches headlines, descriptions, final URL, display path, tracking
 * template, URL suffix, and optional pinned assets to each RSA spec. It also
 * names missing headlines, missing descriptions, invalid final URLs, and
 * duplicate lines. It attaches and nothing else: invalid graphs are reported,
 * never repaired.
 *
 * It does not reach an outside system, authenticate, upload an asset, or send
 * a record. It does not change the campaign model or ad group model it reads.
 */
import type { GoogleAdsDescription, GoogleAdsFinalUrl, GoogleAdsHeadline, GoogleAdsMetadata, GoogleAdsTrackingTemplate } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import type {
  GoogleAdsDisplayPath,
  GoogleAdsPinnedAsset,
  GoogleAdsRsaAdGroupRef,
  GoogleAdsRsaCampaignRef,
  GoogleAdsRsaNamedRecordSpec,
  GoogleAdsRsaSpec,
  GoogleAdsRsaTextSpec,
  GoogleAdsRsaUrlSpec,
  GoogleAdsUrlSuffix,
} from "./google-ads-rsa-snapshot";
import { copyPlainGoogleAdsRsa } from "./google-ads-rsa-snapshot";
import { createGoogleAdsRsaValidator, isWellFormedFinalUrl } from "./google-ads-rsa-validator";

export interface GoogleAdsRsaResolveInput {
  campaignModel?: GoogleAdsRsaCampaignRef | null;
  adGroupModel?: GoogleAdsRsaAdGroupRef | null;
  responsiveSearchAds: readonly GoogleAdsRsaSpec[];
  headlines?: readonly GoogleAdsRsaTextSpec[];
  descriptions?: readonly GoogleAdsRsaTextSpec[];
  finalUrls?: readonly GoogleAdsRsaUrlSpec[];
  displayPaths?: readonly GoogleAdsRsaTextSpec[];
  trackingTemplates?: readonly GoogleAdsRsaTextSpec[];
  urlSuffixes?: readonly GoogleAdsRsaTextSpec[];
  pinnedAssets?: readonly GoogleAdsRsaNamedRecordSpec[];
}

export interface GoogleAdsResolvedRsa {
  spec: GoogleAdsRsaSpec;
  headlines: GoogleAdsHeadline[];
  descriptions: GoogleAdsDescription[];
  finalUrl: GoogleAdsFinalUrl | null;
  displayPath: GoogleAdsDisplayPath | null;
  trackingTemplate: GoogleAdsTrackingTemplate | null;
  urlSuffix: GoogleAdsUrlSuffix | null;
  pinnedAssets: GoogleAdsPinnedAsset[];
  warnings: string[];
}

export interface GoogleAdsRsaResolution {
  ads: GoogleAdsResolvedRsa[];
  issues: GoogleAdsIssue[];
  warnings: string[];
}

export interface GoogleAdsRsaResolver {
  resolve(input: GoogleAdsRsaResolveInput): GoogleAdsRsaResolution;
  detectDuplicates(ads: readonly GoogleAdsRsaSpec[], headlines?: readonly GoogleAdsRsaTextSpec[], descriptions?: readonly GoogleAdsRsaTextSpec[]): GoogleAdsIssue[];
}

function textMap(records: readonly GoogleAdsRsaTextSpec[] | undefined): Map<string, GoogleAdsRsaTextSpec> {
  return new Map((records ?? []).map((item) => [item.id, item]));
}

function urlMap(records: readonly GoogleAdsRsaUrlSpec[] | undefined): Map<string, GoogleAdsRsaUrlSpec> {
  return new Map((records ?? []).map((item) => [item.id, item]));
}

function namedMap(records: readonly GoogleAdsRsaNamedRecordSpec[] | undefined): Map<string, GoogleAdsRsaNamedRecordSpec> {
  return new Map((records ?? []).map((item) => [item.id, item]));
}

function textRecord(item: GoogleAdsRsaTextSpec): { id: string; text: string; metadata: GoogleAdsMetadata } {
  return copyPlainGoogleAdsRsa({ id: item.id, text: item.text, metadata: item.metadata ?? {} });
}

function adGroupIdsOf(model: GoogleAdsRsaAdGroupRef | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!model) return ids;
  for (const id of model.adGroupIds ?? []) ids.add(id);
  for (const item of model.adGroups ?? []) ids.add(item.id);
  return ids;
}

function detectDuplicates(
  ads: readonly GoogleAdsRsaSpec[],
  headlines: readonly GoogleAdsRsaTextSpec[] = [],
  descriptions: readonly GoogleAdsRsaTextSpec[] = [],
): GoogleAdsIssue[] {
  const validator = createGoogleAdsRsaValidator();
  return [
    ...validator.validateHeadlineGraph(headlines.map((item) => item.id), headlines.map((item) => item.text)),
    ...validator.validateDescriptionGraph(descriptions.map((item) => item.id), descriptions.map((item) => item.text)),
    ...ads.flatMap((item) => [
      ...validator.validateHeadlineGraph(item.headlineIds),
      ...validator.validateDescriptionGraph(item.descriptionIds),
    ]),
  ];
}

function resolve(input: GoogleAdsRsaResolveInput): GoogleAdsRsaResolution {
  const issues: GoogleAdsIssue[] = [...detectDuplicates(input.responsiveSearchAds, input.headlines ?? [], input.descriptions ?? [])];
  const listedGroups = adGroupIdsOf(input.adGroupModel);
  const headlines = textMap(input.headlines);
  const descriptions = textMap(input.descriptions);
  const finalUrls = urlMap(input.finalUrls);
  const displayPaths = textMap(input.displayPaths);
  const trackingTemplates = textMap(input.trackingTemplates);
  const urlSuffixRecords = textMap(input.urlSuffixes);
  const pinnedAssets = namedMap(input.pinnedAssets);
  const ordered = [...input.responsiveSearchAds].sort((a, b) => a.id.localeCompare(b.id));
  const ads: GoogleAdsResolvedRsa[] = [];
  const warnings: string[] = [];

  for (const spec of ordered) {
    if (listedGroups.size > 0 && !listedGroups.has(spec.adGroupId)) {
      issues.push({ field: "adGroupId", message: `Missing Headline: RSA "${spec.id}" names ad group "${spec.adGroupId}", which is not listed.` });
    }
    const resolvedHeadlines: GoogleAdsHeadline[] = [];
    for (const id of spec.headlineIds) {
      const item = headlines.get(id);
      if (!item) issues.push({ field: "headlineIds", message: `Missing Headline: RSA "${spec.id}" names "${id}", which is not listed.` });
      else resolvedHeadlines.push(textRecord(item));
    }
    if (spec.headlineIds.length === 0) issues.push({ field: "headlineIds", message: `Missing Headline: RSA "${spec.id}" has no headlines.` });
    const resolvedDescriptions: GoogleAdsDescription[] = [];
    for (const id of spec.descriptionIds) {
      const item = descriptions.get(id);
      if (!item) issues.push({ field: "descriptionIds", message: `Missing Description: RSA "${spec.id}" names "${id}", which is not listed.` });
      else resolvedDescriptions.push(textRecord(item));
    }
    if (spec.descriptionIds.length === 0) issues.push({ field: "descriptionIds", message: `Missing Description: RSA "${spec.id}" has no descriptions.` });

    const urlItem = finalUrls.get(spec.finalUrlId);
    let finalUrl: GoogleAdsFinalUrl | null = null;
    if (!urlItem) {
      issues.push({ field: "finalUrlId", message: `Invalid Final URL: RSA "${spec.id}" names "${spec.finalUrlId}", which is not listed.` });
    } else if (!isWellFormedFinalUrl(urlItem.url)) {
      issues.push({ field: "finalUrl", message: `Invalid Final URL: RSA "${spec.id}" names a destination that is not a well-formed https address.` });
    } else {
      finalUrl = copyPlainGoogleAdsRsa({ id: urlItem.id, url: urlItem.url, metadata: urlItem.metadata ?? {} });
    }

    let displayPath: GoogleAdsDisplayPath | null = null;
    if (spec.displayPathId) {
      const item = displayPaths.get(spec.displayPathId);
      if (!item) issues.push({ field: "displayPathId", message: `Invalid Final URL: RSA "${spec.id}" names display path "${spec.displayPathId}", which is not listed.` });
      else displayPath = textRecord(item);
    }
    let trackingTemplate: GoogleAdsTrackingTemplate | null = null;
    if (spec.trackingTemplateId) {
      const item = trackingTemplates.get(spec.trackingTemplateId);
      if (!item) issues.push({ field: "trackingTemplateId", message: `Invalid Final URL: RSA "${spec.id}" names tracking template "${spec.trackingTemplateId}", which is not listed.` });
      else trackingTemplate = textRecord(item);
    }
    let urlSuffix: GoogleAdsUrlSuffix | null = null;
    if (spec.urlSuffixId) {
      const item = urlSuffixRecords.get(spec.urlSuffixId);
      if (!item) issues.push({ field: "urlSuffixId", message: `Invalid Final URL: RSA "${spec.id}" names URL suffix "${spec.urlSuffixId}", which is not listed.` });
      else urlSuffix = textRecord(item);
    }
    const resolvedPinned: GoogleAdsPinnedAsset[] = [];
    for (const id of [...(spec.pinnedAssetIds ?? [])].sort()) {
      const item = pinnedAssets.get(id);
      if (!item) issues.push({ field: "pinnedAssetIds", message: `Invalid Final URL: RSA "${spec.id}" names pinned asset "${id}", which is not listed.` });
      else resolvedPinned.push(copyPlainGoogleAdsRsa({ id: item.id, name: item.name, metadata: item.metadata ?? {} }));
    }

    issues.push(...createGoogleAdsRsaValidator().validateHeadlineGraph(resolvedHeadlines.map((item) => item.id), resolvedHeadlines.map((item) => item.text)));
    issues.push(...createGoogleAdsRsaValidator().validateDescriptionGraph(resolvedDescriptions.map((item) => item.id), resolvedDescriptions.map((item) => item.text)));

    const specWarnings = [...(spec.warnings ?? [])];
    warnings.push(...specWarnings);
    ads.push({
      spec: copyPlainGoogleAdsRsa(spec),
      headlines: resolvedHeadlines,
      descriptions: resolvedDescriptions,
      finalUrl,
      displayPath,
      trackingTemplate,
      urlSuffix,
      pinnedAssets: resolvedPinned,
      warnings: specWarnings,
    });
  }

  if (issues.length > 0) return { ads: [], issues, warnings: [] };
  return { ads, issues: [], warnings };
}

export function createGoogleAdsRsaResolver(): GoogleAdsRsaResolver {
  return {
    resolve,
    detectDuplicates,
  };
}
