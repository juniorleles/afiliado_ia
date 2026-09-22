/**
 * THIN_MODE conservative rewrite contract.
 *
 * Grammar and compression are allowed. New factual or editorial predicates
 * are not. This is an additional defense; it does not replace Grounding.
 */

import { unsupportedRelationalExpansions } from "@/lib/ai/ingredient-claims";

export const SEMANTIC_CLOSURE_CODES = [
  "NEW_PREDICATE",
  "INFERRED_AUDIENCE_OR_PURPOSE",
  "RELATIONSHIP_TRANSFORMATION",
  "EDITORIAL_CHARACTERIZATION",
  "INFERRED_CONCLUSION",
  "COPYWRITER_FILLER",
] as const;

export type SemanticClosureCode = (typeof SEMANTIC_CLOSURE_CODES)[number];

export type SemanticClosureHit = {
  text: string;
  code: SemanticClosureCode;
};

export type SemanticClosureResult = {
  result: "PASS" | "FAIL";
  failCodes: SemanticClosureCode[];
  hits: SemanticClosureHit[];
};

export type SemanticClosureInput = {
  generated: string;
  support: string;
  slotType?: string;
  thinMode?: boolean;
};

const EDITORIAL_ADJ =
  /\b(practical|straightforward|simple|convenient|comprehensive|balanced|thoughtful|well-rounded|robust|effective|strong|powerful|premium|ideal|useful|meaningful|targeted|clear|focused|multi-angle|impressive|excellent|advanced|unique|smart)\b/gi;

const AUDIENCE_PURPOSE =
  /\bfor (?:anyone|those|people|users|customers|buyers|someone) (?:looking|seeking|wanting|who|in search)\b|\banyone looking to\b|\bfor those seeking\b|\blooking to (?:maintain|improve|get|find)\b/gi;

const FILLER =
  /\bthis makes it\b|\bthis offers\b|\bthis provides a\b|\boverall\b|\btaken together\b|\bthis approach\b|\bthis strategy\b|\bthis makes\b/gi;

const NEW_PREDICATE =
  /\bmaintain(?:s|ing)? (?:joint )?function\b|\bjoint function\b|\bmaintain(?:s|ing)? joint\b/gi;

const APPROACH_COLLOCATION =
  /\bmulti[- ]angle(?:\s+\w+){0,3}\s+approach(?:es)?\b|\b(?:targeted|clear|focused) approach\b|\bapproach to\b|\bthis approach\b|\bmechanism-focused approach\b/gi;

const STRATEGY_NOUN = /\bstrateg(?:y|ies)\b/gi;
const OPTION_NOUN = /\boptions?\b/gi;

function collect(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: string[] = [];
  let match = re.exec(text);
  while (match) {
    out.push(match[0]);
    if (match.index === re.lastIndex) re.lastIndex += 1;
    match = re.exec(text);
  }
  return out;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function supportHas(support: string, snippet: string): boolean {
  return normalize(support).includes(normalize(snippet));
}

function hasPattern(text: string, pattern: RegExp): boolean {
  return new RegExp(pattern.source, "i").test(text);
}

function headAfterAdjective(sentence: string, adjective: string): string {
  const re = new RegExp(`\\b${adjective}\\b\\s+([a-z]+)`, "i");
  const hit = sentence.match(re);
  return (hit?.[1] || "").toLowerCase();
}

function uniqueCodes(hits: SemanticClosureHit[]): SemanticClosureCode[] {
  const seen = new Set<SemanticClosureCode>();
  const out: SemanticClosureCode[] = [];
  for (const hit of hits) {
    if (seen.has(hit.code)) continue;
    seen.add(hit.code);
    out.push(hit.code);
  }
  return out;
}

function practicalGoalReorderAllowed(generated: string, support: string, adjective: string): boolean {
  if (adjective !== "practical") return false;
  if (!supportHas(support, "practical goals")) return false;
  const phrase = generated.match(/\bpractical\b(?:\s+[a-z0-9-]+){1,3}\s+goals\b/i)?.[0] || "";
  if (!phrase) return false;
  const middle = phrase
    .replace(/^practical\s+/i, "")
    .replace(/\s+goals$/i, "")
    .split(/\s+/)
    .filter(Boolean);
  const movementGoals = /\b(?:bend(?:ing)?|walk(?:ing)?|exercis(?:e|ing)|run(?:ning)?|movement|mobility)\b/i.test(support);
  return middle.every((word) => {
    if (supportHas(support, word)) return true;
    return word.toLowerCase() === "mobility" && movementGoals;
  });
}

function editorialHits(generated: string, support: string): SemanticClosureHit[] {
  const hits: SemanticClosureHit[] = [];
  for (const adj of collect(generated, EDITORIAL_ADJ)) {
    const key = adj.toLowerCase();
    const head = headAfterAdjective(generated, key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const collocation = head ? `${key} ${head}` : key;
    if (supportHas(support, collocation)) continue;
    if (head === "goals" && supportHas(support, "practical goals")) continue;
    if (practicalGoalReorderAllowed(generated, support, key)) continue;
    if (head === "ingredients" && supportHas(support, "targeted ingredients")) continue;
    hits.push({ text: collocation, code: "EDITORIAL_CHARACTERIZATION" });
  }
  hits.push(...unauthorizedFreeModifiers(generated, support));
  return hits;
}

function unauthorizedFreeModifiers(generated: string, support: string): SemanticClosureHit[] {
  const hits: SemanticClosureHit[] = [];
  const re = /\b([a-z]+-free)\s+([a-z]+)\b/gi;
  let match = re.exec(generated);
  while (match) {
    const phrase = match[0];
    if (!supportHas(support, phrase) && !supportHas(support, match[1] || "")) {
      hits.push({ text: phrase, code: "EDITORIAL_CHARACTERIZATION" });
    }
    match = re.exec(generated);
  }
  return hits;
}

function relationshipHits(generated: string, support: string): SemanticClosureHit[] {
  const hits: SemanticClosureHit[] = [];
  const sourceHasStrategy = hasPattern(support, STRATEGY_NOUN);
  const sourceHasApproachCollo = hasPattern(support, APPROACH_COLLOCATION);
  const sourceHasOption = hasPattern(support, OPTION_NOUN);
  for (const span of collect(generated, STRATEGY_NOUN)) {
    if (!sourceHasStrategy) hits.push({ text: span, code: "RELATIONSHIP_TRANSFORMATION" });
  }
  for (const span of collect(generated, APPROACH_COLLOCATION)) {
    if (!sourceHasApproachCollo && !supportHas(support, span)) {
      hits.push({ text: span, code: "RELATIONSHIP_TRANSFORMATION" });
    }
  }
  for (const span of collect(generated, OPTION_NOUN)) {
    if (!sourceHasOption) hits.push({ text: span, code: "EDITORIAL_CHARACTERIZATION" });
  }
  for (const span of unsupportedRelationalExpansions(generated, support)) {
    if (/\bstrateg|\bapproach\b|\bsynerg/i.test(span) || /\bmulti[- ]angle daily approach\b/i.test(span)) {
      hits.push({ text: span, code: "RELATIONSHIP_TRANSFORMATION" });
    }
  }
  return hits;
}

function audienceHits(generated: string): SemanticClosureHit[] {
  return collect(generated, AUDIENCE_PURPOSE).map((text) => ({ text, code: "INFERRED_AUDIENCE_OR_PURPOSE" as const }));
}

function fillerHits(generated: string): SemanticClosureHit[] {
  return collect(generated, FILLER).map((text) => ({ text, code: "COPYWRITER_FILLER" as const }));
}

function predicateHits(generated: string, support: string): SemanticClosureHit[] {
  const hits: SemanticClosureHit[] = [];
  for (const span of collect(generated, NEW_PREDICATE)) {
    if (!supportHas(support, span) && !supportHas(support, "joint function")) {
      hits.push({ text: span, code: "NEW_PREDICATE" });
    }
  }
  return hits;
}

function conclusionHits(generated: string, slotType: string | undefined, other: SemanticClosureHit[]): SemanticClosureHit[] {
  if (slotType !== "FINAL_THOUGHTS") return [];
  const synthesis = other.some(
    (hit) =>
      hit.code === "INFERRED_AUDIENCE_OR_PURPOSE" ||
      hit.code === "EDITORIAL_CHARACTERIZATION" ||
      hit.code === "COPYWRITER_FILLER" ||
      hit.code === "RELATIONSHIP_TRANSFORMATION",
  );
  if (!synthesis) return [];
  return [{ text: generated.slice(0, 80), code: "INFERRED_CONCLUSION" }];
}

export function validateThinSemanticClosure(input: SemanticClosureInput): SemanticClosureResult {
  if (input.thinMode === false) {
    return { result: "PASS", failCodes: [], hits: [] };
  }
  const generated = (input.generated || "").trim();
  const support = input.support || "";
  if (!generated) return { result: "PASS", failCodes: [], hits: [] };

  const hits: SemanticClosureHit[] = [
    ...audienceHits(generated),
    ...fillerHits(generated),
    ...predicateHits(generated, support),
    ...editorialHits(generated, support),
    ...relationshipHits(generated, support),
  ];
  hits.push(...conclusionHits(generated, input.slotType, hits));

  const failCodes = uniqueCodes(hits);
  return {
    result: failCodes.length ? "FAIL" : "PASS",
    failCodes,
    hits,
  };
}

export function semanticClosureViolations(
  generated: string,
  support: string,
  slotType?: string,
  thinMode = true,
): SemanticClosureHit[] {
  return validateThinSemanticClosure({ generated, support, slotType, thinMode }).hits;
}
