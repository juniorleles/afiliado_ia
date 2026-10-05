/**
 * Host record domain: ad group builder.
 *
 * Turns a read-only campaign model, execution plan, execution contracts,
 * Decision Analysis, workflow snapshot, and named records into one frozen ad
 * group model, a snapshot, statistics, warnings, metadata, and an execution
 * time. It never reaches an outside system, never authenticates, and never
 * sends a record. A refused input returns REJECTED with issues and no model.
 *
 * This builder does not change the campaign model it reads. It is not the
 * host provider contract and not a Responsive Search Ad builder.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyIdHolder,
  copyPlainGoogleAdsAdGroup,
  createGoogleAdsAdGroupSnapshot,
  freezeDeepGoogleAdsAdGroup,
  type GoogleAdsAdGroupCampaignRef,
  type GoogleAdsAdGroupModel,
  type GoogleAdsAdGroupNamedRecordSpec,
  type GoogleAdsAdGroupSnapshot,
  type GoogleAdsAdGroupSpec,
  type GoogleAdsBuiltAdGroup,
  type GoogleAdsKeywordSpec,
  type GoogleAdsNegativeKeywordSpec,
} from "./google-ads-ad-group-snapshot";
import { computeGoogleAdsAdGroupStatistics, type GoogleAdsAdGroupStatistics } from "./google-ads-ad-group-statistics";
import { createGoogleAdsAdGroupResolver, type GoogleAdsAdGroupResolver } from "./google-ads-ad-group-resolver";
import { createGoogleAdsAdGroupValidator, type GoogleAdsAdGroupValidator } from "./google-ads-ad-group-validator";

export const GOOGLE_ADS_AD_GROUP_BUILD_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsAdGroupBuildStatus = (typeof GOOGLE_ADS_AD_GROUP_BUILD_STATUSES)[number];

export type GoogleAdsAdGroupClock = () => number;
export type GoogleAdsAdGroupTimestamp = () => string;
export type GoogleAdsAdGroupIdFactory = () => string;

export interface GoogleAdsAdGroupBuilderInput {
  campaignModel: GoogleAdsAdGroupCampaignRef;
  executionPlan?: { id: string } | null;
  executionContracts?: readonly { id: string }[];
  decisionAnalysis?: { id: string } | null;
  workflowSnapshot?: { id: string } | null;
  executionMetadata?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  configuration?: GoogleAdsMetadata;
  adGroups: readonly GoogleAdsAdGroupSpec[];
  defaultBids?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  bidStrategies?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  targetCpas?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  targetRoas?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  keywords?: readonly GoogleAdsKeywordSpec[];
  negativeKeywords?: readonly GoogleAdsNegativeKeywordSpec[];
  audiences?: readonly GoogleAdsAdGroupNamedRecordSpec[];
  devices?: readonly GoogleAdsAdGroupNamedRecordSpec[];
}

export interface GoogleAdsAdGroupBuildResult {
  status: GoogleAdsAdGroupBuildStatus;
  issues: GoogleAdsIssue[];
  model: GoogleAdsAdGroupModel | null;
  snapshot: GoogleAdsAdGroupSnapshot | null;
  statistics: GoogleAdsAdGroupStatistics | null;
  warnings: readonly string[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
}

export interface GoogleAdsAdGroupBuilder {
  readonly validator: GoogleAdsAdGroupValidator;
  readonly resolver: GoogleAdsAdGroupResolver;
  validate(input: unknown): GoogleAdsIssue[];
  build(input: unknown): GoogleAdsAdGroupBuildResult;
  getSnapshot(adGroupModelId: string): GoogleAdsAdGroupSnapshot | null;
}

export interface GoogleAdsAdGroupBuilderOptions {
  validator?: GoogleAdsAdGroupValidator;
  resolver?: GoogleAdsAdGroupResolver;
  now?: GoogleAdsAdGroupClock;
  timestamp?: GoogleAdsAdGroupTimestamp;
  idFactory?: GoogleAdsAdGroupIdFactory;
}

const defaultClock: GoogleAdsAdGroupClock = () => performance.now();

function refused(issues: GoogleAdsIssue[]): GoogleAdsAdGroupBuildResult {
  return { status: "REJECTED", issues, model: null, snapshot: null, statistics: null, warnings: [], metadata: {}, executionTime: 0 };
}

export function createGoogleAdsAdGroupBuilder(options: GoogleAdsAdGroupBuilderOptions = {}): GoogleAdsAdGroupBuilder {
  const validator = options.validator ?? createGoogleAdsAdGroupValidator();
  const resolver = options.resolver ?? createGoogleAdsAdGroupResolver();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `adgroup-${++serial}`);
  const snapshots = new Map<string, GoogleAdsAdGroupSnapshot>();

  const extraIssues = (input: GoogleAdsAdGroupBuilderInput): GoogleAdsIssue[] => resolver.resolve(input).issues;

  return {
    validator,
    resolver,
    validate(input) {
      const issues = validator.validateInput(input);
      if (issues.length > 0 || !input || typeof input !== "object") return issues;
      return [...issues, ...extraIssues(input as GoogleAdsAdGroupBuilderInput)];
    },
    build(input) {
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues);
        const draft = input as GoogleAdsAdGroupBuilderInput;
        const resolved = resolver.resolve(draft);
        if (resolved.issues.length > 0) return refused(resolved.issues);

        const start = now();
        const adGroups: GoogleAdsBuiltAdGroup[] = resolved.adGroups.map((item) => ({
          id: item.spec.id,
          name: item.spec.name,
          campaignId: item.spec.campaignId,
          defaultBid: item.defaultBid!,
          targetCpa: item.targetCpa,
          targetRoas: item.targetRoas,
          keywords: item.keywords,
          negativeKeywords: item.negativeKeywords,
          audiences: item.audiences,
          devices: item.devices,
          bidStrategy: item.bidStrategy!,
          metadata: copyPlainGoogleAdsAdGroup(item.spec.metadata ?? {}),
        }));
        const contractIds = [...(draft.executionContracts ?? [])]
          .map((item) => item.id)
          .filter((id, index, list) => list.indexOf(id) === index)
          .sort();
        const metadata = copyPlainGoogleAdsAdGroup(draft.executionMetadata ?? {});
        const createdAt = timestamp();
        const id = idFactory();
        const executionTime = Math.max(0, now() - start);
        const warnings = copyPlainGoogleAdsAdGroup(resolved.warnings);
        const model = freezeDeepGoogleAdsAdGroup({
          id,
          campaignModelId: copyIdHolder(draft.campaignModel)?.id ?? null,
          executionPlanId: copyIdHolder(draft.executionPlan)?.id ?? null,
          executionContractIds: contractIds,
          decisionAnalysisId: copyIdHolder(draft.decisionAnalysis)?.id ?? null,
          workflowSnapshotId: copyIdHolder(draft.workflowSnapshot)?.id ?? null,
          adGroups,
          warnings,
          metadata,
          executionTime,
          createdAt,
        });
        const snapshot = createGoogleAdsAdGroupSnapshot({
          adGroupModelId: id,
          campaignModelId: model.campaignModelId,
          executionPlanId: model.executionPlanId,
          executionContractIds: contractIds,
          decisionAnalysisId: model.decisionAnalysisId,
          workflowSnapshotId: model.workflowSnapshotId,
          adGroupIds: adGroups.map((item) => item.id),
          createdAt,
          metadata,
        });
        const modelIssues = [...validator.validateModel(model), ...validator.validateSnapshot(snapshot)];
        if (modelIssues.length > 0) return refused(modelIssues);
        snapshots.set(id, snapshot);
        const statistics = freezeDeepGoogleAdsAdGroup(
          computeGoogleAdsAdGroupStatistics(adGroups, {
            warningCount: warnings.length,
            contractCount: contractIds.length,
          }),
        );
        return {
          status: "OK",
          issues: [],
          model,
          snapshot,
          statistics,
          warnings: model.warnings,
          metadata: model.metadata,
          executionTime,
        };
      } catch (error) {
        return refused([{ field: "adGroup", message: error instanceof Error ? error.message : "Duplicate Ad Group: the builder could not assemble an ad group." }]);
      }
    },
    getSnapshot: (adGroupModelId) => snapshots.get(adGroupModelId) ?? null,
  };
}
