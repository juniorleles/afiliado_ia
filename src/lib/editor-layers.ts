/**
 * Three-layer editor view. Imported text stays read-only.
 * An override replaces it only for the effective view.
 * ProductFacts are not rewritten here.
 */

export const LAYER_STATUSES = ["AUTO", "MANUAL", "MIXED", "EMPTY"] as const;
export type LayerStatus = (typeof LAYER_STATUSES)[number];

export type ContentBoundary = "PRODUCT_CONTENT" | "PAGE_STRUCTURE";

export const MANAGED_SECTIONS = [
  { id: "overview", label: "Description" },
  { id: "features", label: "Features" },
  { id: "ingredients", label: "Ingredients" },
  { id: "usage", label: "Usage" },
  { id: "warnings", label: "Warnings" },
  { id: "pricing", label: "Pricing" },
  { id: "guarantee", label: "Guarantee" },
  { id: "faq", label: "FAQ" },
  { id: "offer", label: "Offer" },
] as const;

export type ManagedSectionId = (typeof MANAGED_SECTIONS)[number]["id"];

export const PRESENTATION_FIELDS = [
  "presentation.headline",
  "presentation.subheadline",
  "presentation.shipping",
  "presentation.returns",
  "presentation.bonus",
  "presentation.images",
  "presentation.disclosure",
  "presentation.footer",
  "presentation.navigation",
  "presentation.visibility",
  "presentation.order",
  "presentation.ctaColor",
] as const;

export type PresentationField = (typeof PRESENTATION_FIELDS)[number];

const TEXT_LIMIT = 500;
const LONG_LIMIT = 4000;
const URL_LIMIT = 2000;

const PAGE_STRUCTURE = new Set<string>([
  "cta",
  "trackingUrl",
  "presentation.headline",
  "presentation.subheadline",
  "presentation.disclosure",
  "presentation.footer",
  "presentation.navigation",
  "presentation.visibility",
  "presentation.order",
  "presentation.ctaColor",
]);

export type LayerCard = {
  field: string;
  sectionId: string;
  label: string;
  importedText: string;
  overrideText: string | null;
  effectiveText: string;
  source: string;
  confidence: string;
  origin: string;
  boundary: ContentBoundary;
  status: LayerStatus;
};

export function isPresentationField(value: string): value is PresentationField {
  return (PRESENTATION_FIELDS as readonly string[]).includes(value);
}

export function fieldBoundary(field: string): ContentBoundary {
  return PAGE_STRUCTURE.has(field) ? "PAGE_STRUCTURE" : "PRODUCT_CONTENT";
}

export function sanitizePlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u0000/g, "")
    .trim();
}

export function textLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function layerStatus(imported: string, override: string | null, list: boolean): LayerStatus {
  if (override === null) return imported.trim() ? "AUTO" : "EMPTY";
  if (!override.trim()) return imported.trim() ? "MANUAL" : "EMPTY";
  if (!list) return "MANUAL";
  const importedLines = new Set(textLines(imported).map((line) => line.toLowerCase()));
  const overrideLines = textLines(override);
  if (overrideLines.length === 0) return "EMPTY";
  const shared = overrideLines.filter((line) => importedLines.has(line.toLowerCase())).length;
  if (shared === 0 || shared === overrideLines.length) return "MANUAL";
  return "MIXED";
}

export function effectiveText(imported: string, override: string | null): string {
  return override === null ? imported : override;
}

export function duplicateValues(items: string[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) duplicates.push(item.trim());
    else seen.add(key);
  }
  return duplicates;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

export type ValidationResult = { ok: true; value: unknown } | { ok: false; message: string };

export function validatePlainOverride(input: { value: string; max: number; url?: boolean; required?: boolean }): ValidationResult {
  const value = sanitizePlainText(input.value);
  if (!value) return { ok: false, message: "Empty override. Reset the field to keep the imported value." };
  if (input.required && !value) return { ok: false, message: "This field is required." };
  if (value.length > input.max) return { ok: false, message: `Maximum length is ${input.max} characters.` };
  if (input.url && !isHttpUrl(value)) return { ok: false, message: "Invalid URL." };
  return { ok: true, value };
}

export function validateListOverride(items: string[]): ValidationResult {
  const clean = items.map((item) => sanitizePlainText(item)).filter(Boolean);
  if (clean.length === 0) return { ok: false, message: "Empty override. Reset the field to keep the imported value." };
  if (clean.length > 40) return { ok: false, message: "Maximum length is 40 items." };
  if (clean.some((item) => item.length > TEXT_LIMIT)) return { ok: false, message: `Maximum length is ${TEXT_LIMIT} characters.` };
  const duplicates = duplicateValues(clean);
  if (duplicates.length > 0) return { ok: false, message: "Duplicate entries are not saved." };
  return { ok: true, value: JSON.stringify(clean) };
}

export function validateFaqOverride(items: Array<{ question: string; answer: string }>): ValidationResult {
  const clean = items
    .map((item) => ({ question: sanitizePlainText(item.question), answer: sanitizePlainText(item.answer) }))
    .filter((item) => item.question || item.answer);
  if (clean.length === 0) return { ok: false, message: "Empty override. Reset the field to keep the imported value." };
  if (clean.some((item) => !item.question || !item.answer)) return { ok: false, message: "Each FAQ entry needs a question and an answer." };
  if (clean.some((item) => item.question.length > TEXT_LIMIT || item.answer.length > LONG_LIMIT)) {
    return { ok: false, message: `Maximum length is ${LONG_LIMIT} characters.` };
  }
  const duplicates = duplicateValues(clean.map((item) => item.question));
  if (duplicates.length > 0) return { ok: false, message: "Duplicate FAQ questions are not saved." };
  return { ok: true, value: JSON.stringify(clean) };
}

export function prepareOverrideForSave(field: string, value: unknown): ValidationResult {
  if (field === "productName" || field === "manufacturer" || field === "cta" || field === "description") {
    if (typeof value !== "string") return { ok: false, message: "This field could not be saved." };
    return validatePlainOverride({
      value,
      max: field === "description" ? LONG_PLAIN_LIMIT : PLAIN_LIMIT,
      required: field === "productName",
    });
  }
  if (field === "trackingUrl") {
    if (typeof value !== "string") return { ok: false, message: "This field could not be saved." };
    return validatePlainOverride({ value, max: URL_PLAIN_LIMIT, url: true });
  }
  if (field === "features" || field === "ingredients" || field === "warnings") {
    if (!Array.isArray(value)) return { ok: false, message: "This field could not be saved." };
    const checked = validateListOverride(value.filter((item): item is string => typeof item === "string"));
    if (!checked.ok) return checked;
    return { ok: true, value: JSON.parse(String(checked.value)) as string[] };
  }
  if (field === "faq") {
    if (!Array.isArray(value)) return { ok: false, message: "This field could not be saved." };
    const items = value.filter((item): item is { question: string; answer: string } => Boolean(item) && typeof item === "object");
    const checked = validateFaqOverride(items);
    if (!checked.ok) return checked;
    return { ok: true, value: JSON.parse(String(checked.value)) as Array<{ question: string; answer: string }> };
  }
  if (field === "usage" || field === "guarantee") {
    return sanitizeRecord(value, field === "usage" ? ["instruction", "frequency", "amount", "notes"] : ["duration", "text"]);
  }
  if (field === "pricing") {
    if (!Array.isArray(value)) return { ok: false, message: "This field could not be saved." };
    const keys = ["packageName", "quantity", "unitPrice", "totalPrice", "savings", "shipping", "bonus"];
    const packages = [];
    for (const item of value) {
      const checked = sanitizeRecord(item, keys);
      if (!checked.ok) return checked;
      packages.push(checked.value);
    }
    if (packages.length === 0) return { ok: false, message: "Empty override. Reset the field to keep the imported value." };
    const duplicates = duplicateValues(packages.map((item) => String((item as { packageName?: string }).packageName ?? "")));
    if (duplicates.length > 0) return { ok: false, message: "Duplicate package names are not saved." };
    return { ok: true, value: packages };
  }
  return { ok: false, message: "Unknown field." };
}

function sanitizeRecord(value: unknown, keys: string[]): ValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, message: "This field could not be saved." };
  const row = value as Record<string, unknown>;
  const next: Record<string, string> = {};
  for (const key of keys) {
    const text = sanitizePlainText(typeof row[key] === "string" ? row[key] : "");
    if (text.length > LONG_PLAIN_LIMIT) return { ok: false, message: `Maximum length is ${LONG_PLAIN_LIMIT} characters.` };
    next[key] = text;
  }
  if (!Object.values(next).some(Boolean)) {
    return { ok: false, message: "Empty override. Reset the field to keep the imported value." };
  }
  return { ok: true, value: next };
}

export function validateImageOverride(value: string): ValidationResult {
  return validatePlainOverride({ value, max: URL_PLAIN_LIMIT, url: true });
}

export function validatePresentationValue(field: PresentationField, raw: string): ValidationResult {
  if (field === "presentation.images" || field === "presentation.ctaColor") {
    const value = sanitizePlainText(raw);
    if (!value) return { ok: false, message: "Empty override. Reset the field to keep the imported value." };
    if (field === "presentation.images") return validateImageOverride(value);
    if (!isHexColor(value)) return { ok: false, message: "Invalid button color." };
    return { ok: true, value };
  }
  if (field === "presentation.navigation" || field === "presentation.visibility" || field === "presentation.order") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (field === "presentation.navigation") return { ok: true, value: parseNavLabels(parsed) };
      if (field === "presentation.visibility") return { ok: true, value: parseVisibility(parsed) };
      return { ok: true, value: parseSectionOrder(parsed) };
    } catch {
      return { ok: false, message: "Could not read this field." };
    }
  }
  const max = field === "presentation.disclosure" || field === "presentation.footer" ? LONG_LIMIT : TEXT_LIMIT;
  return validatePlainOverride({ value: raw, max });
}

export function buildLayerCard(input: {
  field: string;
  sectionId: string;
  label: string;
  importedText: string;
  overrideText: string | null;
  list?: boolean;
  confidence: string;
  origin: string;
  source: string;
}): LayerCard {
  return {
    field: input.field,
    sectionId: input.sectionId,
    label: input.label,
    importedText: input.importedText,
    overrideText: input.overrideText,
    effectiveText: effectiveText(input.importedText, input.overrideText),
    source: input.source,
    confidence: input.confidence,
    origin: input.origin,
    boundary: fieldBoundary(input.field),
    status: layerStatus(input.importedText, input.overrideText, Boolean(input.list)),
  };
}

export function defaultSectionOrder(): ManagedSectionId[] {
  return MANAGED_SECTIONS.map((section) => section.id);
}

export function defaultVisibility(): Record<ManagedSectionId, boolean> {
  return Object.fromEntries(MANAGED_SECTIONS.map((section) => [section.id, true])) as Record<ManagedSectionId, boolean>;
}

export function defaultNavLabels(): Record<ManagedSectionId, string> {
  return Object.fromEntries(MANAGED_SECTIONS.map((section) => [section.id, section.label])) as Record<ManagedSectionId, string>;
}

export function parseSectionOrder(raw: unknown): ManagedSectionId[] {
  const allowed = new Set(defaultSectionOrder());
  const next: ManagedSectionId[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === "string" && allowed.has(item as ManagedSectionId) && !next.includes(item as ManagedSectionId)) {
        next.push(item as ManagedSectionId);
      }
    }
  }
  for (const id of defaultSectionOrder()) {
    if (!next.includes(id)) next.push(id);
  }
  return next;
}

export function parseVisibility(raw: unknown): Record<ManagedSectionId, boolean> {
  const next = defaultVisibility();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
  const record = raw as Record<string, unknown>;
  for (const id of defaultSectionOrder()) {
    if (typeof record[id] === "boolean") next[id] = record[id];
  }
  return next;
}

export function parseNavLabels(raw: unknown): Record<ManagedSectionId, string> {
  const next = defaultNavLabels();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return next;
  const record = raw as Record<string, unknown>;
  for (const id of defaultSectionOrder()) {
    if (typeof record[id] === "string") {
      const label = sanitizePlainText(record[id]);
      if (label && label.length <= TEXT_LIMIT) next[id] = label;
    }
  }
  return next;
}

export const PLAIN_LIMIT = TEXT_LIMIT;
export const LONG_PLAIN_LIMIT = LONG_LIMIT;
export const URL_PLAIN_LIMIT = URL_LIMIT;
