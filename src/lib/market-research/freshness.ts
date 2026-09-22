import type { MarketResearchReport, MarketResearchStatus } from "@/lib/market-research/types";

export const DEFAULT_MARKET_RESEARCH_MAX_AGE_HOURS = 24;

export function marketResearchMaxAgeHours(): number {
  const raw = Number(process.env.MARKET_RESEARCH_MAX_AGE_HOURS || DEFAULT_MARKET_RESEARCH_MAX_AGE_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_MARKET_RESEARCH_MAX_AGE_HOURS;
  return raw;
}

export function researchAgeHours(researchedAt: string, now = Date.now()): number {
  const then = Date.parse(researchedAt);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return (now - then) / 3_600_000;
}

export function freshnessStatus(
  researchedAt: string,
  maxAgeHours = marketResearchMaxAgeHours(),
  now = Date.now(),
): MarketResearchStatus {
  return researchAgeHours(researchedAt, now) > maxAgeHours ? "STALE" : "FRESH";
}

export function withFreshness(report: MarketResearchReport, now = Date.now()): MarketResearchReport {
  if (report.status === "UNAVAILABLE") return report;
  return { ...report, status: freshnessStatus(report.researchedAt, report.maxAgeHours, now) };
}
