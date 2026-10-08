/**
 * Host record domain: responsive search ad publisher.
 *
 * One entry point from an existing ad draft and a published paused ad group
 * to a frozen paused ad resource. A refused run stores nothing. A draft is
 * sent at most once. This method never throws.
 */
import { buildRsaMutateBody, type RsaMutateBody } from "./asset-builder";
import { GOOGLE_ADS_API_VERSION, createGoogleAuthHttpClient, googleAdsRequestHeaders, googleAdsRoot, isGoogleAuthRecord, parseGoogleAuthJson, type GoogleAuthTransport } from "./google-auth-client";
import type { PublishIssue, PublishMetadata, PublishedAdGroup, PublishedCampaignRef, RsaDraft, RsaPublishResult, RsaPublishSnapshot } from "./publisher-context";
import {
  copyPublishedCampaign,
  copyRsaDraft,
  createPublishStatistics,
  createPublisherValidator,
  createRsaPublishSnapshot,
  freezeDeepPublish,
  isPolicyApprovalStatus,
  isPolicyReviewStatus,
  type PublisherValidator,
} from "./publisher-validator";

export type RsaPublishClock = () => number;
export type RsaPublishTimestamp = () => string;
export type RsaPublishIdFactory = () => string;

export interface RsaPublisherOptions {
  now?: RsaPublishClock;
  timestamp?: RsaPublishTimestamp;
  idFactory?: RsaPublishIdFactory;
  transport?: GoogleAuthTransport;
  validator?: PublisherValidator;
  apiVersion?: string;
}

export interface RsaPublisher {
  readonly validator: PublisherValidator;
  publish(input: unknown): Promise<RsaPublishResult>;
  getSnapshot(publishId: string): RsaPublishSnapshot | null;
}

const AD_RESOURCE = /^customers\/\d+\/adGroupAds\/\d+~(\d+)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function accountFailure(httpStatus: number): PublishIssue | null {
  if (httpStatus !== 200) return { field: "rsaDraft", message: "API Errors: the account service refused the ad operation." };
  return null;
}

function requestHeaders(accessToken: string): Record<string, string> {
  return googleAdsRequestHeaders(accessToken, true);
}

function copyPublishedAdGroup(adGroup: PublishedAdGroup): PublishedAdGroup {
  return {
    draftId: adGroup.draftId.trim(),
    customerId: adGroup.customerId.trim(),
    campaignResourceName: adGroup.campaignResourceName.trim(),
    resourceName: adGroup.resourceName.trim(),
    adGroupId: adGroup.adGroupId.trim(),
    status: "PAUSED",
    publishedAt: adGroup.publishedAt,
  };
}

export function createRsaPublisher(options: RsaPublisherOptions = {}): RsaPublisher {
  const validator = options.validator ?? createPublisherValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `rsa-publish-${++serial}`);
  const apiVersion = options.apiVersion ?? GOOGLE_ADS_API_VERSION;
  const client = createGoogleAuthHttpClient(options.transport);
  const snapshots = new Map<string, RsaPublishSnapshot>();
  const publishedDrafts = new Set<string>();

  return {
    validator,
    async publish(input) {
      const started = now();
      const refused = (issues: PublishIssue[], metadata: PublishMetadata = {}): RsaPublishResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepPublish({
          status: "REJECTED",
          issues,
          publishedRsa: null,
          apiResponse: null,
          statistics: createPublishStatistics({ requestCount: 0, operationCount: 0, publishedCount: 0, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateRsaInput(input);
        if (issues.length > 0 || !isRecord(input) || !isRecord(input.rsaDraft) || !isRecord(input.session) || !isRecord(input.publishedCampaign) || !isRecord(input.publishedAdGroup)) {
          return refused(issues);
        }
        const draft = copyRsaDraft(input.rsaDraft as unknown as RsaDraft);
        const campaign = copyPublishedCampaign(input.publishedCampaign as unknown as PublishedCampaignRef);
        const adGroup = copyPublishedAdGroup(input.publishedAdGroup as unknown as PublishedAdGroup);
        const metadata = isRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as PublishMetadata) : {};
        if (publishedDrafts.has(draft.draftId)) {
          return refused([{ field: "rsaDraft.draftId", message: "Duplicate Assets: this responsive search ad draft was already published." }], metadata);
        }
        const body: RsaMutateBody = buildRsaMutateBody(adGroup.resourceName, draft);
        const payload = JSON.stringify(body);
        if (payload.includes('"status":"ENABLED"') || payload.includes('"status":"REMOVED"')) {
          return refused([{ field: "rsaDraft.status", message: "Invalid RSA Draft: the only accepted status is PAUSED." }], metadata);
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
        const mutateRefused = accountFailure(mutated.httpStatus);
        if (mutateRefused) return refused([mutateRefused], metadata);
        if (!isGoogleAuthRecord(mutateParsed) || !Array.isArray(mutateParsed.mutateOperationResponses)) {
          return refused([{ field: "rsaDraft", message: "API Errors: the account service did not return an ad resource." }], metadata);
        }
        let resourceName = "";
        for (const row of mutateParsed.mutateOperationResponses) {
          if (!isGoogleAuthRecord(row) || !isGoogleAuthRecord(row.adGroupAdResult) || typeof row.adGroupAdResult.resourceName !== "string") continue;
          resourceName = row.adGroupAdResult.resourceName.trim();
        }
        const adMatch = AD_RESOURCE.exec(resourceName);
        if (adMatch === null || !resourceName.startsWith(`customers/${campaign.customerId}/adGroupAds/${adGroup.adGroupId}~`)) {
          return refused([{ field: "rsaDraft", message: "API Errors: the account service did not return an ad resource." }], metadata);
        }
        publishedDrafts.add(draft.draftId);
        const query = `SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.resource_name, ad_group_ad.policy_summary.review_status, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ad_group_ad.resource_name = '${resourceName}'`;
        const observed = await client.send({
          url: `${googleAdsRoot(apiVersion)}/customers/${campaign.customerId}/googleAds:search`,
          method: "POST",
          headers,
          body: JSON.stringify({ query }),
        });
        const observedParsed = parseGoogleAuthJson(observed.bodyText);
        const observedRefused = accountFailure(observed.httpStatus);
        if (observedRefused) return refused([observedRefused], metadata);
        if (!isGoogleAuthRecord(observedParsed) || !Array.isArray(observedParsed.results) || observedParsed.results.length === 0) {
          return refused([{ field: "rsaDraft", message: "API Errors: the account service did not return the ad status." }], metadata);
        }
        const row = observedParsed.results[0];
        if (!isGoogleAuthRecord(row) || !isGoogleAuthRecord(row.adGroupAd) || row.adGroupAd.resourceName !== resourceName || row.adGroupAd.status !== "PAUSED") {
          return refused([{ field: "rsaDraft.status", message: `API Errors: the ad ${resourceName} was not paused.` }], metadata);
        }
        const policy = isGoogleAuthRecord(row.adGroupAd.policySummary) ? row.adGroupAd.policySummary : null;
        const policyReviewStatus = policy?.reviewStatus;
        const approvalStatus = policy?.approvalStatus;
        if (!isPolicyReviewStatus(policyReviewStatus) || !isPolicyApprovalStatus(approvalStatus)) {
          return refused([{ field: "rsaDraft", message: "API Errors: the account service did not return the policy review status." }], metadata);
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
        const snapshot = createRsaPublishSnapshot({
          publishId,
          publishedRsa: {
            draftId: draft.draftId,
            customerId: campaign.customerId,
            campaignResourceName: campaign.resourceName,
            adGroupResourceName: adGroup.resourceName,
            resourceName,
            adId: adMatch[1] ?? "",
            status: "PAUSED",
            policyReviewStatus,
            approvalStatus,
            publishedAt: createdAt,
          },
          apiResponse: {
            httpStatus: mutated.httpStatus,
            adResourceName: resourceName,
            observedStatus: "PAUSED",
            policyReviewStatus,
            approvalStatus,
          },
          statistics,
          context: {
            draftId: draft.draftId,
            customerId: campaign.customerId,
            campaignResourceName: campaign.resourceName,
            adGroupResourceName: adGroup.resourceName,
          },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateRsaSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.publishId, snapshot);
        return freezeDeepPublish({
          status: "OK",
          issues: [],
          publishedRsa: snapshot.publishedRsa,
          apiResponse: snapshot.apiResponse,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "rsaDraft", message: "API Errors: the ad operation could not be restated." }]);
      }
    },
    getSnapshot: (publishId) => snapshots.get(publishId) ?? null,
  };
}
