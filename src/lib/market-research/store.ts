import { getDb } from "@/lib/db";
import { withFreshness } from "@/lib/market-research/freshness";
import {
  MARKET_RESEARCH_QUALITIES,
  MARKET_RESEARCH_STATUSES,
  type MarketResearchReport,
} from "@/lib/market-research/types";

export type StoredMarketResearch = {
  report: MarketResearchReport;
  durationMs: number | null;
};

function isReport(value: unknown): value is MarketResearchReport {
  if (typeof value !== "object" || value === null) return false;
  const row = value as MarketResearchReport;
  return typeof row.productName === "string"
    && typeof row.researchedAt === "string"
    && (MARKET_RESEARCH_STATUSES as readonly string[]).includes(row.status)
    && (MARKET_RESEARCH_QUALITIES as readonly string[]).includes(row.quality)
    && Array.isArray(row.sources)
    && Array.isArray(row.queriesUsed)
    && Array.isArray(row.queryOutcomes)
    && Array.isArray(row.queryFamilies)
    && typeof row.signals === "object"
    && row.signals !== null
    && typeof row.diversity === "object"
    && row.diversity !== null
    && typeof row.searchProvider === "object"
    && row.searchProvider !== null;
}

function unwrap(value: unknown): StoredMarketResearch | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as { report?: unknown; durationMs?: unknown };
  if (isReport(row.report)) {
    return { report: row.report, durationMs: typeof row.durationMs === "number" ? row.durationMs : null };
  }
  if (isReport(value)) return { report: value, durationMs: null };
  return null;
}

export function readStoredMarketResearch(campaignId: number): StoredMarketResearch | null {
  const row = getDb().prepare("SELECT marketResearchJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { marketResearchJson: string | null }
    | undefined;
  if (!row?.marketResearchJson) return null;
  try {
    const stored = unwrap(JSON.parse(row.marketResearchJson));
    if (!stored) return null;
    return { report: withFreshness(stored.report), durationMs: stored.durationMs };
  } catch {
    return null;
  }
}

export function writeStoredMarketResearch(campaignId: number, report: MarketResearchReport, durationMs: number): void {
  getDb()
    .prepare("UPDATE campaigns SET marketResearchJson = ? WHERE id = ?")
    .run(JSON.stringify({ report, durationMs: Math.max(0, Math.round(durationMs)) }), campaignId);
}
