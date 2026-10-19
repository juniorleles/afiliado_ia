import { getDb } from "@/lib/db";
import type { MarketIntelligenceAnalysis } from "@/lib/market-intelligence/analyze";

function isAnalysis(value: unknown): value is MarketIntelligenceAnalysis {
  if (typeof value !== "object" || value === null) return false;
  const row = value as MarketIntelligenceAnalysis;
  return typeof row.marketSummary === "object"
    && row.marketSummary !== null
    && typeof row.confidence === "number"
    && Array.isArray(row.dominantHeadlinePatterns)
    && Array.isArray(row.opportunities)
    && typeof row.dominantStructure === "object";
}

export function readStoredMarketAnalysis(campaignId: number): MarketIntelligenceAnalysis | null {
  const row = getDb().prepare("SELECT marketIntelligenceAnalysisJson FROM campaigns WHERE id = ?").get(campaignId) as
    | { marketIntelligenceAnalysisJson: string | null }
    | undefined;
  if (!row?.marketIntelligenceAnalysisJson) return null;
  try {
    const parsed = JSON.parse(row.marketIntelligenceAnalysisJson) as unknown;
    return isAnalysis(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredMarketAnalysis(campaignId: number, analysis: MarketIntelligenceAnalysis): void {
  getDb()
    .prepare("UPDATE campaigns SET marketIntelligenceAnalysisJson = ? WHERE id = ?")
    .run(JSON.stringify(analysis), campaignId);
}
