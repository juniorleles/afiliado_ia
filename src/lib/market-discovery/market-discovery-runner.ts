/**
 * Host record domain: market discovery pipeline runner.
 *
 * Walks one keyword through the existing market discovery hosts, once each,
 * and returns a frozen analysis. A refused host stops the walk. This method
 * never throws and does not reach an outside system.
 */
import { createGoogleSearchConnector, type GoogleSearchConnector } from "./google-search-connector";
import { createGoogleSerpParser, type GoogleSerpParser } from "./google-serp-parser";
import { createLandingPageCollector, type LandingPageCollector } from "./landing-page-collector";
import type { LandingPageResponse } from "./landing-page-context";
import { createMarketDiscoveryValidator, type MarketDiscoveryValidator } from "./market-discovery-validator";
import {
  MARKET_DISCOVERY_STAGES,
  copyPlainMarketDiscovery,
  createMarketDiscoveryAnalysis,
  createMarketDiscoverySnapshot,
  createMarketDiscoveryStatistics,
  freezeDeepMarketDiscovery,
  type MarketDiscoveryContextRecord,
  type MarketDiscoveryExecution,
  type MarketDiscoveryIssue,
  type MarketDiscoveryMetadata,
  type MarketDiscoveryResult,
  type MarketDiscoveryStage,
} from "./market-discovery-snapshot";
import { createMarketIntelligenceReport, type MarketIntelligenceReportHost } from "./market-intelligence-report";
import { createProductIdentifier, type ProductIdentifier } from "./product-identifier";
import { createSponsoredResultsDetector, type SponsoredResultsDetector } from "./sponsored-results-detector";

export type MarketDiscoveryClock = () => number;
export type MarketDiscoveryTimestamp = () => string;
export type MarketDiscoveryIdFactory = () => string;

export interface MarketDiscoveryHosts {
  readonly search: GoogleSearchConnector;
  readonly serp: GoogleSerpParser;
  readonly sponsored: SponsoredResultsDetector;
  readonly landingPages: LandingPageCollector;
  readonly products: ProductIdentifier;
  readonly report: MarketIntelligenceReportHost;
}

export interface MarketDiscoveryRunnerOptions {
  now?: MarketDiscoveryClock;
  timestamp?: MarketDiscoveryTimestamp;
  idFactory?: MarketDiscoveryIdFactory;
  hosts?: MarketDiscoveryHosts;
}

export interface MarketDiscoveryRunner {
  readonly validator: MarketDiscoveryValidator;
  run(input: unknown): MarketDiscoveryResult;
}

const defaultClock: MarketDiscoveryClock = () => performance.now();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createMarketDiscoveryRunner(options: MarketDiscoveryRunnerOptions = {}): MarketDiscoveryRunner {
  const validator = createMarketDiscoveryValidator();
  const now = options.now ?? defaultClock;
  const timestamp = options.timestamp ?? (() => new Date().toISOString());
  let serial = 0;
  let searchSerial = 0;
  let serpSerial = 0;
  let sponsoredSerial = 0;
  let pageSerial = 0;
  let productSerial = 0;
  let reportSerial = 0;
  const idFactory = options.idFactory ?? (() => `discovery-${++serial}`);
  const clocks = { now, timestamp };
  const hosts = options.hosts ?? {
    search: createGoogleSearchConnector({ ...clocks, idFactory: () => `snapshot-${++searchSerial}` }),
    serp: createGoogleSerpParser({ ...clocks, idFactory: () => `serp-${++serpSerial}` }),
    sponsored: createSponsoredResultsDetector({ ...clocks, idFactory: () => `sponsored-${++sponsoredSerial}` }),
    landingPages: createLandingPageCollector({ ...clocks, idFactory: () => `collection-${++pageSerial}` }),
    products: createProductIdentifier({ ...clocks, idFactory: () => `identification-${++productSerial}` }),
    report: createMarketIntelligenceReport({ ...clocks, idFactory: () => `market-report-${++reportSerial}` }),
  };

  return {
    validator,
    run(input) {
      const started = now();
      const counts = new Map<MarketDiscoveryStage, number>(MARKET_DISCOVERY_STAGES.map((stage) => [stage, 0]));
      let completedCount = 0;
      const executionsOf = (): MarketDiscoveryExecution[] => MARKET_DISCOVERY_STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
      const stageCount = () => executionsOf().reduce((sum, entry) => sum + entry.count, 0);
      const refused = (issues: MarketDiscoveryIssue[], metadata: MarketDiscoveryMetadata = {}): MarketDiscoveryResult => {
        const executionTime = Math.max(0, now() - started);
        return freezeDeepMarketDiscovery({
          status: "REJECTED",
          issues,
          analysis: null,
          report: null,
          graph: null,
          statistics: createMarketDiscoveryStatistics({ stageCount: stageCount(), completedCount, issueCount: issues.length, executionTime }),
          snapshot: null,
          metadata,
          executionTime,
          executions: executionsOf(),
        });
      };
      const call = (stage: MarketDiscoveryStage) => {
        counts.set(stage, (counts.get(stage) ?? 0) + 1);
      };

      try {
        const issues = validator.validateInput(input);
        if (issues.length > 0 || !isRecord(input)) return refused(issues);
        const createdAt = timestamp();
        const analysisId = idFactory();
        const metadata = isRecord(input.executionMetadata) ? copyPlainMarketDiscovery(input.executionMetadata as MarketDiscoveryMetadata) : {};
        const bundle = {
          executionMetadata: metadata,
          runtimeMetadata: isRecord(input.runtimeMetadata) ? copyPlainMarketDiscovery(input.runtimeMetadata as MarketDiscoveryMetadata) : {},
          configuration: isRecord(input.configuration) ? copyPlainMarketDiscovery(input.configuration as MarketDiscoveryMetadata) : {},
        };
        const context: MarketDiscoveryContextRecord = {
          keyword: textOf(input.keyword).trim(),
          language: textOf(input.language),
          country: textOf(input.country),
          device: textOf(input.device),
          market: textOf(input.market),
          searchHtml: textOf(input.searchHtml),
          pages: Array.isArray(input.pages) ? copyPlainMarketDiscovery(input.pages as LandingPageResponse[]) : [],
        };

        call("GoogleSearchConnector");
        const search = hosts.search.collect({
          keyword: context.keyword,
          language: input.language,
          country: input.country,
          device: input.device,
          market: input.market,
          searchHtml: input.searchHtml,
          ...bundle,
        });
        if (search.status !== "OK" || search.snapshot === null) return refused([{ field: "searchSnapshot", message: "Missing Search Snapshot: a search snapshot is required." }], metadata);
        completedCount += 1;

        call("GoogleSerpParser");
        const serp = hosts.serp.parse({ searchSnapshot: search.snapshot, ...bundle });
        if (serp.status !== "OK" || serp.snapshot === null || serp.records === null) return refused([{ field: "serpRecords", message: "Missing SERP Records: SERP records are required." }], metadata);
        completedCount += 1;

        call("SponsoredResultsDetector");
        const sponsored = hosts.sponsored.detect({ serpRecords: serp.records, ...bundle });
        if (sponsored.status !== "OK" || sponsored.snapshot === null || sponsored.results === null) return refused([{ field: "sponsoredResults", message: "Missing Sponsored Results: sponsored results are required." }], metadata);
        completedCount += 1;

        call("LandingPageCollector");
        const landing = hosts.landingPages.collect({ sponsoredResults: sponsored.results, pages: input.pages, ...bundle });
        if (landing.status !== "OK" || landing.snapshot === null || landing.pages === null) return refused([{ field: "landingPageSnapshots", message: "Missing Landing Pages: landing page snapshots are required." }], metadata);
        completedCount += 1;

        call("ProductIdentifier");
        const identified = hosts.products.identify({ landingPageSnapshots: landing.pages, ...bundle });
        if (identified.status !== "OK" || identified.snapshot === null || identified.products === null) return refused([{ field: "observedProducts", message: "Missing Observed Products: observed products are required." }], metadata);
        completedCount += 1;

        call("MarketIntelligenceReport");
        const reported = hosts.report.build({
          searchSnapshot: search.snapshot,
          serpRecords: serp.records,
          sponsoredResults: sponsored.results,
          landingPageSnapshots: landing.pages,
          observedProducts: identified.products,
          ...bundle,
        });
        if (reported.status !== "OK" || reported.snapshot === null || reported.report === null || reported.graph === null) {
          return refused([{ field: "report", message: "Invalid Pipeline Metadata: the market report could not be restated." }], metadata);
        }
        completedCount += 1;

        const executionTime = Math.max(0, now() - started);
        const statistics = createMarketDiscoveryStatistics({ stageCount: stageCount(), completedCount, issueCount: 0, executionTime });
        const analysis = createMarketDiscoveryAnalysis({
          keyword: context.keyword,
          searchSnapshotId: search.snapshot.snapshotId,
          serpId: serp.snapshot.serpId,
          sponsoredId: sponsored.snapshot.sponsoredId,
          collectionId: landing.snapshot.collectionId,
          identificationId: identified.snapshot.identificationId,
          reportId: reported.snapshot.reportId,
          origin: "OBSERVED",
          provenance: "DIRECT_SOURCE",
        });
        const snapshot = createMarketDiscoverySnapshot({
          analysisId,
          analysis,
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
        return freezeDeepMarketDiscovery({
          status: "OK",
          issues: [],
          analysis: snapshot.analysis,
          report: snapshot.report,
          graph: snapshot.graph,
          statistics: snapshot.statistics,
          snapshot,
          metadata,
          executionTime,
          executions: snapshot.executions,
        });
      } catch (error) {
        return refused([{ field: "pipeline", message: error instanceof Error ? error.message : "Invalid Pipeline Metadata: the pipeline could not restate the walk." }]);
      }
    },
  };
}
