/**
 * Host record domain: responsive search ad builder.
 *
 * Turns a read-only campaign model, ad group model, execution plan, execution
 * contracts, Decision Analysis, workflow snapshot, and named records into one
 * frozen RSA model, a snapshot, statistics, warnings, metadata, and an
 * execution time. It never reaches an outside system, never authenticates,
 * never uploads an asset, and never sends a record. A refused input returns
 * REJECTED with issues and no model.
 *
 * This builder does not change the campaign model or ad group model it reads.
 * It is not the host provider contract and not a policy review.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  copyIdHolder,
  copyPlainGoogleAdsRsa,
  createGoogleAdsRsaSnapshot,
  freezeDeepGoogleAdsRsa,
  type GoogleAdsBuiltRsa,
  type GoogleAdsRsaAdGroupRef,
  type GoogleAdsRsaCampaignRef,
  type GoogleAdsRsaModel,
  type GoogleAdsRsaNamedRecordSpec,
  type GoogleAdsRsaSnapshot,
  type GoogleAdsRsaSpec,
  type GoogleAdsRsaTextSpec,
  type GoogleAdsRsaUrlSpec,
} from "./google-ads-rsa-snapshot";
import { computeGoogleAdsRsaStatistics, type GoogleAdsRsaStatistics } from "./google-ads-rsa-statistics";
import { createGoogleAdsRsaResolver, type GoogleAdsRsaResolver } from "./google-ads-rsa-resolver";
import { createGoogleAdsRsaValidator, type GoogleAdsRsaValidator } from "./google-ads-rsa-validator";

export const GOOGLE_ADS_RSA_BUILD_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsRsaBuildStatus = (typeof GOOGLE_ADS_RSA_BUILD_STATUSES)[number];

export type GoogleAdsRsaClock = () => number;
export type GoogleAdsRsaTimestamp = () => string;
export type GoogleAdsRsaIdFactory = () => string;

export interface GoogleAdsRsaBuilderInput {
  campaignModel: GoogleAdsRsaCampaignRef;
  adGroupModel: GoogleAdsRsaAdGroupRef;
  executionPlan?: { id: string } | null;
  executionContracts?: readonly { id: string }[];
  decisionAnalysis?: { id: string } | null;
  workflowSnapshot?: { id: string } | null;
  executionMetadata?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  configuration?: GoogleAdsMetadata;
  responsiveSearchAds: readonly GoogleAdsRsaSpec[];
  headlines?: readonly GoogleAdsRsaTextSpec[];
  descriptions?: readonly GoogleAdsRsaTextSpec[];
  finalUrls?: readonly GoogleAdsRsaUrlSpec[];
  displayPaths?: readonly GoogleAdsRsaTextSpec[];
  trackingTemplates?: readonly GoogleAdsRsaTextSpec[];
  urlSuffixes?: readonly GoogleAdsRsaTextSpec[];
  pinnedAssets?: readonly GoogleAdsRsaNamedRecordSpec[];
}

export interface GoogleAdsRsaBuildResult {
  status: GoogleAdsRsaBuildStatus;
  issues: GoogleAdsIssue[];
  model: GoogleAdsRsaModel | null;
  snapshot: GoogleAdsRsaSnapshot | null;
  statistics: GoogleAdsRsaStatistics | null;
  warnings: readonly string[];
  metadata: GoogleAdsMetadata;
  executionTime: number;
}

export interface GoogleAdsRsaBuilder {
  readonly validator: GoogleAdsRsaValidator;
  readonly resolver: GoogleAdsRsaResolver;
  validate(input: unknown): GoogleAdsIssue[];
  build(input: unknown): GoogleAdsRsaBuildResult;
  getSnapshot(rsaModelId: string): GoogleAdsRsaSnapshot | null;
}

export interface GoogleAdsRsaBuilderOptions {
  validator?: GoogleAdsRsaValidator;
  resolver?: GoogleAdsRsaResolver;
  now?: GoogleAdsRsaClock;
  timestamp?: GoogleAdsRsaTimestamp;
  idFactory?: GoogleAdsRsaIdFactory;
}

const defaultClock: GoogleAdsRsaClock = () => performance.now();

function refused(issues: GoogleAdsIssue[]): GoogleAdsRsaBuildResult {
  return { status: "REJECTED", issues, model: null, snapshot: null, statistics: null, warnings: [], metadata: {}, executionTime: 0 };
}

export function createGoogleAdsRsaBuilder(options: GoogleAdsRsaBuilderOptions = {}): GoogleAdsRsaBuilder {
  const validator = options.validator ?? createGoogleAdsRsaValidator();
  const resolver = options.resolver ?? createGoogleAdsRsaResolver();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `rsa-${++serial}`);
  const snapshots = new Map<string, GoogleAdsRsaSnapshot>();

  const extraIssues = (input: GoogleAdsRsaBuilderInput): GoogleAdsIssue[] => resolver.resolve(input).issues;

  return {
    validator,
    resolver,
    validate(input) {
      const issues = validator.validateInput(input);
      if (issues.length > 0 || !input || typeof input !== "object") return issues;
      return [...issues, ...extraIssues(input as GoogleAdsRsaBuilderInput)];
    },
    build(input) {
      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0) return refused(issues);
        const draft = input as GoogleAdsRsaBuilderInput;
        const resolved = resolver.resolve(draft);
        if (resolved.issues.length > 0) return refused(resolved.issues);

        const start = now();
        const responsiveSearchAds: GoogleAdsBuiltRsa[] = resolved.ads.map((item) => ({
          id: item.spec.id,
          adGroupId: item.spec.adGroupId,
          headlines: item.headlines,
          descriptions: item.descriptions,
          finalUrl: item.finalUrl!,
          displayPath: item.displayPath,
          trackingTemplate: item.trackingTemplate,
          urlSuffix: item.urlSuffix,
          pinnedAssets: item.pinnedAssets,
          metadata: copyPlainGoogleAdsRsa(item.spec.metadata ?? {}),
        }));
        const contractIds = [...(draft.executionContracts ?? [])]
          .map((item) => item.id)
          .filter((id, index, list) => list.indexOf(id) === index)
          .sort();
        const metadata = copyPlainGoogleAdsRsa(draft.executionMetadata ?? {});
        const createdAt = timestamp();
        const id = idFactory();
        const executionTime = Math.max(0, now() - start);
        const warnings = copyPlainGoogleAdsRsa(resolved.warnings);
        const model = freezeDeepGoogleAdsRsa({
          id,
          campaignModelId: copyIdHolder(draft.campaignModel)?.id ?? null,
          adGroupModelId: copyIdHolder(draft.adGroupModel)?.id ?? null,
          executionPlanId: copyIdHolder(draft.executionPlan)?.id ?? null,
          executionContractIds: contractIds,
          decisionAnalysisId: copyIdHolder(draft.decisionAnalysis)?.id ?? null,
          workflowSnapshotId: copyIdHolder(draft.workflowSnapshot)?.id ?? null,
          responsiveSearchAds,
          warnings,
          metadata,
          executionTime,
          createdAt,
        });
        const snapshot = createGoogleAdsRsaSnapshot({
          rsaModelId: id,
          campaignModelId: model.campaignModelId,
          adGroupModelId: model.adGroupModelId,
          executionPlanId: model.executionPlanId,
          executionContractIds: contractIds,
          decisionAnalysisId: model.decisionAnalysisId,
          workflowSnapshotId: model.workflowSnapshotId,
          rsaIds: responsiveSearchAds.map((item) => item.id),
          createdAt,
          metadata,
        });
        const modelIssues = [...validator.validateModel(model), ...validator.validateSnapshot(snapshot)];
        if (modelIssues.length > 0) return refused(modelIssues);
        snapshots.set(id, snapshot);
        const statistics = freezeDeepGoogleAdsRsa(
          computeGoogleAdsRsaStatistics(responsiveSearchAds, {
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
        return refused([{ field: "responsiveSearchAd", message: error instanceof Error ? error.message : "Missing Headline: the builder could not assemble an RSA." }]);
      }
    },
    getSnapshot: (rsaModelId) => snapshots.get(rsaModelId) ?? null,
  };
}
