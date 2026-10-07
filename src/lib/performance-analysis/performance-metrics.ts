/**
 * Host record domain: performance arithmetic.
 *
 * Each result is one named operation on the supplied figures. A missing
 * figure stays null. A figure is not replaced with a substitute.
 */
import type { PerformanceDirection } from "./performance-snapshot";

export interface CalculatedSide {
  value: number | null;
  state: "ready" | "missing" | "incomplete";
}

export interface CombinedChange {
  current: number | null;
  historical: number | null;
  change: number | null;
  direction: PerformanceDirection;
}

export function differenceSide(value: number | null): CalculatedSide {
  if (value === null) return { value: null, state: "missing" };
  return { value, state: "ready" };
}

export function combineSides(current: CalculatedSide, historical: CalculatedSide): CombinedChange {
  const currentValue = current.state === "ready" ? current.value : null;
  const historicalValue = historical.state === "ready" ? historical.value : null;
  if (current.state === "missing" && historical.state === "missing") {
    return { current: null, historical: null, change: null, direction: "Missing Metrics" };
  }
  if (currentValue === null || historicalValue === null) {
    return { current: currentValue, historical: historicalValue, change: null, direction: "Incomplete Data" };
  }
  const change = currentValue - historicalValue;
  const direction = change > 0 ? "Performance Increase" : change < 0 ? "Performance Decrease" : "Stable Performance";
  return { current: currentValue, historical: historicalValue, change, direction };
}

/** CPA is cost divided by conversions. A zero conversion count is not divided. */
export function costPerConversion(cost: number | null, conversions: number | null): CalculatedSide {
  if (cost === null && conversions === null) return { value: null, state: "missing" };
  if (cost === null || conversions === null || conversions === 0) return { value: null, state: "incomplete" };
  return { value: cost / conversions, state: "ready" };
}

/** ROAS is conversion value divided by cost. A missing conversion value is not divided. */
export function returnOnAdSpend(conversionValue: number | null, cost: number | null): CalculatedSide {
  if (conversionValue === null) return { value: null, state: "missing" };
  if (cost === null || cost === 0) return { value: null, state: "incomplete" };
  return { value: conversionValue / cost, state: "ready" };
}

/** Budget consumption is cost divided by the supplied budget figure. A zero budget is not divided. */
export function budgetConsumption(cost: number | null, budget: number | null): CalculatedSide {
  if (cost === null && budget === null) return { value: null, state: "missing" };
  if (cost === null || budget === null || budget === 0) return { value: null, state: "incomplete" };
  return { value: cost / budget, state: "ready" };
}

export function outsideUnitInterval(value: number | null): boolean {
  return value !== null && (value < 0 || value > 1);
}

export function exceeds(left: number | null, right: number | null): boolean {
  return left !== null && right !== null && left > right;
}
