import { createCampaign, getCampaignBySlug, type Campaign } from "@/lib/campaigns";
import {
  CAMPAIGN_GOALS,
  COUNTRIES,
  GENERATION_OPTIONS,
  LANGUAGES,
  MARKETPLACES,
  RESEARCH_SOURCES,
  type Country,
  type GenerationOption,
  type Goal,
  type Language,
  type Marketplace,
  type ResearchSource,
} from "@/lib/campaign-brief-options";
import { getDb } from "@/lib/db";
import { slugify } from "@/lib/slug";

export {
  CAMPAIGN_GOALS,
  COUNTRIES,
  GENERATION_OPTIONS,
  LANGUAGES,
  MARKETPLACES,
  RESEARCH_SOURCES,
  labelFor,
} from "@/lib/campaign-brief-options";

export type CampaignBrief = {
  version: 1;
  notes: string | null;
  productName: string;
  marketplace: Marketplace;
  brand: string | null;
  category: string;
  country: Country;
  language: Language;
  goal: Goal;
  research: Record<ResearchSource, boolean>;
  generation: Record<GenerationOption, boolean>;
};

export type CampaignBriefField = "name" | "notes" | "productName" | "marketplace" | "brand" | "category" | "country" | "language" | "goal";

export type CampaignBriefDraft = {
  name: string;
  notes: string;
  productName: string;
  marketplace: string;
  brand: string;
  category: string;
  country: string;
  language: string;
  goal: string;
  research: ResearchSource[];
  generation: GenerationOption[];
};

const NAME_LIMIT = 120;
const NOTE_LIMIT = 2000;
const PRODUCT_LIMIT = 160;
const BRAND_LIMIT = 120;
const CATEGORY_LIMIT = 80;

function choice<T extends string>(value: string, options: readonly { value: T }[]): T | null {
  return options.some((option) => option.value === value) ? (value as T) : null;
}

function flags<T extends string>(selected: readonly string[], options: readonly { value: T }[]): Record<T, boolean> {
  const allowed = new Set(options.map((option) => option.value));
  const chosen = new Set(selected.filter((value): value is T => allowed.has(value as T)));
  return Object.fromEntries(options.map((option) => [option.value, chosen.has(option.value)])) as Record<T, boolean>;
}

export function readCampaignBrief(id: number): CampaignBrief | null {
  const row = getDb().prepare("SELECT campaignBriefJson FROM campaigns WHERE id = ?").get(id) as
    | { campaignBriefJson: string | null }
    | undefined;
  if (!row?.campaignBriefJson) return null;
  try {
    const parsed = JSON.parse(row.campaignBriefJson) as Partial<CampaignBrief>;
    if (parsed.version !== 1 || !parsed.productName || !parsed.marketplace || !parsed.goal) return null;
    return {
      version: 1,
      notes: parsed.notes ?? null,
      productName: parsed.productName,
      marketplace: parsed.marketplace,
      brand: parsed.brand ?? null,
      category: parsed.category ?? "",
      country: parsed.country as Country,
      language: parsed.language as Language,
      goal: parsed.goal,
      research: flags(
        RESEARCH_SOURCES.filter((item) => parsed.research?.[item.value]).map((item) => item.value),
        RESEARCH_SOURCES,
      ),
      generation: flags(
        GENERATION_OPTIONS.filter((item) => parsed.generation?.[item.value]).map((item) => item.value),
        GENERATION_OPTIONS,
      ),
    };
  } catch {
    return null;
  }
}

export function parseCampaignBriefForm(formData: FormData): { draft: CampaignBriefDraft; brief: CampaignBrief | null; fieldErrors: Partial<Record<CampaignBriefField, string>> } {
  const draft: CampaignBriefDraft = {
    name: String(formData.get("name") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    productName: String(formData.get("productName") ?? "").trim(),
    marketplace: String(formData.get("marketplace") ?? "").trim(),
    brand: String(formData.get("brand") ?? "").trim(),
    category: String(formData.get("category") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    language: String(formData.get("language") ?? "").trim(),
    goal: String(formData.get("goal") ?? "").trim(),
    research: formData.getAll("research").map(String) as ResearchSource[],
    generation: formData.getAll("generation").map(String) as GenerationOption[],
  };
  const fieldErrors: Partial<Record<CampaignBriefField, string>> = {};
  if (!draft.name) fieldErrors.name = "Informe o nome da campanha.";
  else if (draft.name.length > NAME_LIMIT) fieldErrors.name = "Use um nome de campanha mais curto.";
  if (draft.notes.length > NOTE_LIMIT) fieldErrors.notes = "Encurte as notas internas.";
  if (!draft.productName) fieldErrors.productName = "Informe o nome do produto.";
  else if (draft.productName.length > PRODUCT_LIMIT) fieldErrors.productName = "Use um nome de produto mais curto.";
  if (!choice(draft.marketplace, MARKETPLACES)) fieldErrors.marketplace = "Escolha um marketplace.";
  if (draft.brand.length > BRAND_LIMIT) fieldErrors.brand = "Use um nome de marca mais curto.";
  if (!draft.category) fieldErrors.category = "Informe a categoria.";
  else if (draft.category.length > CATEGORY_LIMIT) fieldErrors.category = "Use uma categoria mais curta.";
  if (!choice(draft.country, COUNTRIES)) fieldErrors.country = "Escolha um país.";
  if (!choice(draft.language, LANGUAGES)) fieldErrors.language = "Escolha um idioma.";
  if (!choice(draft.goal, CAMPAIGN_GOALS)) fieldErrors.goal = "Escolha um objetivo da campanha.";

  if (Object.keys(fieldErrors).length > 0) return { draft, brief: null, fieldErrors };

  const marketplace = choice(draft.marketplace, MARKETPLACES);
  const country = choice(draft.country, COUNTRIES);
  const language = choice(draft.language, LANGUAGES);
  const goal = choice(draft.goal, CAMPAIGN_GOALS);
  if (!marketplace || !country || !language || !goal) return { draft, brief: null, fieldErrors };

  return {
    draft,
    fieldErrors,
    brief: {
      version: 1,
      notes: draft.notes || null,
      productName: draft.productName,
      marketplace,
      brand: draft.brand || null,
      category: draft.category,
      country,
      language,
      goal,
      research: flags(draft.research, RESEARCH_SOURCES),
      generation: flags(draft.generation, GENERATION_OPTIONS),
    },
  };
}

export function updateCampaignBriefIdentity(id: number, brand: string | null, category: string): void {
  const current = readCampaignBrief(id);
  if (!current) return;
  getDb()
    .prepare("UPDATE campaigns SET campaignBriefJson = ? WHERE id = ?")
    .run(JSON.stringify({ ...current, brand, category }), id);
}

function availableSlug(name: string, productName: string): string {
  const root = slugify(name) || slugify(productName) || "campaign";
  let candidate = root;
  let suffix = 2;
  while (getCampaignBySlug(candidate)) {
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createCampaignDraftFromBrief(name: string, brief: CampaignBrief): Campaign {
  const campaign = createCampaign({
    name,
    slug: availableSlug(name, brief.productName),
    headline: "",
    body: "",
    ctaLabel: "",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  getDb().prepare("UPDATE campaigns SET campaignBriefJson = ? WHERE id = ?").run(JSON.stringify(brief), campaign.id);
  return campaign;
}
