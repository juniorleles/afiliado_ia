import { classifyPageIntent, intentFillsSlots, PAGE_INTENT_ORDER } from "@/lib/research-coverage/page-intent";
import type { CoverageSlot, PageIntent } from "@/lib/research-coverage/types";

export type RankableCandidate = {
  url: string;
  canonicalUrl: string;
  htmlOrder: number;
  anchorText?: string;
  title?: string;
};

export type RankedCandidate = RankableCandidate & {
  pageIntent: PageIntent;
  intentConfidence: "HIGH" | "MEDIUM" | "LOW";
  signals: string[];
  baseScore: number;
  gapBoost: number;
  diversityPenalty: number;
  score: number;
  reasons: string[];
  selected: boolean;
  exclusion?: string;
};

const BASE_SCORE: Record<PageIntent, number> = {
  PRICING: 100,
  SHIPPING: 95,
  REFUNDS: 95,
  GUARANTEE_TERMS: 90,
  INGREDIENTS_OR_SPECIFICATIONS: 85,
  USAGE_INSTRUCTIONS: 85,
  CAUTIONS: 80,
  FAQ: 75,
  PRODUCT_DETAILS: 70,
  CONTACT: 40,
  OTHER: 20,
  LEGAL: 10,
};

const GAP_BOOST = 50;
const DIVERSITY_PENALTY = 25;

export function rankResearchCandidates(input: {
  candidates: RankableCandidate[];
  gaps?: CoverageSlot[];
  limit: number;
}): { selected: RankedCandidate[]; excluded: RankedCandidate[]; inspected: RankedCandidate[] } {
  const gaps = input.gaps ?? [];
  const prepared = input.candidates.map((candidate) => {
    const classified = classifyPageIntent({
      url: candidate.url,
      anchorText: candidate.anchorText,
      title: candidate.title,
    });
    const fills = intentFillsSlots(classified.intent);
    const matchingGaps = fills.filter((slot) => gaps.includes(slot));
    const gapBoost = matchingGaps.length ? GAP_BOOST : 0;
    const reasons = [
      ...classified.notes,
      `Intent ${classified.intent} has base score ${BASE_SCORE[classified.intent]}.`,
    ];
    if (matchingGaps.length) {
      reasons.push(`Boosted because unresolved gaps include ${matchingGaps.join(", ")}.`);
    } else if (gaps.length) {
      reasons.push("No matching unresolved gap; default intent score is used.");
    }
    reasons.push("Ranking decides which URL to fetch. It does not decide whether a claim is true.");
    return {
      ...candidate,
      pageIntent: classified.intent,
      intentConfidence: classified.confidence,
      signals: classified.signals,
      baseScore: BASE_SCORE[classified.intent],
      gapBoost,
      diversityPenalty: 0,
      score: BASE_SCORE[classified.intent] + gapBoost,
      reasons,
      selected: false,
    } satisfies RankedCandidate;
  });

  const remaining = [...prepared];
  const selected: RankedCandidate[] = [];
  const counts = new Map<PageIntent, number>();

  while (remaining.length && selected.length < input.limit) {
    remaining.sort((a, b) => compareLive(a, b, counts));
    const next = remaining.shift();
    if (!next) break;
    const penalty = (counts.get(next.pageIntent) ?? 0) * DIVERSITY_PENALTY;
    next.diversityPenalty = penalty;
    next.score = next.baseScore + next.gapBoost - penalty;
    next.selected = true;
    if (penalty) next.reasons.push(`Diversity penalty ${penalty} after another ${next.pageIntent} page was already selected.`);
    selected.push(next);
    counts.set(next.pageIntent, (counts.get(next.pageIntent) ?? 0) + 1);
  }

  const excluded = remaining.map((item) => {
    const penalty = (counts.get(item.pageIntent) ?? 0) * DIVERSITY_PENALTY;
    return {
      ...item,
      diversityPenalty: penalty,
      score: item.baseScore + item.gapBoost - penalty,
      selected: false,
      exclusion: "discovered-URL limit after ranking",
    };
  });

  return { selected, excluded, inspected: [...selected, ...excluded] };
}

function compareLive(a: RankedCandidate, b: RankedCandidate, counts: Map<PageIntent, number>): number {
  const scoreA = a.baseScore + a.gapBoost - (counts.get(a.pageIntent) ?? 0) * DIVERSITY_PENALTY;
  const scoreB = b.baseScore + b.gapBoost - (counts.get(b.pageIntent) ?? 0) * DIVERSITY_PENALTY;
  if (scoreA !== scoreB) return scoreB - scoreA;
  const order = PAGE_INTENT_ORDER.indexOf(a.pageIntent) - PAGE_INTENT_ORDER.indexOf(b.pageIntent);
  if (order !== 0) return order;
  return a.canonicalUrl.localeCompare(b.canonicalUrl);
}
