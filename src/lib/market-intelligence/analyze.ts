import type { StrategyFamily, StrategyRecommendation } from "@/lib/strategy/types";
import type { MarketResearchReport, MarketSourceClass } from "@/lib/market-research/types";

export type HeadlinePattern = {
  pattern: string;
  count: number;
  percent: number;
  examples: string[];
};

export type DominantBenefit = {
  label: string;
  count: number;
  domains: string[];
};

export type DominantFaq = {
  label: string;
  count: number;
  examples: string[];
};

export type MarketOpportunity = {
  reason: string;
  count: number;
  confidence: number;
};

export type MarketIntelligenceAnalysis = {
  marketSummary: {
    narrative: string;
    recommendedStrategy: StrategyFamily | null;
    strategyLabel: string;
    strategyConfidence: string;
    researchQuality: string;
    buyerIntent: string;
    reasons: string[];
    researchedAt: string;
  };
  dominantStructure: {
    sections: Array<{ name: string; count: number; percent: number }>;
    summary: string;
  };
  dominantHeadlinePatterns: HeadlinePattern[];
  dominantBenefits: DominantBenefit[];
  dominantFaq: DominantFaq[];
  dominantGuarantee: { label: string | null; count: number; examples: string[] };
  dominantPricing: {
    currency: string | null;
    minimum: number | null;
    maximum: number | null;
    average: number | null;
    predominant: number | null;
    count: number;
  };
  dominantAudience: {
    sexes: Array<{ label: string; count: number }>;
    ages: string[];
    pains: string[];
    goals: string[];
  };
  dominantObjections: Array<{ text: string; count: number }>;
  dominantClaims: {
    common: Array<{ text: string; count: number; domains: string[] }>;
    risky: Array<{ text: string; level: string; count: number }>;
    prohibited: Array<{ text: string; level: string; count: number }>;
  };
  dominantCTA: { text: string | null; count: number; percent: number };
  dominantKeywords: Array<{ keyword: string; count: number }>;
  dominantScientificTopics: Array<{ type: string; count: number }>;
  dominantPolicyRisks: Array<{ claim: string; level: "Baixo" | "Médio" | "Alto"; count: number }>;
  competitorsRank: Array<{ domain: string; classification: MarketSourceClass; pages: number }>;
  marketGaps: string[];
  opportunities: MarketOpportunity[];
  confidence: number;
};

const NOT_FOUND = "Não encontrado durante a pesquisa.";
const STOP = new Set(["the", "a", "an", "of", "to", "and", "for", "your", "with", "that", "this", "from", "in", "on", "it", "is", "are", "may", "can", "into", "than", "its", "supports", "support", "helps", "help", "boosts", "boost", "improves", "improve", "what", "how", "when", "where", "who", "why", "does", "did", "will", "any", "there", "should", "would", "could", "until", "about"]);
const HEADLINE_PATTERNS: Array<{ pattern: string; test: (text: string) => boolean }> = [
  { pattern: "Pergunta", test: (text) => text.includes("?") || /^(what|why|how|is|are|do|does|can)\b/i.test(text) },
  { pattern: "Número", test: (text) => /\b\d+\b/.test(text) },
  { pattern: "Como fazer", test: (text) => /\bhow to\b/i.test(text) },
  { pattern: "Comparação", test: (text) => /\bvs\.?\b|\bcompar/i.test(text) },
  { pattern: "Segredo", test: (text) => /\bsecret\b/i.test(text) },
  { pattern: "Científico", test: (text) => /\b(study|clinical|evidence|research)\b/i.test(text) },
  { pattern: "Review", test: (text) => /\breviews?\b/i.test(text) },
  { pattern: "Curiosidade", test: (text) => /\b(why|what if)\b/i.test(text) },
  { pattern: "Problema", test: (text) => /\b(pain|problem|ache|stiffness)\b/i.test(text) },
];
const RISK_LEVEL: Record<string, "Baixo" | "Médio" | "Alto"> = {
  Cure: "Alto",
  Reverse: "Alto",
  Guaranteed: "Alto",
  "Doctor Approved": "Alto",
  Miracle: "Alto",
  "100%": "Alto",
  Permanent: "Alto",
  Instant: "Médio",
};

function riskLevel(claim: string, stored: string): "Baixo" | "Médio" | "Alto" {
  if (stored === "Baixo" || stored === "Médio" || stored === "Alto") return stored;
  return RISK_LEVEL[claim] ?? "Baixo";
}

const STRATEGY_LABEL: Record<StrategyFamily, string> = {
  REVIEW: "Revisão",
  EDUCATIONAL: "Educativo",
  BUYER_GUIDE: "Guia de compra",
};
const CONFIDENCE_LABEL = { HIGH: "Alta", MEDIUM: "Média", LOW: "Baixa" } as const;

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stem(token: string): string {
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
}

function tokens(text: string): string[] {
  return clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

function sameToken(left: string, right: string): boolean {
  return left === right || (left.length >= 4 && right.length >= 4 && (left.startsWith(right) || right.startsWith(left)));
}

function overlap(left: string[], right: string[]): number {
  const used = new Set<number>();
  let count = 0;
  for (const token of left) {
    const index = right.findIndex((other, position) => !used.has(position) && sameToken(token, other));
    if (index >= 0) {
      used.add(index);
      count += 1;
    }
  }
  return count;
}

function similar(left: string, right: string): boolean {
  const a = tokens(left);
  const b = tokens(right);
  if (a.length === 0 || b.length === 0) return false;
  const shared = overlap(a, b);
  if (shared < 2) return false;
  const union = a.length + b.length - shared;
  const jaccard = shared / union;
  const shorter = Math.min(a.length, b.length);
  if (shorter <= 2) return jaccard >= 0.6;
  return shared / shorter >= 0.6 && jaccard >= 0.34;
}

function percent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function groupTexts(items: Array<{ text: string; count: number; domain?: string }>, mode: "shared" | "shortest" = "shared"): Array<{ label: string; count: number; domains: string[]; examples: string[] }> {
  const groups: Array<{ texts: string[]; count: number; domains: string[] }> = [];
  for (const item of items) {
    const found = groups.find((group) => group.texts.every((text) => similar(text, item.text)));
    if (found) {
      found.texts.push(item.text);
      found.count += item.count;
      if (item.domain && !found.domains.includes(item.domain)) found.domains.push(item.domain);
      continue;
    }
    groups.push({ texts: [item.text], count: item.count, domains: item.domain ? [item.domain] : [] });
  }
  return groups
    .map((group) => {
      const shared = tokens(group.texts[0] ?? "").filter((token) => group.texts.every((text) => tokens(text).some((other) => sameToken(token, other))));
      const shortest = clean(group.texts.slice().sort((a, b) => a.length - b.length)[0] ?? "").slice(0, 90);
      const label = mode === "shared" && group.texts.length > 1 && shared.length >= 2
        ? shared.slice(0, 3).map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(" ")
        : shortest;
      return { label, count: group.count, domains: group.domains, examples: group.texts.slice(0, 3).map((text) => clean(text).slice(0, 140)) };
    })
    .sort((a, b) => b.count - a.count);
}

function headlinesOf(report: MarketResearchReport): string[] {
  const values = [
    ...report.sources.map((source) => source.title),
    ...(report.pageInsights ?? []).map((page) => page.headline ?? ""),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function parseAmount(raw: string): { amount: number; currency: string } | null {
  const currency = /R\$|BRL/i.test(raw) ? "BRL" : /€|EUR/i.test(raw) ? "EUR" : /£|GBP/i.test(raw) ? "GBP" : /\$|USD/i.test(raw) ? "USD" : null;
  if (!currency || /%/.test(raw)) return null;
  const match = raw.match(/\d{1,4}(?:[.,]\d{1,2})?/);
  if (!match) return null;
  const amount = Number(match[0].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 5000) return null;
  return { amount, currency };
}

function confidenceOf(report: MarketResearchReport, opened: number): number {
  const usable = report.sources.filter((source) => source.usable).length;
  const coverage = usable === 0 ? 0 : Math.min(1, opened / usable);
  const cap = report.quality === "HIGH" ? 0.9 : report.quality === "MEDIUM" ? 0.7 : report.quality === "LOW" ? 0.45 : 0.2;
  return Math.round(Math.min(coverage, cap) * 100) / 100;
}

export function analyzeMarketIntelligence(
  report: MarketResearchReport,
  recommendation: StrategyRecommendation | null,
): MarketIntelligenceAnalysis {
  const opened = (report.pageInsights ?? []).filter((page) => page.status === "ENRICHED" || page.status === "CACHED");
  const openedCount = opened.length;
  const headlines = headlinesOf(report);
  const headlinePatterns = HEADLINE_PATTERNS.map((item) => {
    const examples = headlines.filter(item.test);
    return { pattern: item.pattern, count: examples.length, percent: percent(examples.length, headlines.length), examples: examples.slice(0, 3) };
  }).filter((item) => item.count > 0).sort((a, b) => b.count - a.count);

  const benefitGroups = groupTexts((report.benefits ?? []).map((item) => ({ text: item.text, count: item.count, domain: item.domain })));
  const faqGroups = groupTexts((report.faq ?? []).map((item) => ({ text: item.question, count: 1, domain: item.domain })), "shortest");
  const guarantees = new Map<string, { count: number; examples: string[] }>();
  for (const item of report.guarantees ?? []) {
    const moneyBack = /\bmoney[- ]back\b/i.test(item.text);
    const days = item.days?.match(/\d{1,3}/)?.[0]
      ?? item.text.match(/\b(\d{1,3})\s*-?\s*days?\b/i)?.[1]
      ?? (moneyBack ? item.text.match(/\b(\d{1,3})\b/)?.[1] : null)
      ?? null;
    const label = days ? `${days}-Day Guarantee` : moneyBack ? "Money-back" : null;
    if (!label) continue;
    const current = guarantees.get(label) ?? { count: 0, examples: [] };
    current.count += 1;
    if (current.examples.length < 3) current.examples.push(clean(item.text).slice(0, 140));
    guarantees.set(label, current);
  }
  const dominantGuaranteeEntry = [...guarantees.entries()].sort((a, b) => b[1].count - a[1].count)[0];

  const prices = (report.pricing ?? []).map((item) => parseAmount(`${item.price} ${item.currency}`)).filter((item): item is { amount: number; currency: string } => item !== null);
  const currencyCounts = new Map<string, number>();
  for (const item of prices) currencyCounts.set(item.currency, (currencyCounts.get(item.currency) ?? 0) + 1);
  const currency = [...currencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const amounts = prices.filter((item) => item.currency === currency).map((item) => item.amount);
  const frequency = new Map<number, number>();
  for (const amount of amounts) frequency.set(amount, (frequency.get(amount) ?? 0) + 1);
  const predominant = [...frequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const ctaTotal = (report.ctaPatterns ?? []).reduce((sum, item) => sum + item.frequency, 0);
  const dominantCta = [...(report.ctaPatterns ?? [])].sort((a, b) => b.frequency - a.frequency)[0];
  const structureCounts = new Map<string, number>();
  for (const page of opened) {
    for (const name of new Set(page.structures)) structureCounts.set(name, (structureCounts.get(name) ?? 0) + 1);
  }
  const sections = [...structureCounts.entries()]
    .map(([name, count]) => ({ name, count, percent: percent(count, openedCount) }))
    .sort((a, b) => b.count - a.count);
  const competitors = new Map<string, { classification: MarketSourceClass; pages: number }>();
  for (const source of report.sources) {
    if (!source.domain) continue;
    const current = competitors.get(source.domain);
    if (current) current.pages += 1;
    else competitors.set(source.domain, { classification: source.classification, pages: 1 });
  }

  const keywordCounts = new Map<string, number>();
  const blobs = report.sources.map((source) => `${source.title} ${source.relevantEvidence}`.toLowerCase());
  for (const term of report.signals.recurringTerminology) {
    const needle = term.toLowerCase();
    keywordCounts.set(term, blobs.filter((blob) => blob.includes(needle)).length);
  }

  const science = new Map<string, number>();
  for (const item of report.scientificEvidence ?? []) science.set(item.type, (science.get(item.type) ?? 0) + 1);
  const policy = new Map<string, { count: number; level: "Baixo" | "Médio" | "Alto" }>();
  for (const item of report.policyRisks ?? []) {
    const current = policy.get(item.claim);
    if (current) current.count += 1;
    else policy.set(item.claim, { count: 1, level: riskLevel(item.claim, item.risk) });
  }
  const policyRows = [...policy.entries()]
    .map(([claim, item]) => ({ claim, level: item.level, count: item.count }))
    .sort((a, b) => b.count - a.count);
  const prohibited = policyRows.filter((item) => item.level === "Alto");
  const risky = policyRows.filter((item) => item.level === "Médio");
  const riskPattern = /\b(cure|reverse|guaranteed|doctor approved|miracle|100\s?%|permanent|instant)\b/i;
  const commonClaims = groupTexts((report.claims ?? []).filter((item) => !riskPattern.test(item.text)).map((item) => ({ text: item.text, count: item.count, domain: item.domain })));

  const audience = report.audience ?? { ages: [], sexes: [], pains: [], goals: [], personas: [] };
  const sexCounts = new Map<string, number>();
  for (const page of opened) for (const sex of page.audience.sexes) sexCounts.set(sex, (sexCounts.get(sex) ?? 0) + 1);
  if (sexCounts.size === 0) for (const sex of audience.sexes) sexCounts.set(sex, 1);

  const gaps: string[] = [];
  const opportunities: MarketOpportunity[] = [];
  const confidence = confidenceOf(report, openedCount);
  if (openedCount > 0 && ctaTotal === 0) {
    gaps.push("Nenhum CTA observado apareceu nas páginas abertas.");
    opportunities.push({ reason: "Os textos de CTA procurados não apareceram nas páginas abertas.", count: 0, confidence });
  }
  if (openedCount > 0 && (report.ingredients ?? []).length === 0) {
    gaps.push("Nenhuma lista de ingredientes foi encontrada nas páginas abertas.");
    opportunities.push({ reason: "Nenhuma página aberta trouxe uma lista de ingredientes.", count: 0, confidence });
  }
  const sciencePages = new Set((report.scientificEvidence ?? []).map((item) => item.domain)).size;
  if (openedCount > 0 && sciencePages === 0) {
    gaps.push("Nenhuma menção científica foi encontrada nas páginas abertas.");
    opportunities.push({ reason: "Nenhuma menção científica foi encontrada nas páginas abertas.", count: 0, confidence });
  }
  if (openedCount > 0 && sciencePages > 0 && (report.scientificEvidence ?? []).every((item) => item.ingredient === "Não associado")) {
    gaps.push("As menções científicas não estão ligadas a um ingrediente.");
    opportunities.push({
      reason: "Há menções científicas nas páginas, mas nenhuma está ligada a um ingrediente extraído.",
      count: sciencePages,
      confidence,
    });
  }
  if (openedCount > 0 && !sections.some((item) => item.name === "CTA")) {
    gaps.push("Nenhuma página aberta teve um CTA identificado na estrutura.");
  }

  const topSections = sections.slice(0, 4).map((item) => `${item.name} em ${item.count} de ${openedCount}`);
  const topBenefit = benefitGroups[0];
  const narrative = [
    openedCount > 0
      ? `Foram lidas ${openedCount} páginas utilizáveis, em ${competitors.size} domínios.`
      : `O relatório tem ${report.sources.length} fontes e nenhuma página aberta para comparar estruturas.`,
    sections.length > 0 ? `As seções mais presentes são ${topSections.join(", ")}.` : "Não há estrutura de página registrada.",
    dominantCta ? `O CTA mais frequente é ${dominantCta.text}, em ${dominantCta.frequency} ocorrências.` : "Nenhum CTA dominante foi encontrado.",
    dominantGuaranteeEntry ? `A garantia mais frequente é ${dominantGuaranteeEntry[0]}, em ${dominantGuaranteeEntry[1].count} ocorrências.` : "Nenhuma garantia com prazo ou money-back foi agrupada.",
    topBenefit && topBenefit.count > 1 ? `O benefício que mais se repetiu foi ${topBenefit.label}, em ${topBenefit.count} ocorrências.` : "Nenhum benefício apareceu mais de uma vez.",
  ].join(" ");

  const buyerIntent = report.signals.buyerGuideResults > 0 ? "Moderada" : report.signals.purchaseConsiderations.length > 0 ? "Fraca" : NOT_FOUND;
  const strategyLabel = recommendation ? STRATEGY_LABEL[recommendation.recommendedStrategy] : "Não disponível";
  const reasons = [
    recommendation ? `A pesquisa de mercado recomenda ${strategyLabel}.` : "Não há uma estratégia recomendada salva com esta pesquisa.",
    `Confiança da análise: ${Math.round(confidence * 100)}%. Qualidade da pesquisa: ${report.quality}.`,
    ...opportunities.map((item) => item.reason),
  ];

  return {
    marketSummary: {
      narrative,
      recommendedStrategy: recommendation?.recommendedStrategy ?? null,
      strategyLabel,
      strategyConfidence: recommendation ? CONFIDENCE_LABEL[recommendation.confidence] : NOT_FOUND,
      researchQuality: report.quality,
      buyerIntent,
      reasons,
      researchedAt: report.researchedAt,
    },
    dominantStructure: {
      sections,
      summary: sections.length > 0 ? topSections.join(". ") + "." : NOT_FOUND,
    },
    dominantHeadlinePatterns: headlinePatterns,
    dominantBenefits: benefitGroups.slice(0, 8).map((item) => ({ label: item.label, count: item.count, domains: item.domains })),
    dominantFaq: faqGroups.slice(0, 8).map((item) => ({ label: item.label, count: item.count, examples: item.examples })),
    dominantGuarantee: dominantGuaranteeEntry
      ? { label: dominantGuaranteeEntry[0], count: dominantGuaranteeEntry[1].count, examples: dominantGuaranteeEntry[1].examples }
      : { label: null, count: 0, examples: [] },
    dominantPricing: {
      currency,
      minimum: amounts.length ? Math.min(...amounts) : null,
      maximum: amounts.length ? Math.max(...amounts) : null,
      average: amounts.length ? Math.round((amounts.reduce((sum, item) => sum + item, 0) / amounts.length) * 100) / 100 : null,
      predominant,
      count: amounts.length,
    },
    dominantAudience: {
      sexes: [...sexCounts.entries()].map(([label, count]) => ({ label, count })),
      ages: audience.ages,
      pains: audience.pains.slice(0, 8),
      goals: audience.goals,
    },
    dominantObjections: groupTexts(report.signals.commonObjections.map((text) => ({ text, count: 1 })), "shortest").slice(0, 6).map((item) => ({ text: item.label, count: item.count })),
    dominantClaims: {
      common: commonClaims.slice(0, 8).map((item) => ({ text: item.label, count: item.count, domains: item.domains })),
      risky: risky.map((item) => ({ text: item.claim, level: item.level, count: item.count })),
      prohibited: prohibited.map((item) => ({ text: item.claim, level: item.level, count: item.count })),
    },
    dominantCTA: {
      text: dominantCta?.text ?? null,
      count: dominantCta?.frequency ?? 0,
      percent: dominantCta ? percent(dominantCta.frequency, ctaTotal) : 0,
    },
    dominantKeywords: [...keywordCounts.entries()].map(([keyword, count]) => ({ keyword, count })).sort((a, b) => b.count - a.count),
    dominantScientificTopics: [...science.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    dominantPolicyRisks: policyRows,
    competitorsRank: [...competitors.entries()]
      .map(([domain, item]) => ({ domain, classification: item.classification, pages: item.pages }))
      .sort((a, b) => b.pages - a.pages),
    marketGaps: gaps,
    opportunities,
    confidence,
  };
}
