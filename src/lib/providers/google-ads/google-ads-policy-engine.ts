/**
 * Host record domain: campaign validation engine.
 *
 * Turns a read-only campaign model, ad group model, RSA model, execution
 * plan, and metadata into one frozen validation report, issue list, campaign
 * health, warnings, statistics, execution time, and snapshot. It never reaches
 * an outside system, never authenticates, and never submits a record for
 * review. A refused input returns REJECTED with issues.
 *
 * This engine does not change the models it reads. It is not a Google policy
 * host and not an API adapter.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import {
  campaignHealthOf,
  copyIdHolder,
  copyPlainGoogleAdsPolicy,
  createGoogleAdsCampaignPolicySnapshot,
  freezeDeepGoogleAdsPolicy,
  type GoogleAdsCampaignHealth,
  type GoogleAdsPolicyIssue,
  type GoogleAdsPolicyReport,
  type GoogleAdsPolicySnapshot,
} from "./google-ads-policy-snapshot";
import { createGoogleAdsCampaignIssueRegistry, type GoogleAdsCampaignIssueRegistry } from "./google-ads-policy-registry";
import { computeGoogleAdsCampaignValidationStatistics, type GoogleAdsPolicyStatistics } from "./google-ads-policy-statistics";
import { createGoogleAdsCampaignPolicyValidator, type GoogleAdsCampaignPolicyValidator } from "./google-ads-policy-validator";

export const GOOGLE_ADS_POLICY_STATUSES = ["OK", "REJECTED"] as const;
export type GoogleAdsPolicyStatus = (typeof GOOGLE_ADS_POLICY_STATUSES)[number];

export type GoogleAdsPolicyClock = () => number;
export type GoogleAdsPolicyTimestamp = () => string;
export type GoogleAdsPolicyIdFactory = () => string;

export interface GoogleAdsPolicyEngineInput {
  campaignModel: { id: string; campaigns?: readonly unknown[]; metadata?: GoogleAdsMetadata };
  adGroupModel?: { id: string; adGroups?: readonly unknown[]; metadata?: GoogleAdsMetadata } | null;
  responsiveSearchAds?: { id?: string; responsiveSearchAds?: readonly unknown[] } | readonly unknown[] | null;
  executionPlan?: { id: string } | null;
  executionContracts?: readonly { id: string }[];
  executionMetadata?: GoogleAdsMetadata;
  runtimeMetadata?: GoogleAdsMetadata;
  configuration?: GoogleAdsMetadata;
}

export interface GoogleAdsPolicyResult {
  status: GoogleAdsPolicyStatus;
  report: GoogleAdsPolicyReport | null;
  issues: readonly GoogleAdsPolicyIssue[];
  health: GoogleAdsCampaignHealth;
  warnings: readonly string[];
  statistics: GoogleAdsPolicyStatistics | null;
  snapshot: GoogleAdsPolicySnapshot | null;
  executionTime: number;
}

export interface GoogleAdsCampaignValidationEngine {
  readonly validator: GoogleAdsCampaignPolicyValidator;
  readonly registry: GoogleAdsCampaignIssueRegistry;
  validate(input: unknown): GoogleAdsPolicyResult;
  getSnapshot(validationId: string): GoogleAdsPolicySnapshot | null;
}

export interface GoogleAdsCampaignValidationEngineOptions {
  validator?: GoogleAdsCampaignPolicyValidator;
  now?: GoogleAdsPolicyClock;
  timestamp?: GoogleAdsPolicyTimestamp;
  idFactory?: GoogleAdsPolicyIdFactory;
}

const defaultClock: GoogleAdsPolicyClock = () => performance.now();

function refused(issues: GoogleAdsPolicyIssue[], executionTime = 0): GoogleAdsPolicyResult {
  const health = campaignHealthOf(issues);
  return {
    status: "REJECTED",
    report: null,
    issues,
    health,
    warnings: issues.filter((item) => item.kind === "WARNING").map((item) => item.message),
    statistics: null,
    snapshot: null,
    executionTime,
  };
}

function countOf(value: unknown, key: string): number {
  if (!value || typeof value !== "object") return 0;
  const record = value as Record<string, unknown>;
  if (Array.isArray(value)) return value.length;
  const inner = record[key];
  return Array.isArray(inner) ? inner.length : 0;
}

export function createGoogleAdsCampaignValidationEngine(options: GoogleAdsCampaignValidationEngineOptions = {}): GoogleAdsCampaignValidationEngine {
  const validator = options.validator ?? createGoogleAdsCampaignPolicyValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `validation-${++serial}`);
  const snapshots = new Map<string, GoogleAdsPolicySnapshot>();
  const registry = createGoogleAdsCampaignIssueRegistry();

  return {
    validator,
    registry,
    validate(input) {
      try {
        const start = now();
        const collected = validator.validateInput(input);
        const runRegistry = createGoogleAdsCampaignIssueRegistry();
        for (const item of collected) runRegistry.register(item);
        const issues = freezeDeepGoogleAdsPolicy(copyPlainGoogleAdsPolicy(runRegistry.list()));
        const health = campaignHealthOf(issues);
        const status: GoogleAdsPolicyStatus = issues.some((item) => item.kind === "ERROR") ? "REJECTED" : "OK";
        const warnings = freezeDeepGoogleAdsPolicy(issues.filter((item) => item.kind === "WARNING").map((item) => item.message));
        const executionTime = Math.max(0, now() - start);
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = copyPlainGoogleAdsPolicy(isRecord(input) && isRecord(input.executionMetadata) ? (input.executionMetadata as GoogleAdsMetadata) : {});
        const report = freezeDeepGoogleAdsPolicy({
          id,
          status,
          health,
          issues,
          warnings,
          metadata,
          executionTime,
          createdAt,
        });
        const snapshot = createGoogleAdsCampaignPolicySnapshot({
          validationId: id,
          campaignModelId: isRecord(input) ? copyIdHolder(input.campaignModel as { id: string })?.id ?? null : null,
          adGroupModelId: isRecord(input) ? copyIdHolder(input.adGroupModel as { id: string } | null)?.id ?? null : null,
          rsaModelId: rsaIdOf(input),
          executionPlanId: isRecord(input) ? copyIdHolder(input.executionPlan as { id: string } | null)?.id ?? null : null,
          issueIds: issues.map((item) => item.id),
          health,
          createdAt,
          metadata,
        });
        const reportIssues = [...validator.validateReport(report), ...validator.validateSnapshot(snapshot)];
        if (reportIssues.length > 0) return refused(issues, executionTime);
        snapshots.set(id, snapshot);
        const statistics = freezeDeepGoogleAdsPolicy(
          computeGoogleAdsCampaignValidationStatistics(issues, {
            campaignCount: isRecord(input) ? countOf(input.campaignModel, "campaigns") : 0,
            adGroupCount: isRecord(input) ? countOf(input.adGroupModel, "adGroups") : 0,
            rsaCount: isRecord(input) ? countOf(input.responsiveSearchAds, "responsiveSearchAds") : 0,
          }),
        );
        return { status, report, issues, health, warnings, statistics, snapshot, executionTime };
      } catch (error) {
        return refused([
          {
            id: "issue-fail",
            kind: "ERROR",
            area: "campaignStructure",
            field: "campaignModel",
            message: error instanceof Error ? error.message : "Corrupted Campaign Model: the engine could not validate the campaign.",
          },
        ]);
      }
    },
    getSnapshot: (validationId) => snapshots.get(validationId) ?? null,
  };
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
