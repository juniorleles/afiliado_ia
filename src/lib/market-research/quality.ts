import type {
  FamilyCoverageStatus,
  MarketDiversity,
  MarketEvidence,
  MarketQueryOutcome,
  MarketResearchQuality,
  MarketSourceClass,
  QueryFamilyId,
} from "@/lib/market-research/types";
import { QUERY_FAMILY_IDS } from "@/lib/market-research/types";

export function emptyDiversity(): MarketDiversity {
  return {
    UNIQUE_DOMAINS: 0,
    SOURCE_CLASS_DIVERSITY: 0,
    SOURCE_CLASSES: [],
    PROMOTIONAL_SOURCES: 0,
    PROMOTIONAL_SOURCE_RATIO: 0,
    PROMOTIONAL_PATTERN_DETECTED: false,
    SEARCH_RESULTS_TOTAL: 0,
    USABLE_SOURCES: 0,
  };
}

export function measureDiversity(
  allHits: MarketEvidence[],
  usable: MarketEvidence[],
  promoPatternDetected: boolean,
): MarketDiversity {
  const domains = new Set(usable.map((item) => item.domain).filter(Boolean));
  const classes = [...new Set(usable.map((item) => item.classification))] as MarketSourceClass[];
  const meaningful = classes.filter((item) => item !== "OTHER" && item !== "UNKNOWN");
  const promo = usable.filter((item) => item.promotional).length;
  return {
    UNIQUE_DOMAINS: domains.size,
    SOURCE_CLASS_DIVERSITY: meaningful.length,
    SOURCE_CLASSES: classes,
    PROMOTIONAL_SOURCES: promo,
    PROMOTIONAL_SOURCE_RATIO: usable.length ? promo / usable.length : 0,
    PROMOTIONAL_PATTERN_DETECTED: promoPatternDetected,
    SEARCH_RESULTS_TOTAL: allHits.length,
    USABLE_SOURCES: usable.length,
  };
}

export function scoreResearchQuality(input: {
  usable: number;
  uniqueDomains: number;
  classDiversity: number;
  promotionalRatio: number;
  promoPattern: boolean;
  familiesCovered: number;
  unavailable?: boolean;
}): MarketResearchQuality {
  if (input.unavailable || input.usable < 3) return "INSUFFICIENT";
  if (input.promoPattern && input.promotionalRatio >= 0.5) return "LOW";
  if (input.promotionalRatio >= 0.6 || input.uniqueDomains < 3 || input.classDiversity < 2) return "LOW";
  if (
    input.usable >= 6 &&
    input.uniqueDomains >= 5 &&
    input.classDiversity >= 3 &&
    input.promotionalRatio < 0.4 &&
    input.familiesCovered >= 3
  ) {
    return "HIGH";
  }
  if (input.usable >= 4 && input.uniqueDomains >= 3 && input.classDiversity >= 2 && input.promotionalRatio < 0.6) {
    return "MEDIUM";
  }
  return "LOW";
}

export function familiesCovered(sources: MarketEvidence[]): number {
  return new Set(sources.map((item) => item.queryFamily)).size;
}

export function queryFamilyCoverage(used: QueryFamilyId[]): number {
  return new Set(used).size;
}

export function familyCoverageFromOutcomes(
  outcomes: MarketQueryOutcome[],
): Record<QueryFamilyId, FamilyCoverageStatus> {
  const result = {} as Record<QueryFamilyId, FamilyCoverageStatus>;
  for (const family of QUERY_FAMILY_IDS) {
    const rows = outcomes.filter((item) => item.family === family);
    if (rows.length === 0) {
      result[family] = "NOT_EXECUTED";
      continue;
    }
    const failed = rows.filter(
      (item) =>
        item.status === "SEARCH_TIMEOUT" ||
        item.status === "HTTP_ERROR" ||
        item.status === "PARSE_ERROR" ||
        item.status === "ABORTED",
    );
    if (rows.some((item) => item.usableHits > 0)) {
      result[family] = "COVERED";
      continue;
    }
    if (failed.length === rows.length) {
      result[family] = "FAILED";
      continue;
    }
    result[family] = "EXECUTED_NO_USABLE";
  }
  return result;
}
