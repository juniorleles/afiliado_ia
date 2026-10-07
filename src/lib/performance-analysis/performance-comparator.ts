/**
 * Host record domain: performance comparator.
 *
 * Pairs one collected window with the prior window. The direction is the
 * sign of current minus historical. An inconsistency is recorded beside
 * that direction.
 */
import type { MetricValues } from "../optimization-metrics/metrics-snapshot";
import { budgetConsumption, combineSides, costPerConversion, differenceSide, exceeds, outsideUnitInterval, returnOnAdSpend } from "./performance-metrics";
import {
  CAMPAIGN_INDICATOR_NAMES,
  ENTITY_INDICATOR_NAMES,
  type PerformanceFinding,
  type PerformanceIndicator,
  type PerformanceLevel,
  type PerformanceMethod,
} from "./performance-snapshot";

export interface ComparisonBundle {
  indicators: PerformanceIndicator[];
  findings: PerformanceFinding[];
}

function fieldOf(metrics: MetricValues | null, field: keyof MetricValues): number | null {
  if (metrics === null) return null;
  return metrics[field];
}

export function comparePerformance(input: {
  level: PerformanceLevel;
  resourceName: string;
  current: MetricValues;
  historical: MetricValues | null;
  budgetAmountMicros: number | null;
  historicalBudgetAmountMicros: number | null;
}): ComparisonBundle {
  const indicators: PerformanceIndicator[] = [];
  const findings: PerformanceFinding[] = [];
  const names = input.level === "CAMPAIGN" ? CAMPAIGN_INDICATOR_NAMES : ENTITY_INDICATOR_NAMES;

  const add = (name: string, method: PerformanceMethod, currentSide: ReturnType<typeof differenceSide>, historicalSide: ReturnType<typeof differenceSide>, anomaly: boolean) => {
    const combined = combineSides(currentSide, historicalSide);
    indicators.push({
      name,
      resourceName: input.resourceName,
      level: input.level,
      current: combined.current,
      historical: combined.historical,
      change: combined.change,
      direction: combined.direction,
      method,
    });
    findings.push({ resourceName: input.resourceName, level: input.level, indicator: name, classification: combined.direction });
    if (anomaly) findings.push({ resourceName: input.resourceName, level: input.level, indicator: name, classification: "Anomalies" });
  };

  for (const name of names) {
    if (name === "CTR Trend") {
      add(name, "DIFFERENCE", differenceSide(fieldOf(input.current, "ctr")), differenceSide(fieldOf(input.historical, "ctr")), outsideUnitInterval(input.current.ctr) || outsideUnitInterval(fieldOf(input.historical, "ctr")));
    } else if (name === "CPC Trend") {
      add(name, "DIFFERENCE", differenceSide(fieldOf(input.current, "averageCpc")), differenceSide(fieldOf(input.historical, "averageCpc")), false);
    } else if (name === "Cost Trend") {
      add(name, "DIFFERENCE", differenceSide(fieldOf(input.current, "costMicros")), differenceSide(fieldOf(input.historical, "costMicros")), false);
    } else if (name === "Conversion Trend") {
      add(
        name,
        "DIFFERENCE",
        differenceSide(fieldOf(input.current, "conversions")),
        differenceSide(fieldOf(input.historical, "conversions")),
        exceeds(input.current.conversions, input.current.clicks) || exceeds(fieldOf(input.historical, "conversions"), fieldOf(input.historical, "clicks")),
      );
    } else if (name === "CPA") {
      add(name, "COST_DIVIDED_BY_CONVERSIONS", costPerConversion(input.current.costMicros, input.current.conversions), costPerConversion(fieldOf(input.historical, "costMicros"), fieldOf(input.historical, "conversions")), false);
    } else if (name === "ROAS") {
      add(name, "CONVERSION_VALUE_DIVIDED_BY_COST", returnOnAdSpend(input.current.conversionValue, input.current.costMicros), returnOnAdSpend(fieldOf(input.historical, "conversionValue"), fieldOf(input.historical, "costMicros")), false);
    } else if (name === "Impression Trend") {
      add(name, "DIFFERENCE", differenceSide(fieldOf(input.current, "impressions")), differenceSide(fieldOf(input.historical, "impressions")), false);
    } else if (name === "Click Trend") {
      add(
        name,
        "DIFFERENCE",
        differenceSide(fieldOf(input.current, "clicks")),
        differenceSide(fieldOf(input.historical, "clicks")),
        exceeds(input.current.clicks, input.current.impressions) || exceeds(fieldOf(input.historical, "clicks"), fieldOf(input.historical, "impressions")),
      );
    } else if (name === "Budget Consumption") {
      const currentSide = budgetConsumption(input.current.costMicros, input.budgetAmountMicros);
      const historicalSide = budgetConsumption(fieldOf(input.historical, "costMicros"), input.historicalBudgetAmountMicros);
      const anomaly = (currentSide.state === "ready" && currentSide.value !== null && currentSide.value > 1) || (historicalSide.state === "ready" && historicalSide.value !== null && historicalSide.value > 1);
      add(name, "COST_DIVIDED_BY_BUDGET", currentSide, historicalSide, anomaly);
    } else if (name === "Search Impression Share Trend") {
      add(name, "DIFFERENCE", differenceSide(fieldOf(input.current, "searchImpressionShare")), differenceSide(fieldOf(input.historical, "searchImpressionShare")), outsideUnitInterval(input.current.searchImpressionShare) || outsideUnitInterval(fieldOf(input.historical, "searchImpressionShare")));
    } else if (name === "Top Impression Share Trend") {
      add(name, "DIFFERENCE", differenceSide(fieldOf(input.current, "searchTopImpressionShare")), differenceSide(fieldOf(input.historical, "searchTopImpressionShare")), outsideUnitInterval(input.current.searchTopImpressionShare) || outsideUnitInterval(fieldOf(input.historical, "searchTopImpressionShare")));
    } else if (name === "Absolute Top Impression Share Trend") {
      add(name, "DIFFERENCE", differenceSide(fieldOf(input.current, "searchAbsoluteTopImpressionShare")), differenceSide(fieldOf(input.historical, "searchAbsoluteTopImpressionShare")), outsideUnitInterval(input.current.searchAbsoluteTopImpressionShare) || outsideUnitInterval(fieldOf(input.historical, "searchAbsoluteTopImpressionShare")));
    }
  }

  return { indicators, findings };
}
