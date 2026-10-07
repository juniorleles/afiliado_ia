/**
 * Host record domain: real market discovery pipeline runner.
 *
 * Walks one keyword through the provider, the normalizer, and the existing
 * market discovery hosts, once each, and returns a frozen analysis. A refused
 * host stops the walk. This method never throws.
 */
import { createLandingPageCollector, type LandingPageCollector } from "../market-discovery/landing-page-collector";
import type { LandingPageResponse } from "../market-discovery/landing-page-context";
import { createMarketIntelligenceReport, type MarketIntelligenceReportHost } from "../market-discovery/market-intelligence-report";
import { createProductIdentifier, type ProductIdentifier } from "../market-discovery/product-identifier";
import { createSearchApiProvider, type SearchApiProvider } from "../search-provider/providers/searchapi-provider";
import { createRealMarketDiscoveryValidator, type RealMarketDiscoveryValidator } from "./real-market-discovery-validator";
import { createSearchApiNormalizer, type SearchApiNormalizer } from "./searchapi-normalizer";
import {
  REAL_MARKET_DISCOVERY_STAGES,
  copyPlainRealMarketDiscovery,
  createRealMarketDiscoverySnapshot,
  createRealMarketDiscoveryStatistics,
  freezeDeepRealMarketDiscovery,
  type RealMarketDiscoveryContextRecord,
  type RealMarketDiscoveryExecution,
  type RealMarketDiscoveryIssue,
  type RealMarketDiscoveryMetadata,
  type RealMarketDiscoveryResult,
  type RealMarketDiscoveryStage,
} from "./real-market-discovery-snapshot";

export type RealMarketDiscoveryClock = () => number;
export type RealMarketDiscoveryTimestamp = () => string;
export type RealMarketDiscoveryIdFactory = () => string;

export interface RealMarketDiscoveryHosts {
  readonly provider: SearchApiProvider;
  readonly normalizer: SearchApiNormalizer;
  readonly landingPages: LandingPageCollector;
  readonly products: ProductIdentifier;
  readonly report: MarketIntelligenceReportHost;
}

export interface RealMarketDiscoveryRunnerOptions {
  now?: RealMarketDiscoveryClock;
  timestamp?: RealMarketDiscoveryTimestamp;
  idFactory?: RealMarketDiscoveryIdFactory;
  provider?: SearchApiProvider;
  hosts?: RealMarketDiscoveryHosts;
}

export interface RealMarketDiscoveryRunner {
  readonly validator: RealMarketDiscoveryValidator;
  run(input: unknown): Promise<RealMarketDiscoveryResult>;
}

const defaultClock: RealMarketDiscoveryClock = () => performance.now();
const MARKET = /^[a-z][a-z0-9-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createRealMarketDiscoveryRunner(options: RealMarketDiscoveryRunnerOptions = {}): RealMarketDiscoveryRunner {
  const validator = createRealMarketDiscoveryValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  let providerSerial = 0;
  let normalizerSerial = 0;
  let pageSerial = 0;
  let productSerial = 0;
  let reportSerial = 0;
  const idFactory = options.idFactory ?? (() => `real-discovery-${++serial}`);
  const clocks = { now, timestamp };
  const hosts = options.hosts ?? {
    provider: options.provider ?? createSearchApiProvider({ ...clocks, idFactory: () => `searchapi-${++providerSerial}` }),
    normalizer: createSearchApiNormalizer({ ...clocks, idFactory: () => `normalization-${++normalizerSerial}` }),
    landingPages: createLandingPageCollector({ ...clocks, idFactory: () => `collection-${++pageSerial}` }),
    products: createProductIdentifier({ ...clocks, idFactory: () => `identification-${++productSerial}` }),
    report: createMarketIntelligenceReport({ ...clocks, idFactory: () => `market-report-${++reportSerial}` }),
  };

  return {
    validator,
    async run(input) {
      const started = now();
      const counts = new Map<RealMarketDiscoveryStage, number>(REAL_MARKET_DISCOVERY_STAGES.map((stage) => [stage, 0]));
      let completedCount = 0;
      const executionsOf = (): RealMarketDiscoveryExecution[] => REAL_MARKET_DISCOVERY_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
      const stageCount = () => executionsOf().reduce((sum, entry) => sum + entry.count, 0);
      const refused = (issues: RealMarketDiscoveryIssue[], metadata: RealMarketDiscoveryMetadata = {}): RealMarketDiscoveryResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepRealMarketDiscovery({
          status: "REJECTED",
          issues,
          searchSnapshot: null,
          serpRecords: null,
          sponsoredResults: null,
          landingPageSnapshots: null,
          observedProducts: null,
          report: null,
          graph: null,
          statistics: createRealMarketDiscoveryStatistics({ stageCount: stageCount(), completedCount, issueCount: issues.length, executionTime }),
          executions: executionsOf(),
          snapshot: null,
          metadata,
          executionTime,
        });
      };
      const call = (stage: RealMarketDiscoveryStage) => {
        counts.set(stage, (counts.get(stage) ?? 0) + 1);
      };

      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const createdAt = timestamp();
        const analysisId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? copyPlainRealMarketDiscovery(input.executionMetadata as RealMarketDiscoveryMetadata) : {};
        const bundle = {
          executionMetadata: metadata,
          runtimeMetadata: isRecord(input.runtimeMetadata) ? copyPlainRealMarketDiscovery(input.runtimeMetadata as RealMarketDiscoveryMetadata) : {},
          configuration: isRecord(input.configuration) ? copyPlainRealMarketDiscovery(input.configuration as RealMarketDiscoveryMetadata) : {},
        };
        const market = textOf(input.market).trim();
        const context: RealMarketDiscoveryContextRecord = {
          keyword: textOf(input.keyword).trim(),
          country: textOf(input.country),
          language: textOf(input.language),
          device: textOf(input.device),
          market,
          pages: Array.isArray(input.pages) ? copyPlainRealMarketDiscovery(input.pages as LandingPageResponse[]) : [],
        };

        call("SearchApiProvider");
        const retrieved = await hosts.provider.search({
          keyword: input.keyword,
          country: input.country,
          language: input.language,
          device: input.device,
          searchOptions: MARKET.test(market) ? { market } : {},
          ...bundle,
        });
        if (retrieved.status !== "OK" || retrieved.snapshot === null) {
          const missingKey = retrieved.issues.some((item) => /Missing API Key/.test(item.message));
          return refused([
            missingKey
              ? { field: "apiKey", message: "Missing API Key: SEARCHAPI_API_KEY is required." }
              : { field: "provider", message: "Provider Failure: the search provider refused the request." },
          ], metadata);
        }
        completedCount += 1;

        call("SearchApiNormalizer");
        const normalized = hosts.normalizer.normalize(retrieved);
        if (normalized.status !== "OK" || normalized.snapshot === null) {
          return refused([{ field: "providerResponse", message: "Malformed Provider Response: the provider response could not be normalized." }], metadata);
        }
        completedCount += 1;

        call("LandingPageCollector");
        const landing = hosts.landingPages.collect({
          sponsoredResults: normalized.snapshot.sponsoredResults,
          pages: input.pages,
          ...bundle,
        });
        if (landing.status !== "OK" || landing.snapshot === null || landing.pages === null) {
          return refused([{ field: "landingPageSnapshots", message: "Missing Landing Pages: landing page snapshots are required." }], metadata);
        }
        completedCount += 1;

        call("ProductIdentifier");
        const identified = hosts.products.identify({ landingPageSnapshots: landing.pages, ...bundle });
        if (identified.status !== "OK" || identified.snapshot === null || identified.products === null) {
          return refused([{ field: "observedProducts", message: "Missing Product Evidence: observed product evidence is required." }], metadata);
        }
        completedCount += 1;

        call("MarketIntelligenceReport");
        const reported = hosts.report.build({
          searchSnapshot: normalized.snapshot.searchSnapshot,
          serpRecords: normalized.snapshot.serpRecords,
          sponsoredResults: normalized.snapshot.sponsoredResults,
          landingPageSnapshots: landing.pages,
          observedProducts: identified.products,
          ...bundle,
        });
        if (reported.status !== "OK" || reported.snapshot === null || reported.report === null || reported.graph === null) {
          return refused([{ field: "report", message: "Invalid Pipeline Metadata: the market report could not be restated." }], metadata);
        }
        completedCount += 1;

        const executionTime = Math.max(0, now() - started);
        const statistics = createRealMarketDiscoveryStatistics({ stageCount: stageCount(), completedCount, issueCount: 0, executionTime });
        const snapshot = createRealMarketDiscoverySnapshot({
          analysisId,
          searchSnapshot: normalized.snapshot.searchSnapshot,
          serpRecords: normalized.snapshot.serpRecords,
          sponsoredResults: normalized.snapshot.sponsoredResults,
          landingPageSnapshots: landing.pages,
          observedProducts: identified.products,
          report: reported.report,
          graph: reported.graph,
          statistics,
          executions: executionsOf(),
          context,
          createdAt,
          metadata,
        });
        const snapshotIssues = validator.validateSnapshot(snapshot);
        if (snapshotIssues.length > 0) return refused(snapshotIssues, metadata);
        return freezeDeepRealMarketDiscovery({
          status: "OK",
          issues: [],
          searchSnapshot: snapshot.searchSnapshot,
          serpRecords: snapshot.serpRecords,
          sponsoredResults: snapshot.sponsoredResults,
          landingPageSnapshots: snapshot.landingPageSnapshots,
          observedProducts: snapshot.observedProducts,
          report: snapshot.report,
          graph: snapshot.graph,
          statistics: snapshot.statistics,
          executions: snapshot.executions,
          snapshot,
          metadata,
          executionTime,
        });
      } catch {
        return refused([{ field: "pipeline", message: "Invalid Pipeline Metadata: the pipeline could not restate the walk." }]);
      }
    },
  };
}
