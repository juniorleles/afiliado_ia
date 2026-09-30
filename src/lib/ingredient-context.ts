/**
 * Seller-attributed ingredient context.
 *
 * Ingredient identity (ingredientsOrComponents) is a different authority
 * object from a source statement about that ingredient. This module never
 * upgrades a seller statement into a verified fact.
 */
import { htmlWithoutPageStructure } from "@/lib/content-boundary";
import { isIngredientIdentityName } from "@/lib/import-heuristics";
import { lintSourceStatement } from "@/lib/policy-linter";
import {
  extractHeadings,
  extractListItems,
  extractParagraphs,
  extractTaggedTexts,
  stripHiddenMarkup,
  collapseText,
} from "@/lib/source-html";
import type {
  CopyEligibilityFlag,
  FactConfidence,
  IngredientContextEntry,
  IngredientContextKind,
  IngredientContextRelation,
  SourcePageCategory,
} from "@/lib/product-facts";

const RELATION_SUPPORTS = /\b(supports?|helps?|maintains?|promotes?|targets?)\b/i;
const RELATION_CONTAINS = /\bcontains?\b/i;
const RELATION_DESCRIBED = /\b(is an?|is the)\b/i;

const HEALTH_OBJECT =
  /\b(gum|gums|teeth|tooth|immune|sinus|sinuses|bacteria|microbiome|oral|mouth|breath|digestive|digestion|gut|health|healthy|whiteness|inflammation|respiratory|joint|joints|skin|heart|blood|cholesterol|liver|kidney|brain|memory|sleep|metabolism|hormone|hormones|weight)\b/i;

const EFFICACY_VERB =
  /\b(supports?|supporting|helps?|maintains?|promotes?|targets?|boosts?|improves?|restores?|repopulates?|repopulate|protects?|fights?|destroys?|destroy|prevents?|reduces?|relieves?|heals?|strengthens?|stay free|for the health of|good health of|do(?:es)? wonders)\b/i;

/**
 * A statement that attributes an effect on the body. Diagnostic and gating
 * only: a match can withhold copy, never grant it.
 */
export function isHealthEfficacyStatement(text: string): boolean {
  const t = collapseText(text);
  return HEALTH_OBJECT.test(t) && EFFICACY_VERB.test(t);
}

function fold(value: string): string {
  return collapseText(value)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9'%$.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string): number {
  return collapseText(value).split(/\s+/).filter(Boolean).length;
}

function policyFindings(text: string): string[] {
  return lintSourceStatement(text).map(
    (finding) => `${finding.ruleId}:${finding.blocking ? "BLOCKING" : "WARN"}`,
  );
}

export function relationFromStatement(statement: string): IngredientContextRelation {
  const t = collapseText(statement);
  // Structural verb only. Do not infer a stronger relation from world knowledge.
  if (RELATION_CONTAINS.test(t) && !RELATION_SUPPORTS.test(t)) return "CONTAINS";
  if (RELATION_DESCRIBED.test(t) && !RELATION_SUPPORTS.test(t)) return "DESCRIBED_AS";
  if (RELATION_SUPPORTS.test(t)) return "SUPPORTS";
  return "OTHER";
}

export function classifyIngredientContextKind(
  statement: string,
  relation: IngredientContextRelation,
): IngredientContextKind {
  if (isHealthEfficacyStatement(statement)) return "HEALTH_EFFICACY";
  if (relation === "SUPPORTS" && HEALTH_OBJECT.test(statement)) return "HEALTH_EFFICACY";
  // A seller-stated effect on something other than the body is still the
  // seller's claim, not neutral description.
  if (relation === "SUPPORTS") return "SELLER_ATTRIBUTED";
  return "NEUTRAL_CONTEXT";
}

export function ingredientContextCopyEligibility(
  statement: string,
  kind: IngredientContextKind,
  provenance: FactConfidence,
): { copyEligibility: CopyEligibilityFlag; policyFindings: string[] } {
  const findings = policyFindings(statement);
  if (provenance !== "DIRECT_SOURCE" && provenance !== "MANUAL") {
    return { copyEligibility: "NO", policyFindings: findings };
  }
  if (kind === "HEALTH_EFFICACY") {
    return { copyEligibility: "NO", policyFindings: findings };
  }
  if (findings.length > 0) {
    return { copyEligibility: "NO", policyFindings: findings };
  }
  return { copyEligibility: "YES", policyFindings: findings };
}

function matchIngredient(statement: string, names: string[]): string | null {
  const folded = fold(statement);
  let best: string | null = null;
  for (const name of names) {
    const token = fold(name);
    if (token.length < 3) continue;
    if (folded === token) continue;
    if (folded.includes(token) && (!best || name.length > best.length)) best = name;
  }
  return best;
}

export function isIngredientIdentityLabel(text: string): boolean {
  return isIngredientIdentityName(collapseText(text));
}

function looksLikeBibliographicCitation(text: string): boolean {
  const t = collapseText(text);
  if (/\b(doi:|pmid|pubmed|et al\.?)\b/i.test(t)) return true;
  if (/\b(journal|frontiers in|proceedings of the)\b/i.test(t)) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z]\.?)+\s/.test(t) && /\b(19|20)\d{2}\b/.test(t)) return true;
  if (/\b(19|20)\d{2}\s*[;:]\s*\d/.test(t)) return true;
  return false;
}

function isContextStatement(text: string): boolean {
  const t = collapseText(text);
  if (wordCount(t) < 3 || t.length > 300) return false;
  if (/^["“”']/.test(t) || /\?$/.test(t)) return false;
  if (looksLikeBibliographicCitation(t)) return false;
  if (RELATION_SUPPORTS.test(t) || RELATION_CONTAINS.test(t) || RELATION_DESCRIBED.test(t)) return true;
  // Identity labels are noun phrases. A lowercase predicate means this is a statement.
  if (/\b[a-z]{4,}\b/.test(t)) return true;
  return false;
}

export function buildIngredientContextEntry(input: {
  ingredient: string;
  statement: string;
  sourceUrl: string;
  sourcePageCategory?: SourcePageCategory;
  sourceUnit?: string;
  sourceLocation?: string;
  retrievedAt?: string;
  provenance?: FactConfidence;
}): IngredientContextEntry {
  const statement = collapseText(input.statement);
  const relation = relationFromStatement(statement);
  const kind = classifyIngredientContextKind(statement, relation);
  const provenance = input.provenance ?? "DIRECT_SOURCE";
  const eligibility = ingredientContextCopyEligibility(statement, kind, provenance);
  const resolvedKind =
    eligibility.policyFindings.some((item) => item.startsWith("health.") || item.startsWith("unv."))
      ? "HEALTH_EFFICACY"
      : kind;
  return {
    ingredient: collapseText(input.ingredient),
    statement,
    relation,
    attribution: "SELLER",
    provenance,
    kind: resolvedKind,
    copyEligibility: eligibility.copyEligibility,
    policyFindings: eligibility.policyFindings,
    sourceUrl: input.sourceUrl,
    sourcePageCategory: input.sourcePageCategory ?? "PRIMARY",
    sourceUnit: input.sourceUnit,
    sourceLocation: input.sourceLocation,
    retrievedAt: input.retrievedAt,
  };
}

function headingIngredientBlocks(html: string): Array<{ heading: string; body: string }> {
  const blocks: Array<{ heading: string; body: string }> = [];
  const re = /<h([3-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const found: Array<{ index: number; end: number; heading: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    found.push({
      index: match.index,
      end: match.index + match[0].length,
      heading: collapseText(extractTaggedTexts(match[0], `h${match[1]}`)[0] ?? ""),
    });
  }
  for (let i = 0; i < found.length; i += 1) {
    const current = found[i];
    if (!current.heading) continue;
    const bodyEnd = i + 1 < found.length ? found[i + 1].index : html.length;
    blocks.push({ heading: current.heading, body: html.slice(current.end, bodyEnd) });
  }
  return blocks;
}

/**
 * A list whose nearest preceding text is exactly a known ingredient name is
 * that ingredient's card, whatever element carries the label.
 */
function labelledIngredientLists(html: string, names: string[]): Array<{ ingredient: string; body: string }> {
  const out: Array<{ ingredient: string; body: string }> = [];
  for (const match of html.matchAll(/<(ul|ol)\b[^>]*>[\s\S]*?<\/\1>/gi)) {
    const index = match.index ?? 0;
    const before = html.slice(Math.max(0, index - 600), index);
    const segments = before.split(/<[^>]+>/).map(collapseText).filter(Boolean);
    const label = segments[segments.length - 1];
    if (!label) continue;
    const ingredient = names.find((name) => fold(name) === fold(label));
    if (ingredient) out.push({ ingredient, body: match[0] });
  }
  return out;
}

export function extractIngredientContextFromHtml(
  html: string,
  ingredientNames: string[],
  sourceUrl: string,
  options: {
    sourcePageCategory?: SourcePageCategory;
    retrievedAt?: string;
  } = {},
): IngredientContextEntry[] {
  const cleaned = stripHiddenMarkup(htmlWithoutPageStructure(html));
  const names = ingredientNames.map(collapseText).filter(Boolean);
  const entries: IngredientContextEntry[] = [];
  const seen = new Set<string>();

  const push = (ingredient: string, statement: string, location: string, unit: string) => {
    const text = collapseText(statement);
    if (!ingredient || !isContextStatement(text)) return;
    const key = `${fold(ingredient)}::${fold(text)}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(
      buildIngredientContextEntry({
        ingredient,
        statement: text,
        sourceUrl,
        sourcePageCategory: options.sourcePageCategory,
        sourceUnit: unit,
        sourceLocation: location,
        retrievedAt: options.retrievedAt,
      }),
    );
  };

  for (const block of headingIngredientBlocks(cleaned)) {
    const headingName = names.find((name) => fold(block.heading) === fold(name));
    if (!headingName) continue;
    for (const item of extractListItems(block.body)) {
      const named = matchIngredient(item, names) ?? headingName;
      push(named, item, "primary#ingredient-card", "LIST_ITEM");
    }
    for (const paragraph of extractParagraphs(block.body)) {
      const named = matchIngredient(paragraph, names) ?? headingName;
      push(named, paragraph, "primary#ingredient-card", "PARAGRAPH");
    }
  }

  for (const block of labelledIngredientLists(cleaned, names)) {
    for (const item of extractListItems(block.body)) {
      const named = matchIngredient(item, names) ?? block.ingredient;
      push(named, item, "primary#ingredient-label", "LIST_ITEM");
    }
  }

  for (const item of extractListItems(cleaned)) {
    const named = matchIngredient(item, names);
    if (!named) continue;
    if (fold(item) === fold(named)) continue;
    push(named, item, "primary#li", "LIST_ITEM");
  }

  for (const paragraph of extractParagraphs(cleaned)) {
    const named = matchIngredient(paragraph, names);
    if (!named) continue;
    push(named, paragraph, "primary#p", "PARAGRAPH");
  }

  return entries.slice(0, 24);
}
