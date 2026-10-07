/**
 * Host record domain: market intelligence report statistics.
 *
 * Counts the artifacts, warnings, and missing sections on one report.
 * Counts restate what was supplied. This module does not reach an outside
 * system.
 */
import { freezeDeepMarketReport } from "./market-report-snapshot";
import { MARKET_REPORT_STATISTICS_KEYS, type MarketReportStatisticsShape } from "./market-report-types";

export { MARKET_REPORT_STATISTICS_KEYS };

export type MarketReportStatistics = MarketReportStatisticsShape;

export function createMarketReportStatistics(init: MarketReportStatistics): MarketReportStatistics {
  return freezeDeepMarketReport({
    searchCount: init.searchCount,
    serpCount: init.serpCount,
    sponsoredCount: init.sponsoredCount,
    landingPageCount: init.landingPageCount,
    observedProductCount: init.observedProductCount,
    warningCount: init.warningCount,
    missingCount: init.missingCount,
    executionTime: init.executionTime,
  });
}
