/**
 * Host record domain: campaign builder.
 *
 * Turns a read-only execution plan, execution contracts, Decision Analysis,
 * workflow snapshot, and named records into one frozen campaign model, a
 * snapshot, statistics, warnings, metadata, and an execution time. It never
 * reaches an outside system, never authenticates, and never sends a record.
 * A refused input returns REJECTED with issues and no model.
 *
 * This builder is not the host provider contract (google-ads-provider.ts)
 * and not an Ad Group builder.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyIdHolder,
  copyPlainGoogleAdsCampaign,
  createGoogleAdsCampaignSnapshot,
  freezeDeepGoogleAdsCampaign,
  type GoogleAdsBuiltCampaign,
  type GoogleAdsCampaignModel,
  type GoogleAdsCampaignSnapshot,
  type GoogleAdsCampaignSpec,
  type GoogleAdsNamedRecordSpec,
  type GoogleAdsSettingsSpec,
} from "./google-ads-campaign-snapshot";
import { computeGoogleAdsCampaignStatistics, type GoogleAdsCampaignStatistics } from "./google-ads-campaign-statistics";
import { createGoogleAdsCampaignResolver, type GoogleAdsCampaignResolver } from "./google-ads-campaign-resolver";
import { createGoogleAdsCampaignValidator, type GoogleAdsCampaignValidator } from "./google-ads-campaign-validator";

export const GOOGLE_ADS_CAMPAIGN_BUILD_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsCampaignBuildStatus = (typeof GOOGLE_ADS_CAMPAIGN_BUILD_STATUSES)[number];

export type GoogleAdsCampaignClock = () => number;
export type GoogleAdsCampaignTimestamp = () => string;
export type GoogleAdsCampaignIdFactory = () => string;

export interface GoogleAdsCampaignBuilderInput {
  executionPlan?: { id: string } | null;
  executionContracts?: readonly { id: string }[];
  decisionAnalysis?: { id: string } | null;
  workflowSnapshot?: { id: string } | null;
  executionMetadata?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  configuration?: GoogleAdsMetadata;
  campaigns: readonly GoogleAdsCampaignSpec[];
  budgets?: readonly GoogleAdsNamedRecordSpec[];
  settings?: readonly GoogleAdsSettingsSpec[];
  networks?: readonly GoogleAdsNamedRecordSpec[];
  locations?: readonly GoogleAdsNamedRecordSpec[];
  languages?: readonly GoogleAdsNamedRecordSpec[];
  schedules?: readonly GoogleAdsNamedRecordSpec[];
  bidStrategies?: readonly GoogleAdsNamedRecordSpec[];
}

export interface GoogleAdsCampaignBuildResult {
  status: GoogleAdsCampaignBuildStatus;
  issues: GoogleAdsIssue[];
  model: GoogleAdsCampaignModel | null;
  snapshot: GoogleAdsCampaignSnapshot | null;
  statistics: GoogleAdsCampaignStatistics | null;
  warnings: readonly string[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
}

export interface GoogleAdsCampaignBuilder {
  readonly validator: GoogleAdsCampaignValidator;
  readonly resolver: GoogleAdsCampaignResolver;
  validate(input: unknown): GoogleAdsIssue[];
  build(input: unknown): GoogleAdsCampaignBuildResult;
  getSnapshot(campaignModelId: string): GoogleAdsCampaignSnapshot | null;
}

export interface GoogleAdsCampaignBuilderOptions {
  validator?: GoogleAdsCampaignValidator;
  resolver?: GoogleAdsCampaignResolver;
  now?: GoogleAdsCampaignClock;
  timestamp?: GoogleAdsCampaignTimestamp;
  idFactory?: GoogleAdsCampaignIdFactory;
}

const defaultClock: GoogleAdsCampaignClock = () => performance.now();

function refused(issues: GoogleAdsIssue[]): GoogleAdsCampaignBuildResult {
  return { status: "REJECTED", issues, model: null, snapshot: null, statistics: null, warnings: [], metadata: {}, executionTime: 0 };
}

export function createGoogleAdsCampaignBuilder(options: GoogleAdsCampaignBuilderOptions = {}): GoogleAdsCampaignBuilder {
  const validator = options.validator ?? createGoogleAdsCampaignValidator();
  const resolver = options.resolver ?? createGoogleAdsCampaignResolver();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `model-${++serial}`);
  const snapshots = new Map<string, GoogleAdsCampaignSnapshot>();

  const extraIssues = (input: GoogleAdsCampaignBuilderInput): GoogleAdsIssue[] => resolver.resolve(input).issues;

  return {
    validator,
    resolver,
    validate(input) {
      const issues = validator.validateInput(input);
      if (issues.length > 0 || !input || typeof input !== "object") return issues;
      return [...issues, ...extraIssues(input as GoogleAdsCampaignBuilderInput)];
    },
    build(input) {
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues);
        const draft = input as GoogleAdsCampaignBuilderInput;
        const resolved = resolver.resolve(draft);
        if (resolved.issues.length > 0) return refused(resolved.issues);

        const start = now();
        const campaigns: GoogleAdsBuiltCampaign[] = resolved.campaigns.map((item) => ({
          id: item.spec.id,
          name: item.spec.name,
          budget: item.budget!,
          settings: item.settings!,
          network: item.network!,
          locations: item.locations,
          languages: item.languages,
          schedule: item.schedule!,
          bidStrategy: item.bidStrategy!,
          metadata: copyPlainGoogleAdsCampaign(item.spec.metadata ?? {}),
        }));
        const contractIds = [...(draft.executionContracts ?? [])]
          .map((item) => item.id)
          .filter((id, index, list) => list.indexOf(id) === index)
          .sort();
        const metadata = copyPlainGoogleAdsCampaign(draft.executionMetadata ?? {});
        const createdAt = timestamp();
        const id = idFactory();
        const executionTime = Math.max(0, now() - start);
        const warnings = copyPlainGoogleAdsCampaign(resolved.warnings);
        const model = freezeDeepGoogleAdsCampaign({
          id,
          executionPlanId: copyIdHolder(draft.executionPlan)?.id ?? null,
          executionContractIds: contractIds,
          decisionAnalysisId: copyIdHolder(draft.decisionAnalysis)?.id ?? null,
          workflowSnapshotId: copyIdHolder(draft.workflowSnapshot)?.id ?? null,
          campaigns,
          warnings,
          metadata,
          executionTime,
          createdAt,
        });
        const snapshot = createGoogleAdsCampaignSnapshot({
          campaignModelId: id,
          executionPlanId: model.executionPlanId,
          executionContractIds: contractIds,
          decisionAnalysisId: model.decisionAnalysisId,
          workflowSnapshotId: model.workflowSnapshotId,
          campaignIds: campaigns.map((item) => item.id),
          createdAt,
          metadata,
        });
        const modelIssues = [...validator.validateModel(model), ...validator.validateSnapshot(snapshot)];
        if (modelIssues.length > 0) return refused(modelIssues);
        snapshots.set(id, snapshot);
        const statistics = freezeDeepGoogleAdsCampaign(
          computeGoogleAdsCampaignStatistics(campaigns, {
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
        return refused([{ field: "campaign", message: error instanceof Error ? error.message : "Invalid Campaign: the builder could not assemble a campaign." }]);
      }
    },
    getSnapshot: (campaignModelId) => snapshots.get(campaignModelId) ?? null,
  };
}
