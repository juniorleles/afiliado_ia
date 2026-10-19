import { approachEnglish, slugify } from "@/lib/section-generation/english";
import { seoPrompt } from "@/lib/section-generation/prompts/seo";
import { clip, failed, generated } from "@/lib/section-generation/support";
import type { EvidenceUse } from "@/lib/section-generation/types";

export type SeoInput = {
  productName: string;
  description?: string;
  keywords: string[];
  approachId: string | null;
  marketConfidence: number | null;
};

function namesProduct(keyword: string, productName: string): boolean {
  const name = productName.trim().toLowerCase();
  const value = keyword.trim().toLowerCase();
  if (!name || !value) return false;
  if (value.includes(name)) return true;
  return name.split(/[^a-z0-9]+/).some((token) => token.length >= 6 && value.includes(token));
}

export function generateSeo(input: SeoInput) {
  if (!input.productName.trim()) return failed("seo", ["O nome do produto não está nos fatos."], [`Prompt ${seoPrompt.id} não gerou o SEO.`]);
  const title = input.productName.trim();
  const description = input.description?.trim() ? clip(input.description, 180) : null;
  const keywords = input.keywords.filter((keyword) => namesProduct(keyword, title));
  const evidence: EvidenceUse[] = [{ origin: "ProductFacts", field: "productName", text: title }];
  if (description) evidence.push({ origin: "ProductFacts", field: "description", text: description });
  for (const keyword of keywords) evidence.push({ origin: "MarketIntelligenceAnalysis", field: "dominantKeywords", text: keyword });
  if (input.approachId) evidence.push({ origin: "StrategyDecision", field: "approachId", text: input.approachId });
  const warnings = [
    "O relatório não traz volume de busca.",
    "Canonical não foi gerado porque não há URL pública nesta entrada.",
  ];
  if (keywords.length < input.keywords.length) warnings.push("Palavra medida que não nomeia o produto ficou fora do SEO.");
  const openGraph = { title, description };
  return generated("seo", {
    title,
    metaDescription: description,
    description,
    slug: slugify(title),
    openGraph,
    keywords,
    canonical: null,
    approach: input.approachId ? approachEnglish(input.approachId) : null,
  }, evidence, [`Prompt ${seoPrompt.id}: ${seoPrompt.objective}`], warnings, input.marketConfidence, {
    prose: [title, description, keywords.join(" ")].filter(Boolean).join(". "),
    slotsFilled: [title, description, keywords.length > 0 ? "keywords" : ""].filter(Boolean).length,
    slots: 4,
  });
}
