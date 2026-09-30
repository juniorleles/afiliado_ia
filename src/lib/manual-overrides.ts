import type { Campaign } from "@/lib/campaigns";
import { getDb } from "@/lib/db";
import type { OfferFact, ProductFacts, SourceFact } from "@/lib/product-facts";
import { emptyProductFacts } from "@/lib/product-facts";

/**
 * Operator overrides stored beside imported ProductFacts.
 * The campaign row keeps the importer JSON. Downstream reads go through
 * withResolvedCampaign so research, presentation, preview, grounding, policy,
 * and publication see the resolved facts. Tracking hop construction is unchanged.
 */

export const OVERRIDE_FIELDS = [
  "productName",
  "manufacturer",
  "description",
  "ingredients",
  "features",
  "faq",
  "usage",
  "guarantee",
  "warnings",
  "pricing",
  "cta",
  "trackingUrl",
] as const;

export type OverrideField = (typeof OVERRIDE_FIELDS)[number];

export type FieldSource = "AUTO" | "MANUAL";

export type FaqDraft = { question: string; answer: string };

export type UsageDraft = {
  instruction: string;
  frequency: string;
  amount: string;
  notes: string;
};

export type GuaranteeDraft = { duration: string; text: string };

export type PackageDraft = {
  packageName: string;
  quantity: string;
  unitPrice: string;
  totalPrice: string;
  savings: string;
  shipping: string;
  bonus: string;
};

export type ManualOverride = {
  campaignId: number;
  field: OverrideField;
  value: unknown;
  createdAt: string;
  updatedAt: string;
};

export type EditorFieldKind = "text" | "textarea" | "list" | "faq" | "usage" | "guarantee" | "packages";

export type EditorField = {
  field: OverrideField;
  label: string;
  source: FieldSource;
  kind: EditorFieldKind;
  value: string | string[] | FaqDraft[] | UsageDraft | GuaranteeDraft | PackageDraft[];
  importedText: string;
};

export type ProductEditorModel = {
  campaignId: number;
  campaignName: string;
  slug: string;
  sections: Array<{ id: string; title: string; fields: EditorField[] }>;
};

const TEXT_LIMIT = 500;
const LONG_LIMIT = 4000;
const URL_LIMIT = 2000;
const LIST_LIMIT = 40;

const EMPTY_USAGE: UsageDraft = { instruction: "", frequency: "", amount: "", notes: "" };
const EMPTY_GUARANTEE: GuaranteeDraft = { duration: "", text: "" };
const EMPTY_PACKAGE: PackageDraft = {
  packageName: "",
  quantity: "",
  unitPrice: "",
  totalPrice: "",
  savings: "",
  shipping: "",
  bonus: "",
};

export function isOverrideField(value: string): value is OverrideField {
  return (OVERRIDE_FIELDS as readonly string[]).includes(value);
}

export function coerceCampaignFacts(raw: unknown, fallbackUrl = ""): ProductFacts {
  const base = emptyProductFacts("", fallbackUrl, "IMPORTED");
  base.importWarnings = [];
  if (!raw || typeof raw !== "object") return base;
  const facts = raw as ProductFacts;
  return {
    ...base,
    ...facts,
    productName: typeof facts.productName === "string" ? facts.productName : "",
    sourceUrl: typeof facts.sourceUrl === "string" && facts.sourceUrl ? facts.sourceUrl : fallbackUrl,
    origin: facts.origin === "MANUAL" ? "MANUAL" : "IMPORTED",
    features: stringList(facts.features),
    ingredientsOrComponents: stringList(facts.ingredientsOrComponents),
    usageInformation: stringList(facts.usageInformation),
    cautions: stringList(facts.cautions),
    sourceSnippets: Array.isArray(facts.sourceSnippets) ? facts.sourceSnippets : [],
    importWarnings: Array.isArray(facts.importWarnings) ? facts.importWarnings : [],
    confidence: { ...base.confidence, ...(facts.confidence ?? {}) },
    productImageProvenance: facts.productImageProvenance ?? "NOT_FOUND",
  };
}

export function parseCampaignFacts(sourceFactsJson: string | null | undefined, fallbackUrl = ""): ProductFacts {
  if (!sourceFactsJson?.trim()) return coerceCampaignFacts(null, fallbackUrl);
  try {
    return coerceCampaignFacts(JSON.parse(sourceFactsJson) as unknown, fallbackUrl);
  } catch {
    return coerceCampaignFacts(null, fallbackUrl);
  }
}

export function validateOverrideValue(field: OverrideField, value: unknown): unknown | null {
  switch (field) {
    case "productName":
    case "manufacturer":
    case "cta":
      return asBoundedString(value, TEXT_LIMIT);
    case "trackingUrl":
      return asBoundedString(value, URL_LIMIT);
    case "description":
      return asBoundedString(value, LONG_LIMIT);
    case "ingredients":
    case "features":
    case "warnings":
      return asStringList(value);
    case "faq":
      return asFaq(value);
    case "usage":
      return asUsage(value);
    case "guarantee":
      return asGuarantee(value);
    case "pricing":
      return asPackages(value);
    default:
      return null;
  }
}

export function resolveProductFacts(imported: ProductFacts, overrides: ManualOverride[]): ProductFacts {
  const next = structuredClone(imported);
  const byField = new Map(overrides.map((row) => [row.field, row.value]));

  const productName = readString(byField.get("productName"));
  if (productName !== undefined) {
    next.productName = productName;
    next.confidence = { ...next.confidence, productName: productName ? "MANUAL" : "NOT_FOUND" };
  }

  const manufacturer = readString(byField.get("manufacturer"));
  if (manufacturer !== undefined) {
    next.manufacturer = manufacturer;
    next.confidence = { ...next.confidence, manufacturer: manufacturer ? "MANUAL" : "NOT_FOUND" };
  }

  const description = readString(byField.get("description"));
  if (description !== undefined) {
    next.description = description;
    next.confidence = { ...next.confidence, description: description ? "MANUAL" : "NOT_FOUND" };
  }

  const ingredients = readStringList(byField.get("ingredients"));
  if (ingredients) {
    next.ingredientsOrComponents = ingredients;
    next.confidence = { ...next.confidence, ingredientsOrComponents: ingredients.length ? "MANUAL" : "NOT_FOUND" };
  }

  const features = readStringList(byField.get("features"));
  if (features) {
    next.features = features;
    next.confidence = { ...next.confidence, features: features.length ? "MANUAL" : "NOT_FOUND" };
  }

  const warnings = readStringList(byField.get("warnings"));
  if (warnings) {
    next.cautions = warnings;
    next.confidence = { ...next.confidence, cautions: warnings.length ? "MANUAL" : "NOT_FOUND" };
  }

  const usage = readUsage(byField.get("usage"));
  if (usage) {
    next.usageInformation = usageLines(usage);
    next.confidence = { ...next.confidence, usageInformation: next.usageInformation.length ? "MANUAL" : "NOT_FOUND" };
  }

  const guarantee = readGuarantee(byField.get("guarantee"));
  if (guarantee) {
    next.guaranteeInformation = guaranteeText(guarantee);
    next.confidence = {
      ...next.confidence,
      guaranteeInformation: next.guaranteeInformation ? "MANUAL" : "NOT_FOUND",
    };
  }

  const packages = readPackages(byField.get("pricing"));
  if (packages) {
    next.pricingInformation = packageSummary(packages);
    next.confidence = { ...next.confidence, pricingInformation: next.pricingInformation ? "MANUAL" : "NOT_FOUND" };
    next.offerFacts = [];
  }

  const faq = readFaq(byField.get("faq"));
  if (faq) {
    const kept = (next.sourceSnippets ?? []).filter((snippet) => snippet.field !== "faq");
    const manual: SourceFact[] = faq.map((item) => ({
      field: "faq",
      text: item.answer,
      question: item.question,
      sourceUrl: next.sourceUrl,
      confidence: "MANUAL",
      context: "faq",
    }));
    next.sourceSnippets = [...kept, ...manual];
  }

  return next;
}

export function listManualOverrides(campaignId: number): ManualOverride[] {
  const rows = getDb()
    .prepare(
      `SELECT campaignId, field, value, createdAt, updatedAt
       FROM campaign_manual_overrides
       WHERE campaignId = ?
       ORDER BY field`,
    )
    .all(campaignId) as Array<{
    campaignId: number;
    field: string;
    value: string;
    createdAt: string;
    updatedAt: string;
  }>;

  const overrides: ManualOverride[] = [];
  for (const row of rows) {
    if (!isOverrideField(row.field)) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value) as unknown;
    } catch {
      continue;
    }
    const value = validateOverrideValue(row.field, parsed);
    if (value === null) continue;
    overrides.push({
      campaignId: row.campaignId,
      field: row.field,
      value,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
  return overrides;
}

export function saveManualOverride(campaignId: number, field: OverrideField, value: unknown): ManualOverride {
  const canonical = validateOverrideValue(field, value);
  if (canonical === null) {
    throw new Error("This field could not be saved.");
  }
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO campaign_manual_overrides (campaignId, field, value, createdAt, updatedAt)
       VALUES (@campaignId, @field, @value, @createdAt, @updatedAt)
       ON CONFLICT(campaignId, field) DO UPDATE SET
         value = excluded.value,
         updatedAt = excluded.updatedAt`,
    )
    .run({
      campaignId,
      field,
      value: JSON.stringify(canonical),
      createdAt: now,
      updatedAt: now,
    });
  const stored = listManualOverrides(campaignId).find((row) => row.field === field);
  if (!stored) throw new Error("This field could not be saved.");
  return stored;
}

export function resetManualOverride(campaignId: number, field: OverrideField): void {
  getDb().prepare("DELETE FROM campaign_manual_overrides WHERE campaignId = ? AND field = ?").run(campaignId, field);
}

export function resetManualOverrides(campaignId: number, fields: OverrideField[]): void {
  for (const field of fields) resetManualOverride(campaignId, field);
}

export function resetAllManualOverrides(campaignId: number): void {
  getDb().prepare("DELETE FROM campaign_manual_overrides WHERE campaignId = ?").run(campaignId);
}

export type FactDiff = { importer: string; manual: string; changed: boolean };

export function diffFactText(importer: string, manual: string): FactDiff {
  const left = importer.replace(/\s+/g, " ").trim();
  const right = manual.replace(/\s+/g, " ").trim();
  return { importer, manual, changed: left !== right };
}

/** Resolved facts for one campaign. Missing or unreadable importer JSON stays missing. */
export function loadResolvedProductFacts(
  campaign: Pick<Campaign, "id" | "sourceFactsJson" | "affiliateUrl">,
): ProductFacts | null {
  if (!campaign.sourceFactsJson?.trim()) return null;
  let raw: ProductFacts;
  try {
    const parsed = JSON.parse(campaign.sourceFactsJson) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    raw = parsed as ProductFacts;
  } catch {
    return null;
  }
  if (!Number.isInteger(campaign.id) || campaign.id < 1) return raw;
  return resolveProductFacts(raw, listManualOverrides(campaign.id));
}

/**
 * Campaign view for downstream readers. Does not write the row.
 * Tracking URL and CTA replace the stored values only when an override exists.
 */
export function withResolvedCampaign<T extends Campaign>(campaign: T): T {
  if (!Number.isInteger(campaign.id) || campaign.id < 1) return campaign;
  const overrides = listManualOverrides(campaign.id);
  const factOverrides = overrides.filter((row) => row.field !== "cta" && row.field !== "trackingUrl");
  let factsJson = campaign.sourceFactsJson;
  if (factOverrides.length > 0 && campaign.sourceFactsJson?.trim()) {
    try {
      const parsed = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
      if (parsed && typeof parsed === "object") factsJson = JSON.stringify(resolveProductFacts(parsed, factOverrides));
    } catch {
      factsJson = campaign.sourceFactsJson;
    }
  }
  const tracking = overrides.find((row) => row.field === "trackingUrl");
  const cta = overrides.find((row) => row.field === "cta");
  return {
    ...campaign,
    sourceFactsJson: factsJson,
    affiliateUrl: tracking && typeof tracking.value === "string" ? tracking.value : campaign.affiliateUrl,
    ctaLabel: cta && typeof cta.value === "string" ? cta.value : campaign.ctaLabel,
  };
}

export function buildProductEditorModel(
  facts: ProductFacts,
  campaign: { id: number; name: string; slug: string; ctaLabel: string; affiliateUrl: string },
  overrides: ManualOverride[],
): ProductEditorModel {
  const byField = new Map(overrides.map((row) => [row.field, row]));
  const resolved = resolveProductFacts(facts, overrides);
  const source = (field: OverrideField): FieldSource => (byField.has(field) ? "MANUAL" : "AUTO");

  const usageValue = readUsage(byField.get("usage")?.value) ?? usageFromFacts(facts);
  const guaranteeValue = readGuarantee(byField.get("guarantee")?.value) ?? {
    duration: "",
    text: facts.guaranteeInformation ?? "",
  };
  const packageValue = readPackages(byField.get("pricing")?.value) ?? packagesFromFacts(facts);
  const faqValue = readFaq(byField.get("faq")?.value) ?? faqFromFacts(facts);

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    slug: campaign.slug,
    sections: [
      {
        id: "identity",
        title: "Identity",
        fields: [
          textField("productName", "Product Name", "text", source("productName"), resolved.productName, facts.productName),
          textField(
            "manufacturer",
            "Manufacturer",
            "text",
            source("manufacturer"),
            resolved.manufacturer ?? "",
            facts.manufacturer ?? "",
          ),
          textField(
            "description",
            "Description",
            "textarea",
            source("description"),
            resolved.description ?? "",
            facts.description ?? "",
          ),
        ],
      },
      {
        id: "ingredients",
        title: "Ingredients",
        fields: [
          listField(
            "ingredients",
            "Ingredients",
            source("ingredients"),
            resolved.ingredientsOrComponents,
            facts.ingredientsOrComponents,
          ),
        ],
      },
      {
        id: "features",
        title: "Features",
        fields: [listField("features", "Features", source("features"), resolved.features, facts.features)],
      },
      {
        id: "faq",
        title: "FAQ",
        fields: [
          {
            field: "faq",
            label: "FAQ",
            source: source("faq"),
            kind: "faq",
            value: faqValue,
            importedText: faqFromFacts(facts)
              .map((item) => `${item.question} ${item.answer}`.trim())
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
      {
        id: "usage",
        title: "Usage",
        fields: [
          {
            field: "usage",
            label: "Usage",
            source: source("usage"),
            kind: "usage",
            value: usageValue,
            importedText: facts.usageInformation.join("\n"),
          },
        ],
      },
      {
        id: "guarantee",
        title: "Guarantee",
        fields: [
          {
            field: "guarantee",
            label: "Guarantee",
            source: source("guarantee"),
            kind: "guarantee",
            value: guaranteeValue,
            importedText: facts.guaranteeInformation ?? "",
          },
        ],
      },
      {
        id: "warnings",
        title: "Warnings",
        fields: [listField("warnings", "Warnings", source("warnings"), resolved.cautions, facts.cautions)],
      },
      {
        id: "pricing",
        title: "Pricing",
        fields: [
          {
            field: "pricing",
            label: "Packages",
            source: source("pricing"),
            kind: "packages",
            value: packageValue,
            importedText: [facts.pricingInformation ?? "", ...facts.shippingInformation?.map((item) => item.statement) ?? []]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
      {
        id: "offer",
        title: "Offer",
        fields: [
          textField(
            "cta",
            "CTA",
            "text",
            source("cta"),
            readString(byField.get("cta")?.value) ?? campaign.ctaLabel,
            campaign.ctaLabel,
          ),
          textField(
            "trackingUrl",
            "Tracking URL",
            "text",
            source("trackingUrl"),
            readString(byField.get("trackingUrl")?.value) ?? campaign.affiliateUrl,
            campaign.affiliateUrl,
          ),
        ],
      },
    ],
  };
}

function textField(
  field: OverrideField,
  label: string,
  kind: "text" | "textarea",
  source: FieldSource,
  value: string,
  imported: string,
): EditorField {
  return { field, label, source, kind, value, importedText: imported };
}

function listField(field: OverrideField, label: string, source: FieldSource, value: string[], imported: string[]): EditorField {
  return { field, label, source, kind: "list", value, importedText: imported.join("\n") };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asBoundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > max) return null;
  return trimmed;
}

function asStringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > LIST_LIMIT) return null;
  const items: string[] = [];
  for (const item of value) {
    const text = asBoundedString(item, TEXT_LIMIT);
    if (text === null) return null;
    if (text) items.push(text);
  }
  return items;
}

function asFaq(value: unknown): FaqDraft[] | null {
  if (!Array.isArray(value) || value.length > LIST_LIMIT) return null;
  const items: FaqDraft[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const question = asBoundedString(row.question, TEXT_LIMIT);
    const answer = asBoundedString(row.answer, LONG_LIMIT);
    if (question === null || answer === null) return null;
    if (!question && !answer) continue;
    items.push({ question, answer });
  }
  return items;
}

function asUsage(value: unknown): UsageDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const instruction = asBoundedString(row.instruction, LONG_LIMIT);
  const frequency = asBoundedString(row.frequency, TEXT_LIMIT);
  const amount = asBoundedString(row.amount, TEXT_LIMIT);
  const notes = asBoundedString(row.notes, LONG_LIMIT);
  if (instruction === null || frequency === null || amount === null || notes === null) return null;
  return { instruction, frequency, amount, notes };
}

function asGuarantee(value: unknown): GuaranteeDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const duration = asBoundedString(row.duration, TEXT_LIMIT);
  const text = asBoundedString(row.text, LONG_LIMIT);
  if (duration === null || text === null) return null;
  return { duration, text };
}

function asPackages(value: unknown): PackageDraft[] | null {
  if (!Array.isArray(value) || value.length > LIST_LIMIT) return null;
  const items: PackageDraft[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    const draft: PackageDraft = { ...EMPTY_PACKAGE };
    for (const key of Object.keys(EMPTY_PACKAGE) as Array<keyof PackageDraft>) {
      const text = asBoundedString(row[key], TEXT_LIMIT);
      if (text === null) return null;
      draft[key] = text;
    }
    if (Object.values(draft).some(Boolean)) items.push(draft);
  }
  return items;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readStringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? asStringList(value) ?? undefined : undefined;
}

function readUsage(value: unknown): UsageDraft | undefined {
  return value && typeof value === "object" ? asUsage(value) ?? undefined : undefined;
}

function readGuarantee(value: unknown): GuaranteeDraft | undefined {
  return value && typeof value === "object" ? asGuarantee(value) ?? undefined : undefined;
}

function readPackages(value: unknown): PackageDraft[] | undefined {
  return Array.isArray(value) ? asPackages(value) ?? undefined : undefined;
}

function readFaq(value: unknown): FaqDraft[] | undefined {
  return Array.isArray(value) ? asFaq(value) ?? undefined : undefined;
}

function usageLines(usage: UsageDraft): string[] {
  return [
    labeled("Instruction", usage.instruction),
    labeled("Frequency", usage.frequency),
    labeled("Amount", usage.amount),
    labeled("Notes", usage.notes),
  ].filter((line): line is string => Boolean(line));
}

function labeled(label: string, value: string): string | null {
  const text = value.trim();
  return text ? `${label}: ${text}` : null;
}

function guaranteeText(guarantee: GuaranteeDraft): string {
  const duration = guarantee.duration.trim();
  const text = guarantee.text.trim();
  if (duration && text) return `${duration}. ${text}`;
  return duration || text;
}

function packageSummary(packages: PackageDraft[]): string {
  return packages
    .map((item) => {
      const price = item.totalPrice || item.unitPrice;
      const name = item.packageName || "Package";
      if (price && /[$€£]/.test(price)) return `${name} ${price}`;
      return [
        item.packageName,
        item.quantity && `quantity ${item.quantity}`,
        item.unitPrice && `unit ${item.unitPrice}`,
        item.totalPrice && `total ${item.totalPrice}`,
        item.savings && `savings ${item.savings}`,
        item.shipping && `shipping ${item.shipping}`,
        item.bonus && `bonus ${item.bonus}`,
      ]
        .filter(Boolean)
        .join(" — ");
    })
    .filter(Boolean)
    .join("\n");
}

function usageFromFacts(facts: ProductFacts): UsageDraft {
  return { ...EMPTY_USAGE, instruction: facts.usageInformation.join("\n") };
}

function faqFromFacts(facts: ProductFacts): FaqDraft[] {
  const seen = new Set<string>();
  const items: FaqDraft[] = [];
  for (const snippet of facts.sourceSnippets) {
    if (snippet.field !== "faq") continue;
    const question = snippet.question ?? "";
    const answer = snippet.text ?? "";
    const key = `${question}\n${answer}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ question, answer });
  }
  return items;
}

function packagesFromFacts(facts: ProductFacts): PackageDraft[] {
  const offers = facts.offerFacts ?? [];
  if (offers.length > 0) {
    return offers.map((offer) => packageFromOffer(offer));
  }
  if (facts.pricingInformation?.trim()) {
    return [{ ...EMPTY_PACKAGE, totalPrice: facts.pricingInformation.trim() }];
  }
  return [];
}

function packageFromOffer(offer: OfferFact): PackageDraft {
  return {
    packageName: offer.packageName ?? "",
    quantity: offer.quantity ?? "",
    unitPrice: offer.unitPrice ?? "",
    totalPrice: offer.totalPrice ?? "",
    savings: offer.savings ?? "",
    shipping: offer.shipping ?? "",
    bonus: offer.bonuses ?? "",
  };
}
