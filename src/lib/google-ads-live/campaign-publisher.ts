/**
 * Host record domain: campaign publisher.
 *
 * One entry point from an existing draft and an authenticated session to a
 * frozen paused campaign resource. A refused run stores nothing. A draft is
 * sent at most once. This method never throws.
 */
import type { CampaignDraft, CampaignPublishMetadata } from "./campaign-publisher-context";
import { buildCampaignMutateBody } from "./campaign-operation-builder";
import { createCampaignPublisherClient } from "./campaign-publisher-client";
import {
  createCampaignPublishSnapshot,
  createCampaignPublishStatistics,
  freezeDeepCampaignPublish,
  type CampaignPublishResult,
  type CampaignPublishSnapshot,
} from "./campaign-publisher-session";
import { createCampaignPublishValidator, type CampaignPublishValidator } from "./campaign-publisher-validator";
import { GOOGLE_ADS_API_VERSION, type GoogleAuthTransport } from "./google-auth-client";

export type CampaignPublishClock = () => number;
export type CampaignPublishTimestamp = () => string;
export type CampaignPublishIdFactory = () => string;

export interface CampaignPublisherOptions {
  now?: CampaignPublishClock;
  timestamp?: CampaignPublishTimestamp;
  idFactory?: CampaignPublishIdFactory;
  transport?: GoogleAuthTransport;
  validator?: CampaignPublishValidator;
  apiVersion?: string;
}

export interface CampaignPublisher {
  readonly validator: CampaignPublishValidator;
  publish(input: unknown): Promise<CampaignPublishResult>;
  getSnapshot(publishId: string): CampaignPublishSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createCampaignPublisher(options: CampaignPublisherOptions = {}): CampaignPublisher {
  const validator = options.validator ?? createCampaignPublishValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `campaign-publish-${++serial}`);
  const apiVersion = options.apiVersion ?? GOOGLE_ADS_API_VERSION;
  const client = createCampaignPublisherClient(options.transport);
  const snapshots = new Map<string, CampaignPublishSnapshot>();
  const publishedDrafts = new Set<string>();

  return {
    validator,
    async publish(input) {
      const started = now();
      const refused = (issues: CampaignPublishResult["issues"], metadata: CampaignPublishMetadata = {}): CampaignPublishResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepCampaignPublish({
          status: "REJECTED",
          issues,
          publishedCampaign: null,
          apiResponse: null,
          statistics: createCampaignPublishStatistics({
            requestCount: 0,
            operationCount: 0,
            publishedCount: 0,
            issueCount: issues.length,
            executionTime,
          }),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input) || !isRecord(input.draft) || !isRecord(input.session)) return refused(issues);
        const draft = input.draft as unknown as CampaignDraft;
        const draftId = draft.draftId.trim();
        const customerId = (input.customerId as string).trim();
        const metadata = isRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as CampaignPublishMetadata) : {};
        if (publishedDrafts.has(draftId)) {
          return refused([{ field: "draft.draftId", message: "Duplicate Campaign: this draft was already published." }], metadata);
        }
        const body = buildCampaignMutateBody(customerId, {
          draftId,
          name: draft.name.trim(),
          budgetName: draft.budgetName.trim(),
          status: "PAUSED",
          channelType: "SEARCH",
          amountMicros: draft.amountMicros,
          deliveryMethod: "STANDARD",
          bidding: "MANUAL_CPC",
          targetGoogleSearch: draft.targetGoogleSearch,
          targetSearchNetwork: draft.targetSearchNetwork,
          targetContentNetwork: draft.targetContentNetwork,
        });
        const payload = JSON.stringify(body);
        if (payload.includes("ENABLED")) {
          return refused([{ field: "draft.status", message: "Invalid Campaign Draft: the only accepted status is PAUSED." }], metadata);
        }
        const accessToken = (input.session.accessToken as string).trim();
        const developerToken = (input.developerToken as string).trim();
        const mutated = await client.mutate(apiVersion, customerId, developerToken, accessToken, body);
        if (!mutated.ok) return refused(mutated.issues, metadata);
        publishedDrafts.add(draftId);
        const observed = await client.readStatus(apiVersion, customerId, developerToken, accessToken, mutated.capture.campaignResourceName);
        if (!observed.ok) return refused(observed.issues, metadata);
        const createdAt = timestamp();
        const publishId = idFactory();
        const executionTime = Math.max(0, now() - started);
        const statistics = createCampaignPublishStatistics({
          requestCount: 2,
          operationCount: body.mutateOperations.length,
          publishedCount: 1,
          issueCount: 0,
          executionTime,
        });
        const snapshot = createCampaignPublishSnapshot({
          publishId,
          publishedCampaign: {
            draftId,
            customerId,
            resourceName: mutated.capture.campaignResourceName,
            campaignId: mutated.capture.campaignId,
            status: "PAUSED",
            publishedAt: createdAt,
          },
          apiResponse: {
            httpStatus: mutated.capture.httpStatus,
            budgetResourceName: mutated.capture.budgetResourceName,
            campaignResourceName: mutated.capture.campaignResourceName,
            observedStatus: observed.capture.observedStatus,
          },
          statistics,
          context: { draftId, customerId },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.publishId, snapshot);
        return freezeDeepCampaignPublish({
          status: "OK",
          issues: [],
          publishedCampaign: snapshot.publishedCampaign,
          apiResponse: snapshot.apiResponse,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "draft", message: "API Errors: the campaign operation could not be restated." }]);
      }
    },
    getSnapshot: (publishId) => snapshots.get(publishId) ?? null,
  };
}
