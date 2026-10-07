/**
 * Host record domain: recommendation rules.
 *
 * Each rule reads indicators already on the performance report. A rule copies
 * those rows. It does not derive a new figure and it does not change a campaign.
 */
import type { PerformanceIndicator, PerformanceReport } from "../performance-analysis/performance-snapshot";
import type { OptimizationRule, RecommendationView } from "./optimization-types";

export const HIGH_BUDGET_CONSUMPTION = 0.8;
export const LOW_BUDGET_CONSUMPTION = 0.2;

function campaignIndicator(report: PerformanceReport, name: string): PerformanceIndicator | null {
  for (const indicator of report.indicators) {
    if (indicator.level === "CAMPAIGN" && indicator.resourceName === report.campaignResourceName && indicator.name === name) return indicator;
  }
  return null;
}

function matching(report: PerformanceReport, level: PerformanceIndicator["level"], name: string, direction: PerformanceIndicator["direction"]): PerformanceIndicator[] {
  const rows: PerformanceIndicator[] = [];
  for (const indicator of report.indicators) {
    if (indicator.level === level && indicator.name === name && indicator.direction === direction) rows.push(indicator);
  }
  return rows;
}

function heldOrRose(indicator: PerformanceIndicator | null): boolean {
  return indicator !== null && (indicator.direction === "Stable Performance" || indicator.direction === "Performance Increase");
}

function fell(indicator: PerformanceIndicator | null): boolean {
  return indicator !== null && indicator.direction === "Performance Decrease";
}

export function hasPerformanceGap(report: PerformanceReport): boolean {
  for (const indicator of report.indicators) {
    if (indicator.direction === "Missing Metrics" || indicator.direction === "Incomplete Data") return true;
  }
  for (const finding of report.findings) {
    if (finding.classification === "Anomalies") return true;
  }
  return false;
}

function gapRows(report: PerformanceReport): PerformanceIndicator[] {
  const marked = new Set<string>();
  for (const finding of report.findings) {
    if (finding.classification === "Anomalies") marked.add(`${finding.resourceName}\n${finding.indicator}`);
  }
  const rows: PerformanceIndicator[] = [];
  for (const indicator of report.indicators) {
    if (indicator.direction === "Missing Metrics" || indicator.direction === "Incomplete Data" || marked.has(`${indicator.resourceName}\n${indicator.name}`)) rows.push(indicator);
  }
  return rows;
}

export const OPTIMIZATION_RULES: readonly OptimizationRule[] = [
  {
    id: "INCREASE_BUDGET",
    kind: "Increase Budget",
    independent: true,
    boundNote: "The collected budget consumption is at or above 0.8 and the conversion trend did not fall.",
    applies(view) {
      const budget = campaignIndicator(view.report, "Budget Consumption");
      const conversions = campaignIndicator(view.report, "Conversion Trend");
      return budget !== null && budget.current !== null && budget.current >= HIGH_BUDGET_CONSUMPTION && budget.direction === "Performance Increase" && heldOrRose(conversions);
    },
    select(view) {
      const budget = campaignIndicator(view.report, "Budget Consumption");
      const conversions = campaignIndicator(view.report, "Conversion Trend");
      return budget && conversions ? [budget, conversions] : [];
    },
  },
  {
    id: "REDUCE_BUDGET",
    kind: "Reduce Budget",
    independent: true,
    boundNote: "The collected budget consumption is below 0.2 and the conversion trend did not rise.",
    applies(view) {
      const budget = campaignIndicator(view.report, "Budget Consumption");
      const conversions = campaignIndicator(view.report, "Conversion Trend");
      return budget !== null && budget.current !== null && budget.current < LOW_BUDGET_CONSUMPTION && (budget.direction === "Performance Decrease" || budget.direction === "Stable Performance") && conversions !== null && conversions.direction !== "Performance Increase";
    },
    select(view) {
      const budget = campaignIndicator(view.report, "Budget Consumption");
      const conversions = campaignIndicator(view.report, "Conversion Trend");
      return budget && conversions ? [budget, conversions] : [];
    },
  },
  {
    id: "REVIEW_RSA_HEADLINES",
    kind: "Review RSA Headlines",
    independent: true,
    boundNote: "An RSA CTR trend fell.",
    applies: (view) => matching(view.report, "RSA", "CTR Trend", "Performance Decrease").length > 0,
    select: (view) => matching(view.report, "RSA", "CTR Trend", "Performance Decrease"),
  },
  {
    id: "REVIEW_RSA_DESCRIPTIONS",
    kind: "Review RSA Descriptions",
    independent: true,
    boundNote: "An RSA conversion trend fell.",
    applies: (view) => matching(view.report, "RSA", "Conversion Trend", "Performance Decrease").length > 0,
    select: (view) => matching(view.report, "RSA", "Conversion Trend", "Performance Decrease"),
  },
  {
    id: "REVIEW_LANDING_PAGE",
    kind: "Review Landing Page",
    independent: true,
    boundNote: "The campaign conversion trend fell.",
    applies: (view) => fell(campaignIndicator(view.report, "Conversion Trend")),
    select(view) {
      const conversions = campaignIndicator(view.report, "Conversion Trend");
      const clicks = campaignIndicator(view.report, "Click Trend");
      return conversions && clicks ? [conversions, clicks] : [];
    },
  },
  {
    id: "REVIEW_KEYWORDS",
    kind: "Review Keywords",
    independent: true,
    boundNote: "The campaign CTR trend and the click trend fell.",
    applies(view) {
      return fell(campaignIndicator(view.report, "CTR Trend")) && fell(campaignIndicator(view.report, "Click Trend"));
    },
    select(view) {
      const ctr = campaignIndicator(view.report, "CTR Trend");
      const clicks = campaignIndicator(view.report, "Click Trend");
      return ctr && clicks ? [ctr, clicks] : [];
    },
  },
  {
    id: "REVIEW_SEARCH_TERMS",
    kind: "Review Search Terms",
    independent: true,
    boundNote: "A campaign search impression share trend fell.",
    applies(view) {
      return fell(campaignIndicator(view.report, "Search Impression Share Trend")) || fell(campaignIndicator(view.report, "Top Impression Share Trend")) || fell(campaignIndicator(view.report, "Absolute Top Impression Share Trend"));
    },
    select(view) {
      const rows: PerformanceIndicator[] = [];
      for (const name of ["Search Impression Share Trend", "Top Impression Share Trend", "Absolute Top Impression Share Trend"]) {
        const indicator = campaignIndicator(view.report, name);
        if (fell(indicator) && indicator) rows.push(indicator);
      }
      return rows;
    },
  },
  {
    id: "REVIEW_AUDIENCE",
    kind: "Review Audience",
    independent: true,
    boundNote: "ROAS fell while the CTR trend did not fall.",
    applies(view) {
      return fell(campaignIndicator(view.report, "ROAS")) && heldOrRose(campaignIndicator(view.report, "CTR Trend"));
    },
    select(view) {
      const roas = campaignIndicator(view.report, "ROAS");
      const ctr = campaignIndicator(view.report, "CTR Trend");
      return roas && ctr ? [roas, ctr] : [];
    },
  },
  {
    id: "REVIEW_DEVICE_TARGETING",
    kind: "Review Device Targeting",
    independent: true,
    boundNote: "The CPC trend rose while the CTR trend fell.",
    applies(view) {
      const cpc = campaignIndicator(view.report, "CPC Trend");
      return cpc !== null && cpc.direction === "Performance Increase" && fell(campaignIndicator(view.report, "CTR Trend"));
    },
    select(view) {
      const cpc = campaignIndicator(view.report, "CPC Trend");
      const ctr = campaignIndicator(view.report, "CTR Trend");
      return cpc && ctr ? [cpc, ctr] : [];
    },
  },
  {
    id: "MONITOR_PERFORMANCE",
    kind: "Monitor Performance",
    independent: false,
    boundNote: "A collected figure is missing, incomplete, or marked Anomalies.",
    applies: (view) => hasPerformanceGap(view.report),
    select: (view) => gapRows(view.report),
  },
  {
    id: "NO_ACTION",
    kind: "No Action",
    independent: false,
    boundNote: "No independent action rule matched.",
    applies: (view) => !hasPerformanceGap(view.report),
    select: (view) => view.report.indicators.slice(),
  },
];
