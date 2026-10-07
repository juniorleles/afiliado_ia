/**
 * Host record domain: product intelligence report statistics.
 *
 * Counts observed evidence bundles, missing bundles, and warnings on one
 * frozen report. Counts are restated observations. They are not a judgment
 * of a product. This module does not fetch a page and does not run another
 * engine.
 */
import { freezeDeepProductReport, type ProductIntelligenceReport } from "./product-report-snapshot";

export const PRODUCT_REPORT_STATISTICS_KEYS = ["bundleCount", "missingCount", "warningCount", "executionTime"] as const;

export interface ProductReportStatistics {
  bundleCount: number;
  missingCount: number;
  warningCount: number;
  executionTime: number;
}

export function computeProductReportStatistics(init: ProductReportStatistics): ProductReportStatistics {
  return freezeDeepProductReport({
    bundleCount: init.bundleCount,
    missingCount: init.missingCount,
    warningCount: init.warningCount,
    executionTime: init.executionTime,
  });
}

export function statisticsOf(report: ProductIntelligenceReport | null, executionTime = 0): ProductReportStatistics {
  if (!report) {
    return computeProductReportStatistics({ bundleCount: 0, missingCount: 0, warningCount: 0, executionTime });
  }
  return computeProductReportStatistics({
    bundleCount: report.dataQuality.presentCount,
    missingCount: report.dataQuality.missingCount,
    warningCount: report.warnings.length,
    executionTime,
  });
}
