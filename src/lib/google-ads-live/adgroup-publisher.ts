/**
 * Host record domain: ad group publisher.
 *
 * One entry point from an existing ad group draft and a published paused
 * campaign to a frozen paused ad group resource. A refused run stores
 * nothing. A draft is sent at most once. This method never throws.
 */
import { buildAdGroupMutateBody, type AdGroupMutateBody } from "./asset-builder";
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, googleAdsRequestHeaders, googleAdsRoot, isGoogleAuthRecord, parseGoogleAuthJson, type GoogleAuthTransport } from "./google-auth-client";
import type { AdGroupDraft, PublishMetadata, PublishedCampaignRef } from "./publisher-context";
import {
  copyAdGroupDraft,
  copyPublishedCampaign,
  createAdGroupPublishSnapshot,
  createPublishStatistics,
  freezeDeepPublish,
  type PublisherValidator,
  createPublisherValidator,
} from "./publisher-validator";
import type { AdGroupPublishResult, AdGroupPublishSnapshot, PublishIssue } from "./publisher-context";

export type AdGroupPublishClock = () => number;
export type AdGroupPublishTimestamp = () => string;
export type AdGroupPublishIdFactory = () => string;

export interface AdGroupPublisherOptions {
  now?: AdGroupPublishClock;
  timestamp?: AdGroupPublishTimestamp;
  idFactory?: AdGroupPublishIdFactory;
  transport?: GoogleAuthTransport;
  validator?: PublisherValidator;
  apiVersion?: string;
}

export interface AdGroupPublisher {
  readonly validator: PublisherValidator;
  publish(input: unknown): Promise<AdGroupPublishResult>;
  getSnapshot(publishId: string): AdGroupPublishSnapshot | null;
}

const AD_GROUP_RESOURCE = /^customers\/\d+\/adGroups\/(\d+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringCodes(value: unknown): string[] {
  const found: string[] = [];
  const visit = (inner: unknown): void => {
    if (typeof inner === "string") {
      found.push(inner);
      return;
    }
    if (Array.isArray(inner)) {
      for (const item of inner) visit(item);
      return;
    }
    if (isGoogleAuthRecord(inner)) {
      for (const child of Object.values(inner)) visit(child);
    }
  };
  visit(value);
  return found;
}

function accountFailure(parsed: unknown, httpStatus: number): PublishIssue | null {
  if (stringCodes(parsed).includes("DUPLICATE_ADGROUP_NAME")) {
    return { field: "adGroupDraft.name", message: "Duplicate Assets: the account service already has this ad group name." };
  }
  if (httpStatus !== 200) return { field: "adGroupDraft", message: "API Errors: the account service refused the ad group operation." };
  return null;
}

function requestHeaders(accessToken: string): Record<string, string> {
  return googleAdsRequestHeaders(accessToken, true);
}

export function createAdGroupPublisher(options: AdGroupPublisherOptions = {}): AdGroupPublisher {
  const validator = options.validator ?? createPublisherValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `adgroup-publish-${++serial}`);
  const apiVersion = options.apiVersion ?? GOOGLE_ADS_API_VERSION;
  const client = createGoogleAuthHttpClient(options.transport);
  const snapshots = new Map<string, AdGroupPublishSnapshot>();
  const publishedDrafts = new Set<string>();

  return {
    validator,
    async publish(input) {
      const started = now();
      const refused = (issues: PublishIssue[], metadata: PublishMetadata = {}): AdGroupPublishResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepPublish({
          status: "REJECTED",
          issues,
          publishedAdGroup: null,
          apiResponse: null,
          statistics: createPublishStatistics({ requestCount: 0, operationCount: 0, publishedCount: 0, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateAdGroupInput(input);
        if (issues.length > 0 || !isRecord(input) || !isRecord(input.adGroupDraft) || !isRecord(input.session) || !isRecord(input.publishedCampaign)) return refused(issues);
        const draft = copyAdGroupDraft(input.adGroupDraft as unknown as AdGroupDraft);
        const campaign = copyPublishedCampaign(input.publishedCampaign as unknown as PublishedCampaignRef);
        const metadata = isRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as PublishMetadata) : {};
        if (publishedDrafts.has(draft.draftId)) {
          return refused([{ field: "adGroupDraft.draftId", message: "Duplicate Assets: this ad group draft was already published." }], metadata);
        }
        const body: AdGroupMutateBody = buildAdGroupMutateBody(campaign.resourceName, draft);
        const payload = JSON.stringify(body);
        if (payload.includes('"status":"ENABLED"') || payload.includes('"status":"REMOVED"')) {
          return refused([{ field: "adGroupDraft.status", message: "Invalid Ad Group Draft: the only accepted status is PAUSED." }], metadata);
        }
        const accessToken = (input.session.accessToken as string).trim();
        const developerToken = typeof input.developerToken === "string" ? input.developerToken.trim() : "";
        const headers = requestHeaders(accessToken);
        const mutated = await client.send({
          url: `${googleAdsRoot(apiVersion)}/customers/${campaign.customerId}/googleAds:mutate`,
          method: "POST",
          headers,
          body: payload,
        });
        const mutateParsed = parseGoogleAuthJson(mutated.bodyText);
        const mutateRefused = accountFailure(mutateParsed, mutated.httpStatus);
        if (mutateRefused) return refused([mutateRefused], metadata);
        if (!isGoogleAuthRecord(mutateParsed) || !Array.isArray(mutateParsed.mutateOperationResponses)) {
          return refused([{ field: "adGroupDraft", message: "API Errors: the account service did not return an ad group resource." }], metadata);
        }
        let resourceName = "";
        for (const row of mutateParsed.mutateOperationResponses) {
          if (!isGoogleAuthRecord(row) || !isGoogleAuthRecord(row.adGroupResult) || typeof row.adGroupResult.resourceName !== "string") continue;
          resourceName = row.adGroupResult.resourceName.trim();
        }
        const adGroupMatch = AD_GROUP_RESOURCE.exec(resourceName);
        if (adGroupMatch === null || !resourceName.startsWith(`customers/${campaign.customerId}/`)) {
          return refused([{ field: "adGroupDraft", message: "API Errors: the account service did not return an ad group resource." }], metadata);
        }
        publishedDrafts.add(draft.draftId);
        const query = `SELECT ad_group.id, ad_group.status, ad_group.resource_name FROM ad_group WHERE ad_group.resource_name = '${resourceName}'`;
        const observed = await client.send({
          url: `${googleAdsRoot(apiVersion)}/customers/${campaign.customerId}/googleAds:search`,
          method: "POST",
          headers,
          body: JSON.stringify({ query }),
        });
        const observedParsed = parseGoogleAuthJson(observed.bodyText);
        const observedRefused = accountFailure(observedParsed, observed.httpStatus);
        if (observedRefused) return refused([observedRefused], metadata);
        if (!isGoogleAuthRecord(observedParsed) || !Array.isArray(observedParsed.results) || observedParsed.results.length === 0) {
          return refused([{ field: "adGroupDraft", message: "API Errors: the account service did not return the ad group status." }], metadata);
        }
        const row = observedParsed.results[0];
        if (!isGoogleAuthRecord(row) || !isGoogleAuthRecord(row.adGroup) || row.adGroup.resourceName !== resourceName || row.adGroup.status !== "PAUSED") {
          return refused([{ field: "adGroupDraft.status", message: `API Errors: the ad group ${resourceName} was not paused.` }], metadata);
        }
        const createdAt = timestamp();
        const publishId = idFactory();
        const executionTime = Math.max(0, now() - started);
        const statistics = createPublishStatistics({
          requestCount: 2,
          operationCount: body.mutateOperations.length,
          publishedCount: 1,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createAdGroupPublishSnapshot({
          publishId,
          publishedAdGroup: {
            draftId: draft.draftId,
            customerId: campaign.customerId,
            campaignResourceName: campaign.resourceName,
            resourceName,
            adGroupId: adGroupMatch[1] ?? "",
            status: "PAUSED",
            publishedAt: createdAt,
          },
          apiResponse: { httpStatus: mutated.httpStatus, adGroupResourceName: resourceName, observedStatus: "PAUSED" },
          statistics,
          context: { draftId: draft.draftId, customerId: campaign.customerId, campaignResourceName: campaign.resourceName },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateAdGroupSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.publishId, snapshot);
        return freezeDeepPublish({
          status: "OK",
          issues: [],
          publishedAdGroup: snapshot.publishedAdGroup,
          apiResponse: snapshot.apiResponse,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "adGroupDraft", message: "API Errors: the ad group operation could not be restated." }]);
      }
    },
    getSnapshot: (publishId) => snapshots.get(publishId) ?? null,
  };
}
