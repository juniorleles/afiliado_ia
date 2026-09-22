/**
 * Ingredient language classification.
 *
 * NAMED_INGREDIENT_CLAIM identifies a specific ingredient/component.
 * GENERIC_INGREDIENT_RESTATEMENT mentions ingredients without naming one.
 * The word "ingredient" in eligible description/features is not field authority.
 */

export const CLAIM_CLASS_NAMED_INGREDIENT = "NAMED_INGREDIENT" as const;
export const CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT = "GENERIC_INGREDIENT_RESTATEMENT" as const;
export const CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION = "UNSUPPORTED_RELATIONAL_EXPANSION" as const;
export const CLAIM_CLASS_COMPOSITION_PROMOTION = "COMPOSITION_PROMOTION" as const;

export type IngredientClaimClass =
  | typeof CLAIM_CLASS_NAMED_INGREDIENT
  | typeof CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT
  | typeof CLAIM_CLASS_UNSUPPORTED_RELATIONAL_EXPANSION
  | typeof CLAIM_CLASS_COMPOSITION_PROMOTION
  | "NONE";

const GENERIC_NAME_TOKENS = new Set([
  "ingredients",
  "ingredient",
  "details",
  "information",
  "names",
  "name",
  "working",
  "provide",
  "provides",
  "broader",
  "support",
  "also",
  "the",
  "a",
  "an",
  "and",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "targeted",
  "these",
  "those",
  "this",
  "that",
  "its",
  "their",
  "formula",
  "blend",
  "daily",
  "copy",
  "text",
  "sections",
  "section",
  "only",
  "hundreds",
  "compounds",
  "compound",
  "approach",
  "focus",
  "together",
  "antioxidants",
  "antioxidant",
  "give",
  "gives",
  "listed",
  "named",
  "additional",
  "specific",
  "identities",
  "work",
  "works",
  "for",
  "from",
  "with",
  "that",
  "which",
  "when",
  "while",
  "using",
  "used",
  "can",
  "may",
  "help",
  "helps",
  "into",
  "through",
]);

const GENERIC_INGREDIENT_RESTATEMENT =
  /\b(?:five|six|seven|eight|nine|ten|\d+)\s+targeted\s+ingredients?\b|\b(?:the|these|those|its|their)\s+ingredients?\b|\ba blend of ingredients\b|\bingredient names\b|\bingredients?\s+(?:working together|provide|provides|also give|also)\b|\busing (?:five\s+)?(?:targeted\s+)?ingredients?\b|\bwith (?:five\s+)?(?:targeted\s+)?ingredients?\b|\bthrough (?:five\s+)?(?:targeted\s+)?ingredients?\b|\bingredients?\s+and\s+a\s+focus\b/i;

export type RelationalStrength = "conservative" | "strengthened";

export type RelationalClaim = {
  text: string;
  strength: RelationalStrength;
  predicate: string;
};

const STRENGTHENED_RELATIONAL =
  /\b(?:synerg(?:y|istic(?:ally)?)|complement each other|coordinat(?:e|ed|ing)(?:\s+(?:together|with each other|support))?|(?:ingredients?|elements?|components?|features?)\s+interact(?:s|ing)?|interact(?:s|ing)? (?:with each other|together)|amplif(?:y|ies|ied|ication)|enhance(?:s|d)? each other(?:['’]s effects)?|multi[- ]angle strategy|multi-pathway synergy)\b/gi;

const CONSERVATIVE_WORK_TOGETHER =
  /\bwork(?:s|ing)? together(?:\s+to\s+[^.!?]{3,200})?/gi;

const CONSERVATIVE_COMBINE =
  /\bcombin(?:e[sd]?|ing)\s+to\s+[^.!?]{3,200}/gi;

const CONSERVATIVE_TOGETHER_CREATE =
  /\btogether\b[, ]+(?:those |these |the )?(?:features|ingredients|elements|components|they)\s+create\s+[^.!?]{3,200}/gi;

const RELATIONAL_STOP = new Set([
  "a", "an", "the", "to", "of", "and", "or", "those", "these", "this", "that",
  "its", "their", "they", "features", "ingredients", "elements", "components",
  "together", "work", "works", "working",
]);

const CLOSED_INGREDIENT_SYNERGY =
  /\bingredients?\b.{0,64}\b(?:work(?:s|ing)? together|work synergistically|synerg(?:y|istic(?:ally)?)|complement each other|combine to|act together|multi-pathway synergy|coordinated support)\b|\b(?:work(?:s|ing)? together|work synergistically|synerg(?:y|istic(?:ally)?)|complement each other|combine to|act together|multi-pathway synergy|coordinated support).{0,64}\bingredients?\b/gi;

const INGREDIENT_COUNT_CLAIM =
  /\b(?:contains|has|includes)\s+(?:only\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:(?:clinically\s+proven|active|main|primary|key|proprietary|patented|essential|targeted|powerful|natural|listed)\s+)*(?:ingredients?|components?|compounds?)\b/i;

const CONTAINS_NAMED =
  /\b(?:(?:formula\s+)?contains|includes|made with|formulated with)\s+(?:(?:only|just)\s+)?(?!hundreds|details|information|copy|text|sections?|only|five|six|seven|eight|nine|ten|the|these|those|its|their)([A-Za-z][A-Za-z0-9®\-]*)(?:\s+[A-Za-z][A-Za-z0-9®\-]*){0,4}/gi;

const COMBINES_NAMED =
  /\b(?:combines|containing)\s+([A-Z][A-Za-z0-9®\-]+)(?:\s+and\s+([A-Za-z][A-Za-z0-9®\-]+))?/g;

const INCLUDED_NAME = /\b([A-Z][A-Za-z0-9®\-]+(?:\s+[A-Z][A-Za-z0-9®\-]*){0,2})\s+is included\b/g;

const CAMEL_CASE_MARK = /\b([A-Z][a-z]+[A-Z][A-Za-z0-9]*)\b/g;

function collect(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: string[] = [];
  let match = re.exec(text);
  while (match) {
    out.push(match[0].trim());
    if (match.index === re.lastIndex) re.lastIndex += 1;
    match = re.exec(text);
  }
  return out;
}

function isGenericContainedName(name: string): boolean {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const first = tokens[0]?.toLowerCase() ?? "";
  if (tokens.length === 0) return true;
  if (tokens.length === 1) return GENERIC_NAME_TOKENS.has(first);
  if (
    (first === "ingredient" || first === "ingredients") &&
    tokens[1] &&
    !GENERIC_NAME_TOKENS.has(tokens[1].toLowerCase())
  ) {
    return false;
  }
  return tokens.every((token) => GENERIC_NAME_TOKENS.has(token.toLowerCase()));
}

export function isIngredientCountClaim(text: string): boolean {
  return INGREDIENT_COUNT_CLAIM.test(text);
}

export function isGenericIngredientRestatement(text: string): boolean {
  if (namedIngredientMentions(text).length > 0) return false;
  return GENERIC_INGREDIENT_RESTATEMENT.test(text);
}

const COMPOSITION_PROMOTION =
  /\b(?:contains|includes|formulated with|made with)\s+(?:antioxidants?|botanicals?|botanical compounds?|inflammatory-response compounds?)\b|\bantioxidant ingredients\b/gi;

export function compositionPromotionClaims(text: string): string[] {
  return collect(text, COMPOSITION_PROMOTION);
}

export function hasCompositionPromotionLanguage(text: string): boolean {
  return compositionPromotionClaims(text).length > 0;
}

function predicateTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !RELATIONAL_STOP.has(token));
}

function uniqueRelational(hits: RelationalClaim[]): RelationalClaim[] {
  const seen = new Set<string>();
  const out: RelationalClaim[] = [];
  for (const hit of hits) {
    const key = `${hit.strength}:${hit.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function extractPredicate(span: string): string {
  const workTo = span.match(/\bwork(?:s|ing)? together\s+to\s+([^.!?]+)$/i);
  if (workTo?.[1]) return workTo[1].trim();
  const combineTo = span.match(/\bcombin(?:e[sd]?|ing)\s+to\s+([^.!?]+)$/i);
  if (combineTo?.[1]) return combineTo[1].trim();
  const create = span.match(/\bcreate\s+([^.!?]+)$/i);
  if (create?.[1]) return `create ${create[1].trim()}`;
  return "";
}

export function relationalLanguageClaims(text: string): RelationalClaim[] {
  const hits: RelationalClaim[] = [];
  for (const span of collect(text, STRENGTHENED_RELATIONAL)) {
    hits.push({ text: span, strength: "strengthened", predicate: span.toLowerCase() });
  }
  for (const span of collect(text, CONSERVATIVE_WORK_TOGETHER)) {
    hits.push({ text: span, strength: "conservative", predicate: extractPredicate(span) });
  }
  for (const span of collect(text, CONSERVATIVE_COMBINE)) {
    hits.push({ text: span, strength: "conservative", predicate: extractPredicate(span) });
  }
  for (const span of collect(text, CONSERVATIVE_TOGETHER_CREATE)) {
    hits.push({ text: span, strength: "conservative", predicate: extractPredicate(span) || "create" });
  }
  return uniqueRelational(hits);
}

export function relationalIngredientClaims(text: string): string[] {
  return relationalLanguageClaims(text).map((item) => item.text);
}

export function closedIngredientSynergyClaims(text: string): string[] {
  return collect(text, CLOSED_INGREDIENT_SYNERGY);
}

function predicatesCompatible(model: string, source: string): boolean {
  const modelTokens = predicateTokens(model);
  const sourceTokens = new Set(predicateTokens(source));
  if (modelTokens.length === 0) return false;
  const hits = modelTokens.filter((token) => sourceTokens.has(token)).length;
  return hits >= Math.ceil(modelTokens.length * 0.6) || modelTokens.every((token) => sourceTokens.has(token));
}

export function relationshipEntailed(model: RelationalClaim, evidence: string): boolean {
  const source = relationalLanguageClaims(evidence);
  if (source.length === 0) return false;
  if (model.strength === "strengthened") {
    return source.some(
      (item) =>
        item.strength === "strengthened" &&
        (item.text.toLowerCase() === model.text.toLowerCase() || predicatesCompatible(model.predicate || model.text, item.predicate || item.text)),
    );
  }
  if (!model.predicate) {
    return source.some((item) => item.strength === "conservative" && /\bwork(?:s|ing)? together\b/i.test(item.text));
  }
  return source.some((item) => predicatesCompatible(model.predicate, item.predicate || item.text));
}

export function unsupportedRelationalExpansions(generated: string, evidence: string): string[] {
  return relationalLanguageClaims(generated)
    .filter((claim) => !relationshipEntailed(claim, evidence))
    .map((claim) => claim.text);
}

export function evaluateRelationalEntailment(generated: string, evidence: string) {
  const model = relationalLanguageClaims(generated);
  const source = relationalLanguageClaims(evidence);
  const unsupported = unsupportedRelationalExpansions(generated, evidence);
  return {
    RELATIONSHIP_PRESENT: model.length > 0 ? "YES" : "NO",
    SOURCE_RELATIONSHIP: source.map((item) => item.text).join(" | ") || "none",
    MODEL_RELATIONSHIP: model.map((item) => item.text).join(" | ") || "none",
    ENTAILED: model.length > 0 && unsupported.length === 0 ? "YES" : "NO",
    RESULT: model.length === 0 ? "NO_RELATIONSHIP" : unsupported.length === 0 ? "ELIGIBLE" : "UNSUPPORTED_RELATIONAL_EXPANSION",
    UNSUPPORTED: unsupported,
  };
}

export function evidenceSupportsIngredientRelationship(evidence: string): boolean {
  return relationalLanguageClaims(evidence).length > 0;
}

export function isIngredientsFieldAssertion(text: string): boolean {
  if (namedIngredientMentions(text).length > 0) return true;
  return (
    /\bwhat (?:are the )?ingredients\b/i.test(text) ||
    /\bwhich ingredients\b/i.test(text) ||
    /\bingredient list\b/i.test(text) ||
    /\bingredient names are not disclosed\b/i.test(text) ||
    /\bingredients? (?:are|is) not (?:disclosed|listed|provided|available)\b/i.test(text) ||
    /\bingredient(?:s)?\s+(?:names?|information|lists?|details).{0,40}\b(?:not (?:disclosed|provided|listed)|unavailable)\b/i.test(
      text,
    )
  );
}

function normalizeIdentityName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isProductIdentityToken(name: string, productName?: string): boolean {
  if (!productName?.trim()) return false;
  return normalizeIdentityName(name) === normalizeIdentityName(productName);
}

export function namedIngredientMentions(text: string, options?: { productName?: string }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (value: string) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(value.trim());
  };

  for (const hit of collect(text, CONTAINS_NAMED)) {
    if (isIngredientCountClaim(hit)) continue;
    const name = hit
      .replace(/^(?:formula\s+)?(?:contains|includes|made with|formulated with)\s+(?:(?:only|just)\s+)?/i, "")
      .trim();
    if (isGenericContainedName(name)) continue;
    add(hit);
  }

  // Same-line ingredient + name. Detect equivalent capitalization of the
  // ingredients word; keep generic continuations ("ingredients also") filtered.
  // Product identity is not composition unless a contains/include frame is used.
  const ingredientProper =
    /\bingredients?(?:\s+include[sd]?)?[ \t]+([A-Za-z][A-Za-z0-9®\-]+(?:[ \t]+[A-Za-z][A-Za-z0-9®\-]*){0,3})/gi;
  for (const hit of collect(text, ingredientProper)) {
    const name = hit.replace(/^ingredients?(?:\s+include[sd]?)?\s+/i, "").trim();
    if (isGenericContainedName(name)) continue;
    const includeFrame = /\bingredients?\s+include/i.test(hit);
    if (!includeFrame && !/[A-Z]/.test(name) && name !== name.toUpperCase()) continue;
    add(hit);
  }

  for (const hit of collect(text, COMBINES_NAMED)) {
    const name = hit.replace(/^(?:combines|containing)\s+/i, "").trim();
    if (isGenericContainedName(name)) continue;
    add(hit);
  }

  for (const hit of collect(text, INCLUDED_NAME)) {
    const name = hit.replace(/\s+is included\b/i, "").trim();
    if (isGenericContainedName(name)) continue;
    add(hit);
  }

  for (const hit of collect(text, CAMEL_CASE_MARK)) {
    if (GENERIC_NAME_TOKENS.has(hit.toLowerCase())) continue;
    if (isProductIdentityToken(hit, options?.productName)) continue;
    add(hit);
  }

  return out;
}

export function classifyIngredientLanguage(text: string): IngredientClaimClass {
  if (hasCompositionPromotionLanguage(text) && namedIngredientMentions(text).length === 0) {
    return CLAIM_CLASS_COMPOSITION_PROMOTION;
  }
  if (namedIngredientMentions(text).length > 0) return CLAIM_CLASS_NAMED_INGREDIENT;
  if (hasCompositionPromotionLanguage(text)) return CLAIM_CLASS_COMPOSITION_PROMOTION;
  if (isGenericIngredientRestatement(text) || (/\bingredients?\b/i.test(text) && !isIngredientsFieldAssertion(text))) {
    return CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT;
  }
  if (isIngredientsFieldAssertion(text) && namedIngredientMentions(text).length === 0) {
    return CLAIM_CLASS_GENERIC_INGREDIENT_RESTATEMENT;
  }
  return "NONE";
}
