/**
 * MODEL_WORDING_CONSTRAINT_V1
 *
 * MODEL output must be an entailment-preserving wording transform of the
 * evidence authorized for that slot. THIN does not use this layer.
 * Does not delete unsupported propositions. Does not retry. Does not
 * weaken existing validators.
 */

import type { EvidenceSlot } from "@/lib/ai/evidence-slot-plan";
import { fieldForTopic } from "@/lib/ai/model-slot-authority";
import type { StructuralViolation } from "@/lib/ai/structured-generation";

export const MODEL_WORDING_ALLOWED = [
  "LEXICAL_PARAPHRASE",
  "GRAMMATICAL_TRANSFORMATION",
  "COMPRESSION",
  "REORDERING",
  "PRONOUN_RESOLUTION",
  "SAFE_HEDGING",
] as const;

export const MODEL_WORDING_FORBIDDEN = [
  "NEW_RELATIONSHIP",
  "NEW_CAUSALITY",
  "NEW_MECHANISM",
  "NEW_SYNERGY",
  "NEW_AUDIENCE",
  "NEW_PURPOSE",
  "NEW_EVALUATION",
  "NEW_RECOMMENDATION",
  "NEW_COMPARISON",
  "NEW_POLICY_RIGHT",
  "NEW_TIMELINE",
  "NEW_USAGE_REQUIREMENT",
  "NEW_SCIENTIFIC_INTERPRETATION",
] as const;

export type ModelWordingAllowed = (typeof MODEL_WORDING_ALLOWED)[number];
export type ModelWordingForbidden = (typeof MODEL_WORDING_FORBIDDEN)[number];

export type ModelWordingViolation = {
  code: "MODEL_WORDING_CONSTRAINT_VIOLATION";
  slotId: string;
  field: string;
  generatedProposition: string;
  authorizedEvidence: string;
  violationType: ModelWordingForbidden;
};

export type ModelWordingConstraintResult = {
  slotId: string;
  field: string;
  authorizedPropositions: string[];
  outputPropositions: string[];
  traceablePropositions: string[];
  untraceablePropositions: string[];
  violations: ModelWordingViolation[];
};

const EDITORIAL_WORDS =
  /\b(?:simple|straightforward|comprehensive|convenient|appealing|meaningful|easy|flexible|generous|robust|ideal|premium|powerful|impressive|excellent|advanced|unique|smart|well-rounded|thoughtful|balanced)\b/gi;

const EDITORIAL_FRAMES =
  /\bstrateg(?:y|ies)\b|\bpathway\b|\bmeasured approach\b|\bmulti[- ]angle approach\b|\bthis approach\b|\bapproach to\b|\bpractical approach\b|\bapproach(?:es)?\b/gi;

const AUDIENCE =
  /\bfor (?:anyone|those|people|users|customers|buyers|someone) (?:looking|seeking|wanting|who|in search)\b|\banyone looking to\b|\bfor those seeking\b|\bideal for\b|\bsuited to\b|\bbuyers? who\b|\bindividuals committed to\b|\busers looking to\b|\bmaking it suitable for\b|\bappealing (?:option )?for\b|\bpeople seeking\b|\bpeople with\b|\bbuyers have\b/gi;

const POLICY_RIGHT =
  /\brequest(?:ing)? a refund\b|\brefund if needed\b|\brisk[\s-]?free\b|\bmoney[\s-]?back(?:\s+guarantee)?\b|\bfull refund\b|\btry it for\b|\bevaluate(?: the product| it)\b|\bevaluation window\b|\bextended window\b|\bbuyers? can request\b|\bbuyers? have \d+\s+days\b|\bto evaluate the product\b|\bdays to evaluate\b/gi;

const USAGE_EXCLUSIVITY =
  /\bno multiple doses\b|\bonly one dose\b|\bwithout complicated timing\b|\bdoses throughout the day\b|\beasy to incorporate\b|\bno other doses\b|\bmultiple doses\b|\bno complicated timing\b/gi;

const SYNERGY =
  /\bwork(?:s|ing)? together\b|\bsynerg(?:y|ies|istic)\b|\bcombined to\b|\bwork with each other\b/gi;

const MECHANISM =
  /\bcushions?\b|\bcushioning\b|\breduces friction\b|\bplays a key role\b|\bfoundational aspect\b|\bnatural lubricant\b|\bjoint function\b|\bmaintain(?:s|ing)? (?:healthy )?synovial fluid\b|\bkey role in\b/gi;

const SCIENCE =
  /\bthrough (?:a |this )?(?:mechanism|pathway|process)\b|\bphysiological\b|\bencyclopedia\b/gi;

const PURPOSE =
  /\baims to\b|\bin order to\b|\bso that (?:buyers|users|customers)\b|\bproviding customers with\b|\bmaking it easy\b/gi;

const RECOMMENDATION =
  /\brecommended usage\b|\brecommended (?:daily|use|dosage)\b|\bwe recommend\b|\bdoctors? recommend\b|\bmanufacturer recommends?\b/gi;

const COMPARISON =
  /\bmore than a (?:single|one)[\s-]mechanism\b|\bbetter than\b|\bunlike other\b|\bcompared to\b|\bsingle-mechanism\b/gi;

const TIMELINE =
  /\blong[\s-]term\b|\bovernight results\b/gi;

const CAUSALITY =
  /\bby addressing\b|\bleads to\b|\bcauses?\b|\bresults in\b|\bwhich directly relates\b/gi;

const REGIMEN = /\bregimen\b/gi;

const SAFE_HEDGE_PREFIX =
  /^(?:designed to|designed to help|helps? to|aims to)\s+/i;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function supportHas(support: string, snippet: string): boolean {
  const needle = normalize(snippet);
  if (!needle) return true;
  return normalize(support).includes(needle);
}

function supportHasPattern(support: string, pattern: RegExp): boolean {
  return new RegExp(pattern.source, pattern.flags.includes("i") ? pattern.flags : `${pattern.flags}i`).test(support);
}

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

export function splitPropositions(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sentenceContaining(text: string, fragment: string): string {
  const idx = text.toLowerCase().indexOf(fragment.toLowerCase());
  if (idx < 0) return fragment;
  const sentences = splitPropositions(text);
  return sentences.find((sentence) => sentence.toLowerCase().includes(fragment.toLowerCase())) || fragment;
}

type PatternRule = { type: ModelWordingForbidden; pattern: RegExp };

const PATTERN_RULES: PatternRule[] = [
  { type: "NEW_POLICY_RIGHT", pattern: POLICY_RIGHT },
  { type: "NEW_SYNERGY", pattern: SYNERGY },
  { type: "NEW_MECHANISM", pattern: MECHANISM },
  { type: "NEW_SCIENTIFIC_INTERPRETATION", pattern: SCIENCE },
  { type: "NEW_AUDIENCE", pattern: AUDIENCE },
  { type: "NEW_USAGE_REQUIREMENT", pattern: USAGE_EXCLUSIVITY },
  { type: "NEW_RECOMMENDATION", pattern: RECOMMENDATION },
  { type: "NEW_COMPARISON", pattern: COMPARISON },
  { type: "NEW_TIMELINE", pattern: TIMELINE },
  { type: "NEW_PURPOSE", pattern: PURPOSE },
  { type: "NEW_CAUSALITY", pattern: CAUSALITY },
];

function stripHedge(text: string): string {
  return text.replace(SAFE_HEDGE_PREFIX, "").trim();
}

type SupportTriple = { subject: string; object: string };

function supportSentences(support: string): string[] {
  return splitPropositions(support);
}

function extractSupportTriples(support: string): SupportTriple[] {
  const triples: SupportTriple[] = [];
  const re = /\b([A-Za-z][A-Za-z0-9®\-]{0,40})\s+supports?\s+([A-Za-z][A-Za-z0-9®\-]{0,40}(?:\s+[A-Za-z][A-Za-z0-9®\-]{1,40}){0,4})/gi;
  let match = re.exec(support);
  while (match) {
    triples.push({ subject: normalize(match[1] || ""), object: normalize(match[2] || "") });
    match = re.exec(support);
  }
  return triples;
}

function extractGeneratedTriples(text: string): Array<SupportTriple & { span: string }> {
  const hedged = stripHedge(text);
  const triples: Array<SupportTriple & { span: string }> = [];
  const re = /\b([A-Za-z][A-Za-z0-9®\-]{0,40})\s+supports?\s+([A-Za-z][A-Za-z0-9®\-]{0,40}(?:\s+[A-Za-z][A-Za-z0-9®\-]{1,40}){0,4})/gi;
  let match = re.exec(hedged);
  while (match) {
    triples.push({
      subject: normalize(match[1] || ""),
      object: normalize(match[2] || ""),
      span: match[0],
    });
    match = re.exec(hedged);
  }
  return triples;
}

function relationshipEntailed(triple: SupportTriple, support: string): boolean {
  const source = extractSupportTriples(support);
  if (
    source.some(
      (item) => item.subject === triple.subject && (item.object === triple.object || item.object.includes(triple.object.split(" ")[0] || triple.object)),
    )
  ) {
    return true;
  }
  const sentences = supportSentences(support);
  const boundInOneSentence = sentences.some((sentence) => {
    const norm = normalize(sentence);
    return (
      norm.includes(triple.subject) &&
      /\bsupports?\b/.test(norm) &&
      norm.includes(triple.object.split(" ")[0] || "")
    );
  });
  if (boundInOneSentence) return true;
  const subjectSentence = sentences.find((sentence) => normalize(sentence).includes(triple.subject));
  const objectSentence = sentences.find((sentence) => {
    const norm = normalize(sentence);
    return /\bsupports?\b/.test(norm) && norm.includes(triple.object.split(" ")[0] || "");
  });
  if (subjectSentence && objectSentence && subjectSentence !== objectSentence) {
    return false;
  }
  return false;
}

function unentailedPatternHits(
  generated: string,
  support: string,
  rule: PatternRule,
): Array<{ span: string; type: ModelWordingForbidden }> {
  return collect(generated, rule.pattern)
    .filter((span) => !supportHas(support, span) && !supportHasPattern(support, new RegExp(`\\b${span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i")))
    .map((span) => ({ span, type: rule.type }));
}

function unentailedEditorial(generated: string, support: string): Array<{ span: string; type: ModelWordingForbidden }> {
  const hits: Array<{ span: string; type: ModelWordingForbidden }> = [];
  for (const span of collect(generated, EDITORIAL_WORDS)) {
    if (supportHasPattern(support, new RegExp(`\\b${span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"))) continue;
    hits.push({ span, type: "NEW_EVALUATION" });
  }
  for (const span of collect(generated, EDITORIAL_FRAMES)) {
    if (supportHas(support, span)) continue;
    if (/\bapproach\b/i.test(span) && supportHasPattern(support, /\bapproach(?:es)?\b/i)) continue;
    if (/\bstrateg/i.test(span) && supportHasPattern(support, /\bstrateg(?:y|ies)\b/i)) continue;
    if (/\bpathway\b/i.test(span) && supportHasPattern(support, /\bpathway\b/i)) continue;
    hits.push({ span, type: "NEW_EVALUATION" });
  }
  return hits;
}

function unentailedRegimen(generated: string, support: string): Array<{ span: string; type: ModelWordingForbidden }> {
  if (!REGIMEN.test(generated)) return [];
  if (supportHasPattern(support, REGIMEN)) return [];
  return [{ span: "regimen", type: "NEW_USAGE_REQUIREMENT" }];
}

export function checkModelWordingConstraint(input: {
  generated: string;
  support: string;
  slotId: string;
  field: string;
}): ModelWordingConstraintResult {
  const generated = (input.generated || "").trim();
  const support = input.support || "";
  const authorizedPropositions = splitPropositions(support);
  const outputPropositions = splitPropositions(generated);
  const violations: ModelWordingViolation[] = [];
  const seen = new Set<string>();

  const push = (span: string, type: ModelWordingForbidden) => {
    const proposition = sentenceContaining(generated, span);
    const key = `${type}::${normalize(span)}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({
      code: "MODEL_WORDING_CONSTRAINT_VIOLATION",
      slotId: input.slotId,
      field: input.field,
      generatedProposition: proposition,
      authorizedEvidence: support,
      violationType: type,
    });
  };

  if (!generated) {
    return {
      slotId: input.slotId,
      field: input.field,
      authorizedPropositions,
      outputPropositions,
      traceablePropositions: [],
      untraceablePropositions: [],
      violations: [],
    };
  }

  for (const rule of PATTERN_RULES) {
    for (const hit of unentailedPatternHits(generated, support, rule)) push(hit.span, hit.type);
  }
  for (const hit of unentailedEditorial(generated, support)) push(hit.span, hit.type);
  for (const hit of unentailedRegimen(generated, support)) push(hit.span, hit.type);

  for (const triple of extractGeneratedTriples(generated)) {
    if (relationshipEntailed(triple, support)) continue;
    const implicitProduct = !supportHasPattern(support, new RegExp(`\\b${triple.subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
    if (implicitProduct) continue;
    push(triple.span, "NEW_RELATIONSHIP");
  }

  const untraceablePropositions = [
    ...new Set(violations.map((item) => item.generatedProposition)),
  ];
  const traceablePropositions = outputPropositions.filter(
    (item) => !untraceablePropositions.some((hit) => hit === item || item.includes(hit) || hit.includes(item)),
  );

  return {
    slotId: input.slotId,
    field: input.field,
    authorizedPropositions,
    outputPropositions,
    traceablePropositions,
    untraceablePropositions,
    violations,
  };
}

export function validateModelWordingConstraint(input: {
  generated: string;
  slot: EvidenceSlot;
}): ModelWordingConstraintResult {
  const support = input.slot.evidence.map((item) => item.value).join("\n");
  const field = input.slot.evidence[0]?.field || fieldForTopic(input.slot.topic);
  return checkModelWordingConstraint({
    generated: input.generated,
    support,
    slotId: input.slot.slotId,
    field,
  });
}

export function wordingConstraintToStructural(result: ModelWordingConstraintResult): StructuralViolation[] {
  return result.violations.map((item) => ({
    code: item.code,
    text: item.generatedProposition,
    reason: `${item.violationType}: SLOT=${item.slotId} FIELD=${item.field} GENERATED_PROPOSITION=${item.generatedProposition} AUTHORIZED_EVIDENCE=${item.authorizedEvidence.slice(0, 240)}`,
    requiredField: item.field,
  }));
}

export function countModelWordingConstraintViolations(violations: StructuralViolation[]): number {
  return violations.filter((item) => item.code === "MODEL_WORDING_CONSTRAINT_VIOLATION").length;
}

export function formatModelWordingConstraintForPrompt(): string {
  return [
    "MODEL WORDING CONSTRAINT — entailment-preserving wording only.",
    `Allowed: ${MODEL_WORDING_ALLOWED.join(", ")}.`,
    "Forbidden unless the assigned slot evidence already contains the meaning:",
    MODEL_WORDING_FORBIDDEN.join(", ") + ".",
    "Fewer propositions than the evidence is valid. Extra factual propositions are not.",
    "Co-occurrence is not synergy. A policy label is not a buyer right. An instruction is not exclusivity or ease-of-use.",
    "Editorial adjectives are allowed only when the assigned evidence supports that meaning. Do not infer audience from features.",
  ].join("\n");
}
