import { updateCampaignBriefIdentity, readCampaignBrief, type CampaignBrief } from "@/lib/campaign-brief";
import { getCampaignById, writeCampaignSourceFacts, type Campaign } from "@/lib/campaigns";
import { ensureEvidenceBaseline, recordManualEdit } from "@/lib/evidence-manager";
import {
  listManualOverrides,
  parseCampaignFacts,
  resolveProductFacts,
  saveManualOverride,
  type OverrideField,
} from "@/lib/manual-overrides";
import { applyManualFacts, emptyProductFacts, type FactConfidence, type ProductFacts, type SourceFact } from "@/lib/product-facts";

export type KnowledgeText = {
  brand: string;
  category: string;
  description: string;
  ingredients: string;
  benefits: string;
  howItWorks: string;
  warnings: string;
  pricing: string;
  guarantee: string;
  manufacturer: string;
  faq: string;
  images: string;
  videos: string;
};

export type KnowledgeCheck = { id: string; label: string; filled: boolean };

const EXTRACTED: ReadonlySet<FactConfidence> = new Set(["DIRECT_SOURCE", "HEURISTIC_EXTRACTION", "AI_SOURCE_CLASSIFICATION"]);

export function knowledgeChecks(input: KnowledgeText): KnowledgeCheck[] {
  const items: Array<[string, string, string]> = [
    ["description", "Descrição", input.description],
    ["ingredients", "Ingredientes", input.ingredients],
    ["benefits", "Benefícios", input.benefits],
    ["usage", "Uso", input.howItWorks],
    ["warnings", "Avisos", input.warnings],
    ["pricing", "Preço", input.pricing],
    ["guarantee", "Garantia", input.guarantee],
    ["manufacturer", "Fabricante", input.manufacturer],
    ["images", "Imagens", input.images],
    ["videos", "Vídeos", input.videos],
    ["faq", "FAQ", input.faq],
  ];
  return items.map(([id, label, value]) => ({ id, label, filled: value.trim().length > 0 }));
}

export function knowledgePercent(checks: KnowledgeCheck[]): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter((item) => item.filled).length / checks.length) * 100);
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function httpUrls(value: string): { urls: string[] } | { error: "url" } {
  const urls = lines(value);
  if (urls.some((url) => !isHttp(url))) return { error: "url" };
  return { urls };
}

function isHttp(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function readKnowledgeText(campaign: Campaign, brief: CampaignBrief | null): { text: KnowledgeText; extracted: Record<string, boolean> } {
  const imported = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
  const facts = resolveProductFacts(imported, listManualOverrides(campaign.id));
  const images = unique([...(facts.imageUrls ?? []), facts.productImageUrl ?? ""]);
  const videos = unique(facts.videoUrls ?? []);
  const text: KnowledgeText = {
    brand: brief?.brand ?? "",
    category: brief?.category ?? "",
    description: facts.description ?? "",
    ingredients: facts.ingredientsOrComponents.join("\n"),
    benefits: facts.features.join("\n"),
    howItWorks: facts.usageInformation.join("\n"),
    warnings: facts.cautions.join("\n"),
    pricing: facts.pricingInformation ?? "",
    guarantee: facts.guaranteeInformation ?? "",
    manufacturer: facts.manufacturer ?? "",
    faq: faqText(facts),
    images: images.join("\n"),
    videos: videos.join("\n"),
  };
  return {
    text,
    extracted: {
      description: EXTRACTED.has(facts.confidence.description),
      ingredients: EXTRACTED.has(facts.confidence.ingredientsOrComponents),
      benefits: EXTRACTED.has(facts.confidence.features),
      howItWorks: EXTRACTED.has(facts.confidence.usageInformation),
      warnings: EXTRACTED.has(facts.confidence.cautions),
      pricing: EXTRACTED.has(facts.confidence.pricingInformation),
      guarantee: EXTRACTED.has(facts.confidence.guaranteeInformation),
      manufacturer: EXTRACTED.has(facts.confidence.manufacturer),
      images: facts.productImageProvenance === "DIRECT_SOURCE" && images.length > 0,
      videos: videos.length > 0 && facts.origin === "IMPORTED",
      faq: facts.sourceSnippets.some((snippet) => snippet.field === "faq" && EXTRACTED.has(snippet.confidence)),
    },
  };
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    urls.push(text);
  }
  return urls;
}

function faqText(facts: ProductFacts): string {
  return facts.sourceSnippets
    .filter((snippet) => snippet.field === "faq")
    .map((snippet) => [snippet.question?.trim(), snippet.text?.trim()].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
}

export function parseKnowledgeForm(formData: FormData): { text: KnowledgeText } | { error: "url" | "marca" | "categoria" } {
  const text: KnowledgeText = {
    brand: String(formData.get("brand") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    ingredients: String(formData.get("ingredients") ?? "").trim(),
    benefits: String(formData.get("benefits") ?? "").trim(),
    howItWorks: String(formData.get("howItWorks") ?? "").trim(),
    warnings: String(formData.get("warnings") ?? "").trim(),
    pricing: String(formData.get("pricing") ?? "").trim(),
    guarantee: String(formData.get("guarantee") ?? "").trim(),
    manufacturer: String(formData.get("manufacturer") ?? "").trim(),
    faq: String(formData.get("faq") ?? "").trim(),
    images: String(formData.get("images") ?? "").trim(),
    videos: String(formData.get("videos") ?? "").trim(),
  };
  if (text.brand.length > 120) return { error: "marca" };
  if (text.category.length > 80) return { error: "categoria" };
  const images = httpUrls(text.images);
  if ("error" in images) return images;
  const videos = httpUrls(text.videos);
  if ("error" in videos) return videos;
  return { text };
}

export function saveProductKnowledge(campaignId: number, text: KnowledgeText): void {
  const campaign = getCampaignById(campaignId);
  if (!campaign) throw new Error("Campaign not found.");
  const brief = readCampaignBrief(campaignId);
  const imported = parseCampaignFacts(campaign.sourceFactsJson, campaign.affiliateUrl);
  const current = resolveProductFacts(imported, listManualOverrides(campaignId));
  const productName = brief?.productName || current.productName || campaign.name;
  const base = campaign.sourceFactsJson?.trim() ? current : emptyProductFacts(productName, campaign.affiliateUrl, "MANUAL");
  const next = applyManualFacts(base, {
    productName,
    description: text.description,
    featuresText: text.benefits,
    ingredientsText: text.ingredients,
    usageText: text.howItWorks,
    cautionsText: text.warnings,
    pricingInformation: text.pricing,
    guaranteeInformation: text.guarantee,
    manufacturer: text.manufacturer,
  });
  if (!text.description.trim()) {
    next.description = undefined;
    next.confidence = { ...next.confidence, description: "NOT_FOUND" };
  }
  const images = lines(text.images);
  const videos = lines(text.videos);
  next.imageUrls = images;
  next.videoUrls = videos;
  next.sourceSnippets = [...next.sourceSnippets.filter((snippet) => snippet.field !== "faq"), ...faqSnippets(text.faq, next.sourceUrl)];
  if (images[0] && next.productImageUrl !== images[0]) {
    next.productImageUrl = images[0];
    next.productImageProvenance = "MANUAL";
  }
  if (images.length === 0) {
    next.productImageUrl = undefined;
    if (next.productImageProvenance !== "DIRECT_SOURCE") next.productImageProvenance = "NOT_FOUND";
  }

  const preserveImport = Boolean(campaign.sourceFactsJson?.trim()) && imported.origin === "IMPORTED";
  if (!preserveImport) {
    writeCampaignSourceFacts(campaignId, JSON.stringify(next));
  } else {
    saveImportedEdits(campaignId, text, campaign.sourceFactsJson ?? "");
  }
  if (brief) updateCampaignBriefIdentity(campaignId, text.brand || null, text.category);
}

function saveImportedEdits(campaignId: number, text: KnowledgeText, sourceFactsJson: string): void {
  const campaign = getCampaignById(campaignId);
  if (campaign) {
    ensureEvidenceBaseline({
      campaignId,
      sourceFactsJson: campaign.sourceFactsJson ?? null,
      affiliateUrl: campaign.affiliateUrl,
      ctaLabel: campaign.ctaLabel,
      createdAt: campaign.createdAt,
      overrides: listManualOverrides(campaignId),
    });
  }
  const reason = "Fatos do produto";
  override(campaignId, "description", text.description.slice(0, 4000), reason);
  override(campaignId, "ingredients", shortLines(text.ingredients), reason);
  override(campaignId, "features", shortLines(text.benefits), reason);
  override(campaignId, "warnings", shortLines(text.warnings), reason);
  override(campaignId, "usage", { instruction: text.howItWorks.slice(0, 4000), frequency: "", amount: "", notes: "" }, reason);
  override(campaignId, "guarantee", { duration: "", text: text.guarantee.slice(0, 4000) }, reason);
  override(campaignId, "manufacturer", text.manufacturer.slice(0, 500), reason);
  override(campaignId, "faq", text.faq.trim() ? [{ question: "FAQ", answer: text.faq.slice(0, 4000) }] : [], reason);
  override(
    campaignId,
    "pricing",
    text.pricing.trim()
      ? [{ packageName: "", quantity: "", unitPrice: "", totalPrice: text.pricing.slice(0, 500), savings: "", shipping: "", bonus: "" }]
      : [],
    reason,
  );
  const raw = JSON.parse(sourceFactsJson) as ProductFacts;
  raw.imageUrls = lines(text.images);
  raw.videoUrls = lines(text.videos);
  writeCampaignSourceFacts(campaignId, JSON.stringify(raw));
}

function shortLines(value: string): string[] {
  return lines(value).slice(0, 40).map((line) => line.slice(0, 500));
}

function override(campaignId: number, field: OverrideField, value: unknown, reason: string): void {
  saveManualOverride(campaignId, field, value);
  recordManualEdit({ campaignId, field, value, reason });
}

function faqSnippets(text: string, sourceUrl: string): SourceFact[] {
  const body = text.trim();
  if (!body) return [];
  return [{ field: "faq", text: body, question: "", sourceUrl, confidence: "MANUAL", context: "faq" }];
}
