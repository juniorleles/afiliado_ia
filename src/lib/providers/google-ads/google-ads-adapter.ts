/**
 * Host record domain: Google Ads adapter.
 *
 * Turns a read-only campaign model, ad group model, RSA model, execution
 * plan, and metadata into one frozen request payload and snapshot. It maps,
 * validates, builds, and freezes. It never authenticates, never reaches an
 * outside system, and never sends a request. A refused input returns REJECTED
 * with issues and no payload.
 *
 * This adapter is not a transport layer and not an OAuth host.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyIdHolder,
  copyPlainGoogleAdsAdapter,
  createGoogleAdsAdapterSnapshot,
  freezeDeepGoogleAdsAdapter,
  type GoogleAdsAdapterSnapshot,
  type GoogleAdsRequestPayload,
} from "./google-ads-adapter-snapshot";
import { createGoogleAdsMapper, type GoogleAdsMapper } from "./google-ads-adapter-mapper";
import { createGoogleAdsRequestBuilder, type GoogleAdsRequestBuilder } from "./google-ads-adapter-request";
import { createGoogleAdsValidationAdapter, type GoogleAdsValidationAdapter } from "./google-ads-adapter-validator";

export const GOOGLE_ADS_ADAPTER_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsAdapterStatus = (typeof GOOGLE_ADS_ADAPTER_STATUSES)[number];

export type GoogleAdsAdapterClock = () => number;
export type GoogleAdsAdapterTimestamp = () => string;
export type GoogleAdsAdapterIdFactory = () => string;

export interface GoogleAdsAdapterInput {
  campaignModel: { id: string; campaigns?: readonly unknown[]; metadata?: GoogleAdsMetadata };
  adGroupModel?: { id: string; adGroups?: readonly unknown[]; metadata?: GoogleAdsMetadata } | null;
  responsiveSearchAds?: { id?: string; responsiveSearchAds?: readonly unknown[] } | readonly unknown[] | null;
  executionPlan?: { id: string } | null;
  executionContracts?: readonly { id: string }[];
  executionMetadata?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  configuration?: GoogleAdsMetadata;
}

export interface GoogleAdsAdapterResult {
  status: GoogleAdsAdapterStatus;
  issues: GoogleAdsIssue[];
  payload: GoogleAdsRequestPayload | null;
  snapshot: GoogleAdsAdapterSnapshot | null;
  metadata: GoogleAdsMetadata;
  executionTime: number;
}

export interface GoogleAdsAdapter {
  readonly mapper: GoogleAdsMapper;
  readonly requestBuilder: GoogleAdsRequestBuilder;
  readonly validator: GoogleAdsValidationAdapter;
  adapt(input: unknown): GoogleAdsAdapterResult;
  getSnapshot(payloadId: string): GoogleAdsAdapterSnapshot | null;
}

export interface GoogleAdsAdapterOptions {
  mapper?: GoogleAdsMapper;
  requestBuilder?: GoogleAdsRequestBuilder;
  validator?: GoogleAdsValidationAdapter;
  now?: GoogleAdsAdapterClock;
  timestamp?: GoogleAdsAdapterTimestamp;
  idFactory?: GoogleAdsAdapterIdFactory;
}

const defaultClock: GoogleAdsAdapterClock = () => performance.now();

function refused(issues: GoogleAdsIssue[]): GoogleAdsAdapterResult {
  return { status: "REJECTED", issues, payload: null, snapshot: null, metadata: {}, executionTime: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rsaIdOf(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const model = input.responsiveSearchAds;
  if (isRecord(model) && typeof model.id === "string") return model.id;
  return null;
}

export function createGoogleAdsAdapter(options: GoogleAdsAdapterOptions = {}): GoogleAdsAdapter {
  const mapper = options.mapper ?? createGoogleAdsMapper();
  const requestBuilder = options.requestBuilder ?? createGoogleAdsRequestBuilder();
  const validator = options.validator ?? createGoogleAdsValidationAdapter();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `payload-${++serial}`);
  const snapshots = new Map<string, GoogleAdsAdapterSnapshot>();

  return {
    mapper,
    requestBuilder,
    validator,
    adapt(input) {
      try {
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues);
        const draft = input as GoogleAdsAdapterInput;
        const start = now();
        const mapped = mapper.map(draft);
        if (mapped.issues.length > 0) return refused(mapped.issues);
        const createdAt = timestamp();
        const id = idFactory();
        const executionTime = Math.max(0, now() - start);
        const metadata = copyPlainGoogleAdsAdapter(draft.executionMetadata ?? {});
        const contractIds = [...(draft.executionContracts ?? [])]
          .map((item) => item.id)
          .filter((item, index, list) => list.indexOf(item) === index)
          .sort();
        const payload = requestBuilder.build({
          id,
          campaignModelId: copyIdHolder(draft.campaignModel)?.id ?? null,
          adGroupModelId: copyIdHolder(draft.adGroupModel)?.id ?? null,
          rsaModelId: rsaIdOf(draft),
          executionPlanId: copyIdHolder(draft.executionPlan)?.id ?? null,
          executionContractIds: contractIds,
          mapping: mapped.mapping,
          metadata,
          executionTime,
          createdAt,
        });
        const resourceIds = [
          ...payload.campaignRequests.map((item) => item.id),
          ...payload.campaignBudgetRequests.map((item) => item.id),
          ...payload.campaignSettingsRequests.map((item) => item.id),
          ...payload.adGroupRequests.map((item) => item.id),
          ...payload.keywordRequests.map((item) => item.id),
          ...payload.responsiveSearchAdRequests.map((item) => item.id),
          ...payload.trackingRequests.map((item) => item.id),
        ];
        const snapshot = createGoogleAdsAdapterSnapshot({
          payloadId: id,
          campaignModelId: payload.campaignModelId,
          adGroupModelId: payload.adGroupModelId,
          rsaModelId: payload.rsaModelId,
          executionPlanId: payload.executionPlanId,
          resourceIds,
          createdAt,
          metadata,
        });
        const payloadIssues = [...validator.validatePayload(payload), ...validator.validateSnapshot(snapshot)];
        if (payloadIssues.length > 0) return refused(payloadIssues);
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          payload: freezeDeepGoogleAdsAdapter(payload),
          snapshot,
          metadata: payload.metadata,
          executionTime,
        };
      } catch (error) {
        return refused([{ field: "adapter", message: error instanceof Error ? error.message : "Invalid Mapping: the adapter could not map the models." }]);
      }
    },
    getSnapshot: (payloadId) => snapshots.get(payloadId) ?? null,
  };
}
