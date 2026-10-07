/**
 * Host record domain: metrics collector.
 *
 * One entry point from campaign resource names to a frozen copy of the
 * returned performance figures. A refused run stores nothing. This method
 * never throws.
 */
import { GOOGLE_ADS_API_VERSION, type GoogleAuthTransport } from "../google-ads-live/google-auth-client.ts";
import { createGoogleMetricsClient } from "./google-metrics-client";
import { mapAdGroupMetrics, mapCampaignMetrics, mapRsaMetrics } from "./metrics-mapper";
import type { MetricsMetadata } from "./metrics-context";
import {
  METRICS_DATE_RANGE,
  createMetricsSnapshot,
  createMetricsStatistics,
  freezeDeepMetrics,
  type AdGroupMetrics,
  type CampaignMetrics,
  type MetricsResult,
  type MetricsSnapshot,
  type RsaMetrics,
} from "./metrics-snapshot";
import { createMetricsValidator, type MetricsValidator } from "./metrics-validator";

export type MetricsClock = () => number;
export type MetricsTimestamp = () => string;
export type MetricsIdFactory = () => string;

export interface MetricsCollectorOptions {
  now?: MetricsClock;
  timestamp?: MetricsTimestamp;
  idFactory?: MetricsIdFactory;
  transport?: GoogleAuthTransport;
  validator?: MetricsValidator;
  apiVersion?: string;
}

export interface MetricsCollector {
  readonly validator: MetricsValidator;
  collect(input: unknown): Promise<MetricsResult>;
  getSnapshot(collectionId: string): MetricsSnapshot | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createMetricsCollector(options: MetricsCollectorOptions = {}): MetricsCollector {
  const validator = options.validator ?? createMetricsValidator();
  const now = options.now ?? (() => performance.now());
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  const idFactory = options.idFactory ?? (() => `metrics-collect-${++serial}`);
  const apiVersion = options.apiVersion ?? GOOGLE_ADS_API_VERSION;
  const client = createGoogleMetricsClient(options.transport);
  const snapshots = new Map<string, MetricsSnapshot>();

  return {
    validator,
    async collect(input) {
      const started = now();
      const refused = (issues: MetricsResult["issues"], metadata: MetricsMetadata = {}): MetricsResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepMetrics({
          status: "REJECTED",
          issues,
          campaignMetrics: null,
          adGroupMetrics: null,
          rsaMetrics: null,
          statistics: createMetricsStatistics({ requestCount: 0, campaignCount: 0, adGroupCount: 0, adCount: 0, issueCount: issues.length, executionTime }),
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
        const metadata = isRecord(input.executionMetadata) ? ({ ...input.executionMetadata } as MetricsMetadata) : {};
        const accessToken = (input.session as { accessToken: string }).accessToken.trim();
        const developerToken = (input.developerToken as string).trim();
        const campaignMetrics: CampaignMetrics[] = [];
        const adGroupMetrics: AdGroupMetrics[] = [];
        const rsaMetrics: RsaMetrics[] = [];
        let requestCount = 0;
        for (const resourceName of names) {
          const campaign = await client.readCampaign(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += campaign.ok ? campaign.read.requestCount : 1;
          if (!campaign.ok) return refused(campaign.issues, metadata);
          const mappedCampaign = mapCampaignMetrics(resourceName, campaign.read.rows);
          if (!mappedCampaign.ok) return refused(mappedCampaign.issues, metadata);
          const groups = await client.readAdGroups(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += groups.ok ? groups.read.requestCount : 1;
          if (!groups.ok) return refused(groups.issues, metadata);
          const mappedGroups = mapAdGroupMetrics(resourceName, customerId, groups.read.rows);
          if (!mappedGroups.ok) return refused(mappedGroups.issues, metadata);
          const ads = await client.readAds(apiVersion, customerId, developerToken, accessToken, resourceName);
          requestCount += ads.ok ? ads.read.requestCount : 1;
          if (!ads.ok) return refused(ads.issues, metadata);
          const mappedAds = mapRsaMetrics(resourceName, customerId, ads.read.rows);
          if (!mappedAds.ok) return refused(mappedAds.issues, metadata);
          campaignMetrics.push(mappedCampaign.metric);
          adGroupMetrics.push(...mappedGroups.metrics);
          rsaMetrics.push(...mappedAds.metrics);
        }
        const createdAt = timestamp();
        const executionTime = Math.max(0, now() - started);
        const statistics = createMetricsStatistics({
          requestCount,
          campaignCount: campaignMetrics.length,
          adGroupCount: adGroupMetrics.length,
          adCount: rsaMetrics.length,
          issueCount: 0,
          executionTime,
        });
        const collectionId = idFactory();
        const snapshot = createMetricsSnapshot({
          collectionId,
          campaignMetrics,
          adGroupMetrics,
          rsaMetrics,
          statistics,
          context: { customerId, campaignResourceNames: names, dateRange: METRICS_DATE_RANGE },
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        snapshots.set(snapshot.collectionId, snapshot);
        return freezeDeepMetrics({
          status: "OK",
          issues: [],
          campaignMetrics: snapshot.campaignMetrics,
          adGroupMetrics: snapshot.adGroupMetrics,
          rsaMetrics: snapshot.rsaMetrics,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "campaignResourceNames", message: "Google API Errors: the metrics read could not be restated." }]);
      }
    },
    getSnapshot: (collectionId) => snapshots.get(collectionId) ?? null,
  };
}
