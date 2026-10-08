/**
 * Host record domain: campaign synchronizer.
 *
 * One entry point from campaign resource names to a frozen read of those
 * campaigns. A refused run stores nothing. A local snapshot is read and is
 * not written back. This method never throws.
 */
import { diffCampaigns } from "./campaign-diff-engine";
import { mapCampaignState } from "./campaign-state-mapper";
import type { CampaignSyncMetadata } from "./campaign-sync-context";
import {
  createCampaignSyncSnapshot,
  createCampaignSyncStatistics,
  freezeDeepCampaignSync,
  type CampaignState,
  type CampaignSyncResult,
  type CampaignSyncSnapshot,
  type SynchronizationReport,
} from "./campaign-sync-snapshot";
import { createCampaignSyncValidator, type CampaignSyncValidator } from "./campaign-sync-validator";
import { GOOGLE_ADS_API_VERSION, type GoogleAuthTransport } from "./google-auth-client";
import { createResourceReader } from "./resource-reader";

export type CampaignSyncClock = () => number;
export type CampaignSyncTimestamp = () => string;
export type CampaignSyncIdFactory = () => string;

export interface CampaignSynchronizerOptions {
  now?: CampaignSyncClock;
  timestamp?: CampaignSyncTimestamp;
  idFactory?: CampaignSyncIdFactory;
  transport?: GoogleAuthTransport;
  validator?: CampaignSyncValidator;
  apiVersion?: string;
}

export interface CampaignSynchronizer {
  readonly validator: CampaignSyncValidator;
  synchronize(input: unknown): Promise<CampaignSyncResult>;
  getSnapshot(syncId: string): CampaignSyncSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createCampaignSynchronizer(options: CampaignSynchronizerOptions = {}): CampaignSynchronizer {
  const validator = options.validator ?? createCampaignSyncValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `campaign-sync-${++serial}`);
  const apiVersion = options.apiVersion ?? GOOGLE_ADS_API_VERSION;
  const reader = createResourceReader(options.transport);
  const snapshots = new Map<string, CampaignSyncSnapshot>();

  return {
    validator,
    async synchronize(input) {
      const started = now();
      const refused = (issues: CampaignSyncResult["issues"], metadata: CampaignSyncMetadata = {}): CampaignSyncResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepCampaignSync({
          status: "REJECTED",
          issues,
          campaignSnapshot: null,
          report: null,
          statistics: createCampaignSyncStatistics({
            requestCount: 0,
            campaignCount: 0,
            adGroupCount: 0,
            adCount: 0,
            labelCount: 0,
            differenceCount: 0,
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
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const customerId = (input.customerId as string).trim();
        const names = validator.campaignNames(input, customerId);
        if (names === null) return refused(issues.length > 0 ? issues : [{ field: "campaignResourceNames", message: "Unknown Campaign: a campaign resource is required." }]);
        const metadata = isRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as CampaignSyncMetadata) : {};
        const priorPresent = input.localSnapshot !== undefined;
        const prior = priorPresent ? validator.localCampaigns(input.localSnapshot) : null;
        const accessToken = (input.session as { accessToken: string }).accessToken.trim();
        const developerToken = typeof input.developerToken === "string" ? input.developerToken.trim() : "";
        const observed: CampaignState[] = [];
        let requestCount = 0;
        for (const resourceName of names) {
          const campaign = await reader.readCampaign(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += campaign.ok ? campaign.read.requestCount : 1;
          if (!campaign.ok) return refused(campaign.issues, metadata);
          if (campaign.read.rows.length === 0) {
            return refused([{ field: "campaignResourceNames", message: `Unknown Campaign: the account service has no campaign ${resourceName}.` }], metadata);
          }
          const labels = await reader.readLabels(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += labels.ok ? labels.read.requestCount : 1;
          if (!labels.ok) return refused(labels.issues, metadata);
          const adGroups = await reader.readAdGroups(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += adGroups.ok ? adGroups.read.requestCount : 1;
          if (!adGroups.ok) return refused(adGroups.issues, metadata);
          const ads = await reader.readAds(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += ads.ok ? ads.read.requestCount : 1;
          if (!ads.ok) return refused(ads.issues, metadata);
          const changes = await reader.readChanges(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += changes.ok ? changes.read.requestCount : 1;
          if (!changes.ok) return refused(changes.issues, metadata);
          const mapped = mapCampaignState({
            resourceName,
            campaignRows: campaign.read.rows,
            labelRows: labels.read.rows,
            adGroupRows: adGroups.read.rows,
            adRows: ads.read.rows,
            changeRows: changes.read.rows,
          });
          if (!mapped.ok) return refused(mapped.issues, metadata);
          observed.push(mapped.campaign);
        }
        const diff = priorPresent ? diffCampaigns(prior ?? [], observed) : { differences: [], missingResources: [], stateChanges: [] };
        const createdAt = timestamp();
        const report: SynchronizationReport = {
          customerId,
          priorSnapshotPresent: priorPresent,
          differences: diff.differences,
          missingResources: diff.missingResources,
          stateChanges: diff.stateChanges,
        };
        let adGroupCount = 0;
        let adCount = 0;
        let labelCount = 0;
        for (const campaign of observed) {
          labelCount += campaign.labels.length;
          adGroupCount += campaign.adGroups.length;
          for (const adGroup of campaign.adGroups) adCount += adGroup.ads.length;
        }
        const executionTime = Math.max(0, now() - started);
        const statistics = createCampaignSyncStatistics({
          requestCount,
          campaignCount: observed.length,
          adGroupCount,
          adCount,
          labelCount,
          differenceCount: diff.differences.length,
          issueCount: 0,
          executionTime,
        });
        const syncId = idFactory();
        const snapshot = createCampaignSyncSnapshot({
          syncId,
          campaignSnapshot: { customerId, campaigns: observed, readAt: createdAt },
          report,
          statistics,
          context: { customerId, campaignResourceNames: names },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.syncId, snapshot);
        return freezeDeepCampaignSync({
          status: "OK",
          issues: [],
          campaignSnapshot: snapshot.campaignSnapshot,
          report: snapshot.report,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "campaignResourceNames", message: "API Errors: the campaign read could not be restated." }]);
      }
    },
    getSnapshot: (syncId) => snapshots.get(syncId) ?? null,
  };
}
