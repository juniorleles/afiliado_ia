/**
 * Host record domain: Google Ads monitor.
 *
 * Observes a read-only published campaign and provider state and records one
 * frozen synchronization result, provider status, campaign health, report,
 * metrics, and snapshot. It never creates a campaign, never changes a
 * decision, and never reaches an outside system. A refused input returns
 * REJECTED with issues and no result. This layer stays offline.
 *
 * This monitor is not a publisher and not a campaign builder.
 */
import type { GoogleAdsMetadata } from "./google-ads-types";
import type { GoogleAdsIssue } from "./google-ads-validator";
import {
  computeGoogleAdsSynchronizationMetrics,
  copyPlainGoogleAdsMonitor,
  createGoogleAdsSynchronizationSnapshot,
  freezeDeepGoogleAdsMonitor,
  type GoogleAdsObservedCampaignHealth,
  type GoogleAdsProviderHealthStatus,
  type GoogleAdsProviderStatus,
  type GoogleAdsSynchronizationMetrics,
  type GoogleAdsSynchronizationReport,
  type GoogleAdsSynchronizationResult,
  type GoogleAdsSynchronizationSnapshot,
} from "./google-ads-monitor-snapshot";
import { createGoogleAdsCampaignSynchronizer, type GoogleAdsCampaignSynchronizer } from "./google-ads-monitor-synchronizer";
import { createGoogleAdsSynchronizationValidator, type GoogleAdsSynchronizationValidator } from "./google-ads-monitor-validator";
import { createGoogleAdsProviderHealthMonitor, googleAdsCampaignHealthOf, type GoogleAdsProviderHealthMonitor } from "./google-ads-monitor-health";

export type GoogleAdsMonitorClock = () => number;
export type GoogleAdsMonitorTimestamp = () => string;
export type GoogleAdsMonitorIdFactory = () => string;

export interface GoogleAdsMonitorResult {
  status: "OK" | "REJECTED";
  issues: GoogleAdsIssue[];
  result: GoogleAdsSynchronizationResult | null;
  providerStatus: GoogleAdsProviderStatus | null;
  campaignHealth: GoogleAdsObservedCampaignHealth;
  report: GoogleAdsSynchronizationReport;
  errors: readonly GoogleAdsIssue[];
  metrics: GoogleAdsSynchronizationMetrics | null;
  snapshot: GoogleAdsSynchronizationSnapshot | null;
  metadata: GoogleAdsMetadata;
  health: GoogleAdsProviderHealthStatus;
  executionTime: number;
}

export interface GoogleAdsMonitor {
  readonly synchronizer: GoogleAdsCampaignSynchronizer;
  readonly validator: GoogleAdsSynchronizationValidator;
  readonly healthMonitor: GoogleAdsProviderHealthMonitor;
  synchronize(input: unknown): GoogleAdsMonitorResult;
  healthCheck(input: unknown): ReturnType<GoogleAdsProviderHealthMonitor["check"]>;
  getSnapshot(syncId: string): GoogleAdsSynchronizationSnapshot | null;
}

export interface GoogleAdsMonitorOptions {
  synchronizer?: GoogleAdsCampaignSynchronizer;
  validator?: GoogleAdsSynchronizationValidator;
  healthMonitor?: GoogleAdsProviderHealthMonitor;
  now?: GoogleAdsMonitorClock;
  timestamp?: GoogleAdsMonitorTimestamp;
  idFactory?: GoogleAdsMonitorIdFactory;
}

const defaultClock: GoogleAdsMonitorClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reportOf(init: {
  id: string;
  status: "OK" | "REJECTED";
  consistent: boolean;
  campaignHealth: GoogleAdsObservedCampaignHealth;
  issues: GoogleAdsIssue[];
  createdAt: string;
  metadata: GoogleAdsMetadata;
}): GoogleAdsSynchronizationReport {
  return freezeDeepGoogleAdsMonitor({
    id: init.id,
    status: init.status,
    consistent: init.consistent,
    campaignHealth: init.campaignHealth,
    issues: [...init.issues],
    createdAt: init.createdAt,
    metadata: copyPlainGoogleAdsMonitor(init.metadata),
  });
}

function refused(issues: GoogleAdsIssue[], createdAt: string, id: string, metadata: GoogleAdsMetadata, executionTime = 0): GoogleAdsMonitorResult {
  const campaignHealth = googleAdsCampaignHealthOf(issues);
  return {
    status: "REJECTED",
    issues,
    result: null,
    providerStatus: null,
    campaignHealth,
    report: reportOf({ id, status: "REJECTED", consistent: false, campaignHealth, issues, createdAt, metadata }),
    errors: issues,
    metrics: computeGoogleAdsSynchronizationMetrics({
      campaignCount: 0,
      conflictCount: issues.filter((item) => /State Conflict/.test(item.message)).length,
      issueCount: issues.length,
      executionTime,
    }),
    snapshot: null,
    metadata,
    health: "UNAVAILABLE",
    executionTime,
  };
}

export function createGoogleAdsMonitor(options: GoogleAdsMonitorOptions = {}): GoogleAdsMonitor {
  const synchronizer = options.synchronizer ?? createGoogleAdsCampaignSynchronizer();
  const validator = options.validator ?? createGoogleAdsSynchronizationValidator();
  const healthMonitor = options.healthMonitor ?? createGoogleAdsProviderHealthMonitor();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `sync-${++serial}`);
  const snapshots = new Map<string, GoogleAdsSynchronizationSnapshot>();

  return {
    synchronizer,
    validator,
    healthMonitor,
    healthCheck: (input) => healthMonitor.check(input),
    synchronize(input) {
      try {
        const start = now();
        const createdAt = timestamp();
        const id = idFactory();
        const metadata = isRecord(input) && isRecord(input.executionMetadata) ? copyPlainGoogleAdsMonitor(input.executionMetadata as GoogleAdsMetadata) : {};
        const inputIssues = validator.validateInput(input);
        if (inputIssues.length > 0) return refused(inputIssues, createdAt, id, metadata, Math.max(0, now() - start));
        const draft = input as { publishedCampaign: unknown; providerState: unknown };
        const synced = synchronizer.synchronize({
          id,
          publishedCampaign: draft.publishedCampaign,
          providerState: draft.providerState,
          metadata,
          synchronizedAt: createdAt,
        });
        const executionTime = Math.max(0, now() - start);
        const snapshot = createGoogleAdsSynchronizationSnapshot({
          syncId: id,
          campaignId: synced.result.campaignId,
          campaignHealth: "ALIGNED",
          consistent: true,
          synchronizedAt: createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, createdAt, id, metadata, executionTime);
        snapshots.set(id, snapshot);
        return {
          status: "OK",
          issues: [],
          result: synced.result,
          providerStatus: synced.providerStatus,
          campaignHealth: "ALIGNED",
          report: reportOf({ id, status: "OK", consistent: true, campaignHealth: "ALIGNED", issues: [], createdAt, metadata }),
          errors: [],
          metrics: computeGoogleAdsSynchronizationMetrics({ campaignCount: synced.result.campaignId ? 1 : 0, conflictCount: 0, issueCount: 0, executionTime }),
          snapshot,
          metadata: synced.result.metadata,
          health: "OFFLINE",
          executionTime,
        };
      } catch (error) {
        return refused(
          [{ field: "monitor", message: error instanceof Error ? error.message : "Invalid Synchronization: the monitor could not observe the records." }],
          new Date().toISOString(),
          "sync-0",
          {},
        );
      }
    },
    getSnapshot: (syncId) => snapshots.get(syncId) ?? null,
  };
}
