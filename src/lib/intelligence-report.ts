import type { MarketResearchQuality } from "@/lib/market-research/types";

export type IntelligenceReportCard = {
  id: string;
  label: string;
  value: string;
  detail?: string;
};

export type IntelligenceReportView = {
  cards: IntelligenceReportCard[];
  sources: string[];
};

export type IntelligenceResearchSlice = {
  quality: MarketResearchQuality;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  competitors: number;
  reviews: number;
  objections: number;
  buyerIntent: "MODERATE" | "WEAK" | null;
  seoOpportunities: number;
  policyRisk: string | null;
};

export type IntelligenceReportInput = {
  benefits: string;
  ingredients: string;
  claims: number;
  pricing: string;
  guarantee: string;
  research: IntelligenceResearchSlice | null;
  hosts?: string[];
};

const MISSING = "Não encontrado";
const UNAVAILABLE = "Não disponível";

const QUALITY_LABEL: Record<MarketResearchQuality, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  INSUFFICIENT: "Insuficiente",
};

const LEVEL_LABEL = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  MODERATE: "Moderada",
  WEAK: "Fraca",
} as const;

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countOrMissing(count: number): string {
  return count > 0 ? String(count) : MISSING;
}

function textOrMissing(value: string): string {
  const text = value.trim();
  return text || MISSING;
}

export function buildIntelligenceReport(input: IntelligenceReportInput): IntelligenceReportView {
  const research = input.research;
  const price = input.pricing.trim();
  const cards: IntelligenceReportCard[] = [
    {
      id: "quality",
      label: "Qualidade da pesquisa",
      value: research ? QUALITY_LABEL[research.quality] : UNAVAILABLE,
    },
    {
      id: "confidence",
      label: "Confiança",
      value: research?.confidence ? LEVEL_LABEL[research.confidence] : UNAVAILABLE,
    },
    {
      id: "competitors",
      label: "Concorrentes encontrados",
      value: research ? countOrMissing(research.competitors) : UNAVAILABLE,
    },
    {
      id: "reviews",
      label: "Avaliações",
      value: research ? countOrMissing(research.reviews) : UNAVAILABLE,
    },
    { id: "benefits", label: "Benefícios", value: countOrMissing(lines(input.benefits).length) },
    { id: "ingredients", label: "Ingredientes", value: countOrMissing(lines(input.ingredients).length) },
    {
      id: "claims",
      label: "Afirmações",
      value: countOrMissing(input.claims),
      detail: input.claims > 0 ? "Informadas pela fonte" : undefined,
    },
    {
      id: "objections",
      label: "Objeções",
      value: research ? countOrMissing(research.objections) : UNAVAILABLE,
    },
    {
      id: "price",
      label: "Preço médio",
      value: textOrMissing(price),
      detail: price ? "Preço informado" : undefined,
    },
    { id: "guarantee", label: "Garantia", value: textOrMissing(input.guarantee) },
    {
      id: "intent",
      label: "Intenção de compra",
      value: research ? (research.buyerIntent ? LEVEL_LABEL[research.buyerIntent] : MISSING) : UNAVAILABLE,
    },
    {
      id: "policy",
      label: "Risco de política",
      value: research?.policyRisk?.trim() || "Não avaliado",
    },
    {
      id: "seo",
      label: "Oportunidades de SEO",
      value: research ? countOrMissing(research.seoOpportunities) : UNAVAILABLE,
    },
  ];
  return { cards, sources: input.hosts ?? [] };
}
