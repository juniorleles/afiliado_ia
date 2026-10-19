import type { LandingDocument } from "@/lib/landing-composer/types";

const SOURCE_LABEL = /\s*source:\s*product facts\.?\s*$/i;
const HEALTH_CLAIM = /\b(cholesterol|blood pressure|triglycerides?|inflammation|hdl|blood sugar|arthritis|cardiovascular|heart health|blood flow)\b/i;
const INTERNAL_LINE = /^(the product source lists\b|no extra mechanism was added\b|this [\w' -]+stays with the product source\b)/i;

export function stripFactLabel(value: string): string {
  return value.replace(SOURCE_LABEL, "").trim();
}

const THERAPEUTIC = /\b(cholesterol|blood pressure|triglycerides?|inflammation|hdl|blood sugar|arthritis|cardiovascular|heart health|blood flow|antioxidant|immune|healthy weight|weight loss|daily energy)\b/i;
const EFFECT = /\b(support|supports|help|helps|reduce|reduces|promote|promotes|increase|increases|protect|protects|protection)\b/i;

export const HEALTH_CLAIM_OMISSION = "A fonte declarou o claim, sem comprovação independente nem autorização publicitária.";

export function isConsumerHealthClaim(value: string): boolean {
  if (/not intended to diagnose/i.test(value)) return false;
  if (THERAPEUTIC.test(value)) return true;
  return EFFECT.test(value) && /\b(health|healthy|levels|pain|disease|energy|weight)\b/i.test(value);
}

export function isPendingHealthClaim(value: string): boolean {
  return isConsumerHealthClaim(value) || (HEALTH_CLAIM.test(value) && !/not intended to diagnose/i.test(value));
}

function keyOf(value: string): string {
  return stripFactLabel(value).toLowerCase().replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? stripFactLabel(value) : "";
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? stripFactLabel(item) : "")).filter(Boolean);
}

function isInternal(value: string): boolean {
  return INTERNAL_LINE.test(value.trim());
}

function isTruncated(value: string): boolean {
  return /[…]\s*$/.test(value) || /\.{3}\s*$/.test(value);
}

/** Complete authorized sentences. A clipped tail is dropped instead of shown mid-word. */
export function completeCopy(value: string): string[] {
  const clean = stripFactLabel(value);
  if (!clean || isInternal(clean)) return [];
  const source = isTruncated(clean) ? clean.replace(/\s*[….]+$/, "").trim() : clean;
  if (!source) return [];
  const parts = source.split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  const finished = parts.filter((item) => /[.!?]$/.test(item) && !isInternal(item));
  if (finished.length > 0) return finished;
  if (isTruncated(clean)) return [];
  return [source];
}

export type ClaimOmission = { text: string; reason: string };

export type PresentedSection =
  | { kind: "overview"; items: string[] }
  | { kind: "ingredients"; names: string[] }
  | { kind: "details"; items: string[] }
  | { kind: "guarantee"; text: string }
  | { kind: "important"; items: string[] }
  | { kind: "faq"; items: Array<{ question: string; answer: string }> };

export type PresentedLanding = {
  productName: string;
  description: string | null;
  ctaLabel: string | null;
  footerName: string | null;
  sections: PresentedSection[];
  omitted: ClaimOmission[];
  repeatsSourceHealthClaim: boolean;
};

function answered(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const question = text(row.question);
    const answer = text(row.answer);
    if (!question || !answer) return [];
    return [{ question, answer }];
  });
}

function section(document: LandingDocument, id: string): Record<string, unknown> | null {
  return document.sections.find((item) => item.sectionId === id)?.content ?? null;
}

function isCharacteristic(value: string): boolean {
  return /\b(capsule|formula|bottle|serving|mushroom|supplement|tablet|softgel|powder)\b/i.test(value) && !isConsumerHealthClaim(value);
}

function covers(shown: string[], item: string): boolean {
  const key = keyOf(item);
  if (key.length < 3) return false;
  return shown.some((other) => {
    const value = keyOf(other);
    if (value.length < 3) return false;
    return value === key || value.includes(key) || key.includes(value);
  });
}

export function restoredDescription(sourceFactsJson: string | null | undefined, clipped: string): string | null {
  if (!sourceFactsJson || (!clipped.includes("…") && !clipped.endsWith("..."))) return null;
  try {
    const facts = JSON.parse(sourceFactsJson) as { description?: string };
    const full = facts.description?.trim() ?? "";
    const head = clipped.replace(/\s*[….]+$/, "").trim();
    if (head.length < 24 || !full.startsWith(head)) return null;
    return full;
  } catch {
    return null;
  }
}

export function presentLandingDocument(
  document: LandingDocument,
  options?: { description?: string | null },
): PresentedLanding {
  const hero = section(document, "hero");
  const cta = section(document, "cta");
  const footer = section(document, "footer");
  const productName = text(hero?.headline);
  const storedDescription = text(options?.description) || text(hero?.subheadline);
  const descriptionBlocks = completeCopy(storedDescription);
  const benefitItems = strings(section(document, "benefits")?.fromFacts).filter((item) => !isInternal(item));
  const benefitKeys = new Set(benefitItems.map(keyOf));
  const solutionFeatures = strings(section(document, "solution")?.features).filter((item) => !isInternal(item) && !benefitKeys.has(keyOf(item)));
  const pool = [...benefitItems, ...solutionFeatures];
  const ingredientNames = strings(section(document, "ingredients")?.names).filter((item) => !isInternal(item) && !isConsumerHealthClaim(item));
  for (const name of strings(section(document, "solution")?.ingredients)) {
    if (isInternal(name) || isConsumerHealthClaim(name) || ingredientNames.some((item) => keyOf(item) === keyOf(name))) continue;
    ingredientNames.push(name);
  }
  const ingredientKeys = new Set(ingredientNames.map(keyOf));
  const omitted: ClaimOmission[] = [];
  const seenOmission = new Set<string>();
  function omit(value: string) {
    const clean = value.trim();
    const key = keyOf(clean);
    if (!clean || !key || seenOmission.has(key)) return;
    seenOmission.add(key);
    omitted.push({ text: clean, reason: HEALTH_CLAIM_OMISSION });
  }
  for (const item of [...descriptionBlocks, ...pool]) {
    if (isConsumerHealthClaim(item)) omit(item);
  }

  const characteristics = pool.filter((item) => isCharacteristic(item) && !ingredientKeys.has(keyOf(item)));
  const neutralSentences = descriptionBlocks.filter((item) => !isConsumerHealthClaim(item) && item.length <= 160);
  let description = neutralSentences[0] ?? null;
  if (!description) {
    const support = characteristics.find((item) => item.length <= 90);
    if (support) description = support;
  }
  const shown = [description ?? ""];
  const overview = characteristics.filter((item) => !covers(shown, item));
  const details = pool.filter((item) => !isConsumerHealthClaim(item) && !isCharacteristic(item) && !ingredientKeys.has(keyOf(item)) && !covers([...shown, ...overview], item));
  const sections: PresentedSection[] = [];
  if (overview.length > 0) sections.push({ kind: "overview", items: overview });
  if (ingredientNames.length > 0) sections.push({ kind: "ingredients", names: ingredientNames });
  if (details.length > 0) sections.push({ kind: "details", items: details });

  const guarantee = text(section(document, "guarantee")?.text);
  if (guarantee && !isInternal(guarantee) && !isConsumerHealthClaim(guarantee)) sections.push({ kind: "guarantee", text: guarantee });

  const cautions = strings(section(document, "problem")?.cautions).filter((item) => !isInternal(item));
  if (cautions.length > 0) sections.push({ kind: "important", items: cautions });

  const faq = answered(section(document, "faq")?.items).filter((item) => !isConsumerHealthClaim(item.question) && !isConsumerHealthClaim(item.answer));
  if (faq.length > 0) sections.push({ kind: "faq", items: faq });

  const visible = [
    productName,
    description ?? "",
    ...sections.flatMap((item) => {
      if (item.kind === "overview" || item.kind === "details" || item.kind === "important") return item.items;
      if (item.kind === "ingredients") return item.names;
      if (item.kind === "guarantee") return [item.text];
      return item.items.flatMap((entry) => [entry.question, entry.answer]);
    }),
  ].join("\n");

  return {
    productName,
    description,
    ctaLabel: text(cta?.label) || null,
    footerName: text(footer?.productName) || productName || null,
    sections,
    omitted,
    repeatsSourceHealthClaim: omitted.length > 0 || isConsumerHealthClaim(visible),
  };
}

export function dedupePresentedLines(sectionId: string, lines: string[], benefitLines: string[], ingredientLines: string[]): string[] {
  const clean = lines.map((line) => stripFactLabel(line).replace(/^- /, "").trim()).filter((line) => line && !isInternal(line) && !isTruncated(line) && !isConsumerHealthClaim(line));
  if (sectionId !== "solution") return clean;
  const skip = new Set([...benefitLines, ...ingredientLines].flatMap((line) => {
    const value = stripFactLabel(line).replace(/^- /, "").trim();
    return value ? [keyOf(value)] : [];
  }));
  return clean.filter((line) => !skip.has(keyOf(line)));
}
