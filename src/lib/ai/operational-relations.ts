/**
 * Relations between a measured operational fact (a duration, range, or fee)
 * and its qualifier ("depending on", "because", "if", ...). A realization may
 * restate the relation only when one evidence sentence states both parts;
 * joining a measure from one sentence to a qualifier from another changes
 * meaning.
 */

const UNIT = String.raw`(?:working days?|business days?|days?|hours?|weeks?|months?)`;
const RANGE = new RegExp(
  String.raw`(?:between\s+)?(\d+(?:\.\d+)?)\s*(?:-|–|to|and)\s*(\d+(?:\.\d+)?)\s*(${UNIT})\b`,
  "gi",
);
const SINGLE = new RegExp(String.raw`\b(\d+(?:\.\d+)?)\s*[- ]?(${UNIT})\b`, "gi");
const MONEY = /\$\s?(\d+(?:\.\d{2})?)/g;

const QUALIFIER =
  /\b(?:depending on|depends on|based on|because of|because|due to|owing to|if|unless|as long as|provided that)\b([^.;!?]*)/gi;

const QUALIFIER_STOPWORDS = new Set([
  "your", "the", "which", "you", "use", "used", "that", "this", "they", "their", "with", "from", "have", "has",
  "are", "was", "were", "will", "may", "can", "not", "and", "for", "our", "its", "any", "all", "some",
]);

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const NUMBER_WORD = String.raw`(?:${[...Object.keys(SMALL_NUMBERS), ...Object.keys(TENS), "hundred", "thousand"].join("|")})`;
const WRITTEN_WITH_NUMERAL = new RegExp(
  String.raw`(?:\b(${NUMBER_WORD}(?:[\s-]+(?:and[\s-]+)?${NUMBER_WORD})*)\s*)?\((\d+)\)(?=\s*-?\s*${UNIT}\b)`,
  "gi",
);

function writtenNumberValue(words: string): number | null {
  let total = 0;
  let current = 0;
  for (const word of words.toLowerCase().split(/[\s-]+/).filter((item) => item && item !== "and")) {
    if (word in SMALL_NUMBERS) current += SMALL_NUMBERS[word]!;
    else if (word in TENS) current += TENS[word]!;
    else if (word === "hundred") current = Math.max(1, current) * 100;
    else if (word === "thousand") {
      total += Math.max(1, current) * 1000;
      current = 0;
    } else return null;
  }
  return total + current;
}

/**
 * "sixty (60) days" states the same duration as "60 days". The written form is
 * dropped only when it names the same number as the numeral; a conflicting
 * pair is left as-is so it supports no measure.
 */
export function withNormalizedNumerals(text: string): string {
  return text.replace(WRITTEN_WITH_NUMERAL, (whole, words: string | undefined, digits: string) => {
    if (words && writtenNumberValue(words) !== Number(digits)) return whole;
    return digits;
  });
}

function unitKey(unit: string): string {
  const u = unit.toLowerCase();
  if (/hour/.test(u)) return "hours";
  if (/week/.test(u)) return "weeks";
  if (/month/.test(u)) return "months";
  return "days";
}

/** Normalized measures: "5-10 days", "60 hours", "$15.95". */
export function operationalMeasures(raw: string): string[] {
  const text = withNormalizedNumerals(raw);
  const out = new Set<string>();
  const rangeSpans: Array<[number, number]> = [];
  for (const match of text.matchAll(RANGE)) {
    out.add(`${match[1]}-${match[2]} ${unitKey(match[3] ?? "")}`);
    rangeSpans.push([match.index ?? 0, (match.index ?? 0) + match[0].length]);
  }
  for (const match of text.matchAll(SINGLE)) {
    const at = match.index ?? 0;
    if (rangeSpans.some(([start, end]) => at >= start && at < end)) continue;
    out.add(`${match[1]} ${unitKey(match[2] ?? "")}`);
  }
  for (const match of text.matchAll(MONEY)) out.add(`$${match[1]}`);
  return [...out];
}

function stem(token: string): string {
  const base = token.length > 5 ? token.replace(/(?:ed|ing)$/, "") : token;
  return base.replace(/(?:ies)$/, "y").replace(/(?:es|s)$/, "");
}

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !QUALIFIER_STOPWORDS.has(word) && !/^\d+$/.test(word))
    .map(stem);
}

export function splitEvidenceSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** A dot that ends an abbreviation or an initial, not a sentence. */
const ABBREVIATION_END =
  /(?:\b(?:e\.g|i\.e|etc|vs|approx|incl|no|nos|dept|st|mr|mrs|ms|dr|jr|sr|inc|ltd|co|corp|a\.m|p\.m)|(?:^|[\s(])[A-Za-z](?:\.[A-Za-z])*)\.$/i;
const SENTENCE_END = /([.!?]+)(\s+)(?=["'“(]?[A-Z0-9$])/g;
/**
 * Openers that make a sentence depend on the previous one, so it stays with it.
 * Time-taking "it" ("It may take a while ...") is expletive and stands alone.
 */
const DEPENDENT_OPENER = /^(?:this|that|these|those|its|they|them|their|such|which|otherwise|however|but|also|then|it)\b/i;
const EXPLETIVE_IT = /^it\s+(?:(?:may|might|can|could|will|would|usually|typically|normally|often)\s+)?(?:takes?|taking)\b/i;

/**
 * Smallest meaning-preserving sentences of one operational statement, in
 * source order. Decimals, abbreviations, initials and ellipses never split;
 * a sentence that refers back to the previous one stays attached to it.
 */
export function atomicOperationalSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\n+/)) {
    const pieces: string[] = [];
    let start = 0;
    for (const match of line.matchAll(SENTENCE_END)) {
      const end = (match.index ?? 0) + (match[1] ?? "").length;
      const candidate = line.slice(start, end);
      if ((match[1] ?? "").startsWith("..")) continue;
      if (match[1] === "." && ABBREVIATION_END.test(candidate)) continue;
      pieces.push(candidate.trim());
      start = end + (match[2] ?? "").length;
    }
    pieces.push(line.slice(start).trim());
    for (const piece of pieces.filter(Boolean)) {
      const dependent = DEPENDENT_OPENER.test(piece) && !EXPLETIVE_IT.test(piece);
      if (out.length > 0 && dependent) out[out.length - 1] = `${out[out.length - 1]} ${piece}`;
      else out.push(piece);
    }
  }
  return out;
}

export type OperationalMergeFinding = { sentence: string; measure: string; qualifier: string };

/**
 * Generated sentences that attach a qualifier to a measure although no single
 * evidence sentence carries both. Measures absent from the evidence are left
 * to the field-binding checks.
 */
export function unsupportedOperationalMerges(generated: string, evidence: string): OperationalMergeFinding[] {
  const evidenceSentences = splitEvidenceSentences(evidence).map((sentence) => ({
    measures: new Set(operationalMeasures(sentence)),
    words: new Set(contentWords(sentence)),
  }));
  const findings: OperationalMergeFinding[] = [];
  for (const sentence of splitEvidenceSentences(generated)) {
    const measures = operationalMeasures(sentence).filter((measure) =>
      evidenceSentences.some((item) => item.measures.has(measure)),
    );
    if (measures.length === 0) continue;
    for (const match of sentence.matchAll(QUALIFIER)) {
      const qualifierWords = contentWords(match[1] ?? "");
      if (qualifierWords.length === 0) continue;
      for (const measure of measures) {
        const related = evidenceSentences.some(
          (item) => item.measures.has(measure) && qualifierWords.every((word) => item.words.has(word)),
        );
        if (!related) findings.push({ sentence, measure, qualifier: match[0].trim() });
      }
    }
  }
  return findings;
}

export type RelationTransferType = "CONDITION" | "DURATION" | "FEE" | "DESTINATION" | "CAUSE" | "EXCEPTION";
export type RelationTransferFinding = { clause: string; type: RelationTransferType; detail: string };

const TRANSFER_QUALIFIER =
  /\b(depending on|depends on|based on|only if|if|as long as|provided that|unless|except(?: for)?|excluding|other than|because of|because|due to|owing to)\b([^.;!?]*)/gi;
const ROW_LABEL = /(?:^|\s)((?:[A-Z][A-Za-z.]*)(?:\s+(?:and|&)\s+[A-Z][A-Za-z.]*|\s+[A-Z][A-Za-z.]*)*):/g;

/** Words that frame a measure without saying what it measures. */
const FRAME_WORDS = new Set(
  ["within", "take", "typically", "usually", "about", "around", "approximately", "after", "before", "between", "per", "each", "only", "least", "most", "more", "less", "than", "up", "until", "costs", "cost", "free"].map(stem),
);

function qualifierType(word: string): RelationTransferType {
  const q = word.toLowerCase();
  if (/unless|except|excluding|other than/.test(q)) return "EXCEPTION";
  if (/because|due to|owing to/.test(q)) return "CAUSE";
  return "CONDITION";
}

function measureType(measure: string): RelationTransferType {
  return measure.startsWith("$") ? "FEE" : "DURATION";
}

function withoutMeasures(text: string): string {
  return withNormalizedNumerals(text).replace(RANGE, " ").replace(SINGLE, " ").replace(MONEY, " ");
}

/** Clauses of generated prose: sentences, then "; ", ", and/but ", then row labels ("Canada: ..."). */
function generatedClauses(text: string): string[] {
  const out: string[] = [];
  for (const sentence of splitEvidenceSentences(text)) {
    for (const part of sentence.split(/;\s+|,\s+(?:and|but)\s+/)) {
      const cuts = [...part.matchAll(ROW_LABEL)]
        .map((match) => (match.index ?? 0) + (match[0].length - match[0].trimStart().length))
        .filter((at) => at > 0);
      let start = 0;
      for (const at of cuts) {
        out.push(part.slice(start, at).trim());
        start = at;
      }
      out.push(part.slice(start).trim());
    }
  }
  return out.filter(Boolean);
}

/** Capitalized non-initial words and row-label words: the destinations a measure is attached to. */
function destinationWords(clause: string): string[] {
  const label = clause.match(/^((?:[A-Z][A-Za-z.]*)(?:\s+(?:and|&)\s+[A-Z][A-Za-z.]*|\s+[A-Z][A-Za-z.]*)*):/)?.[1] ?? "";
  const rest = clause.slice(label ? label.length + 1 : 0);
  const capitalized = [...rest.matchAll(/(?<=\s)[A-Z][A-Za-z]+/g)].map((match) => match[0]);
  return contentWords([label, ...capitalized].join(" "));
}

/**
 * Relations a realization transfers between cited operational propositions.
 * Each proposition keeps its own measures, destinations and qualifiers: a
 * clause may carry a measure only with the destinations, conditions, causes,
 * exceptions and subject that one cited proposition states with it.
 */
export function unsupportedPropositionTransfers(generated: string, propositions: readonly string[]): RelationTransferFinding[] {
  const props = propositions.map((text) => ({ measures: new Set(operationalMeasures(text)), words: new Set(contentWords(text)) }));
  const findings: RelationTransferFinding[] = [];
  for (const clause of generatedClauses(generated)) {
    const measures = operationalMeasures(clause);
    const qualifiers = [...clause.matchAll(TRANSFER_QUALIFIER)].map((match) => {
      const [tail = "", ...main] = (match[2] ?? "").split(",");
      return {
        type: qualifierType(match[1] ?? ""),
        text: `${match[1] ?? ""}${tail}`.trim(),
        tail: contentWords(tail),
        main: main.join(","),
        at: match.index ?? 0,
      };
    });
    if (measures.length === 0) {
      for (const qualifier of qualifiers) {
        if (qualifier.tail.length === 0) continue;
        const head = contentWords(`${clause.slice(0, qualifier.at)} ${qualifier.main}`);
        const bound = props.some(
          (prop) => qualifier.tail.every((word) => prop.words.has(word)) && (head.length === 0 || head.some((word) => prop.words.has(word))),
        );
        if (!bound) findings.push({ clause, type: qualifier.type, detail: `"${qualifier.text}" is not stated with this statement in one cited proposition` });
      }
      continue;
    }
    const missing = measures.filter((measure) => !props.some((prop) => prop.measures.has(measure)));
    for (const measure of missing) findings.push({ clause, type: measureType(measure), detail: `${measure} is not stated in any cited proposition` });
    if (missing.length) continue;
    const hosts = props.filter((prop) => measures.every((measure) => prop.measures.has(measure)));
    const destinations = destinationWords(clause);
    if (hosts.length === 0) {
      const score = (prop: (typeof props)[number]) =>
        destinations.filter((word) => prop.words.has(word)).length * 10 + measures.filter((measure) => prop.measures.has(measure)).length;
      const anchor = [...props].sort((a, b) => score(b) - score(a))[0];
      for (const measure of measures.filter((item) => !anchor?.measures.has(item))) {
        findings.push({ clause, type: measureType(measure), detail: `${measure} belongs to a different proposition` });
      }
      continue;
    }
    const measureLabel = measures.join(" + ");
    for (const word of destinations) {
      if (!hosts.some((prop) => prop.words.has(word))) {
        findings.push({ clause, type: "DESTINATION", detail: `"${word}" is not stated with ${measureLabel}` });
      }
    }
    for (const qualifier of qualifiers) {
      if (qualifier.tail.length === 0) continue;
      if (!hosts.some((prop) => qualifier.tail.every((word) => prop.words.has(word)))) {
        findings.push({ clause, type: qualifier.type, detail: `"${qualifier.text}" is not stated with ${measureLabel}` });
      }
    }
    const qualifierWords = new Set(qualifiers.flatMap((qualifier) => qualifier.tail));
    const unqualified = qualifiers.reduce((text, qualifier) => text.replace(qualifier.text, " "), clause);
    const subject = contentWords(withoutMeasures(unqualified)).filter(
      (word) => !qualifierWords.has(word) && !destinations.includes(word) && !FRAME_WORDS.has(word),
    );
    if (subject.length >= 2 && !subject.some((word) => hosts.some((prop) => prop.words.has(word)))) {
      findings.push({ clause, type: measureType(measures[0] ?? ""), detail: `${measureLabel} is attached to a statement its proposition does not make` });
    }
  }
  return findings;
}

export type OptionalityFinding = { clause: string; item: string; marker: string };

/** Markers that follow the item they make optional: "order number (optional)", "a receipt if available". */
const OPTIONAL_AFTER = /\(\s*optional\s*\)|\b(?:if|when|where) (?:available|applicable)\b|\b(?:is|are) optional\b/gi;
/** Markers that precede the item: "an optional note", "optionally, include a photo". */
const OPTIONAL_BEFORE = /(?<!\(\s*)(?<!\b(?:is|are)\s+)\b(?:optional|optionally)\b(?!\s*\)),?/gi;
/** Any realization that keeps the item optional or conditional. */
const OPTIONALITY_KEPT =
  /\b(?:optional(?:ly)?|(?:if|when|where) (?:available|applicable|possible)|if you (?:have|wish|like|want|can)|not (?:required|necessary|mandatory)|you (?:may|can)(?: also)?|may (?:also )?(?:be )?(?:include|add|provide)d?)\b/i;
const ITEM_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "your", "our", "their", "its", "with", "of", "to", "for", "you", "in", "on", "at", "any", "some", "is", "are", "be",
]);

function itemTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !ITEM_STOPWORDS.has(word))
    .map(stem);
}

/** Comma/semicolon segments; the unit an optionality marker qualifies. */
function segments(sentence: string): string[] {
  return sentence.split(/[,;:]\s*|\s+(?:and|or|so|so that)\s+/i).map((part) => part.trim()).filter(Boolean);
}

/** Items a proposition marks optional or conditional, as up to two identifying tokens each. */
function optionalItems(proposition: string): Array<{ tokens: string[]; marker: string }> {
  const items: Array<{ tokens: string[]; marker: string }> = [];
  for (const sentence of splitEvidenceSentences(proposition)) {
    for (const segment of segments(sentence)) {
      for (const match of segment.matchAll(OPTIONAL_AFTER)) {
        const before = itemTokens(segment.slice(0, match.index ?? 0)).slice(-2);
        if (before.length) items.push({ tokens: before, marker: match[0] });
      }
      for (const match of segment.matchAll(OPTIONAL_BEFORE)) {
        const after = itemTokens(segment.slice((match.index ?? 0) + match[0].length)).slice(0, 2);
        if (after.length) items.push({ tokens: after, marker: match[0].replace(/,$/, "") });
      }
    }
  }
  return items;
}

/**
 * Generated clauses that restate an item a cited proposition marks optional or
 * conditional ("(optional)", "if available", "when available", "where
 * applicable") without keeping that optionality, turning it into an apparent
 * requirement. Omitting the item is allowed; stating optionality the source
 * does not contain is left to the other binding checks.
 */
export function droppedOptionality(generated: string, propositions: readonly string[]): OptionalityFinding[] {
  const items = propositions.flatMap(optionalItems);
  if (items.length === 0) return [];
  const findings: OptionalityFinding[] = [];
  for (const sentence of splitEvidenceSentences(generated)) {
    const sentenceKeeps = /^(?:optionally|you (?:may|can))\b/i.test(sentence.trim());
    for (const segment of segments(sentence)) {
      if (sentenceKeeps || OPTIONALITY_KEPT.test(segment)) continue;
      const words = new Set(itemTokens(segment));
      const item = items.find((candidate) => candidate.tokens.every((token) => words.has(token)));
      if (item) findings.push({ clause: sentence, item: segment, marker: item.marker });
    }
  }
  return findings;
}

const CAUSAL_CONNECTIVE = /\b(?:due to|because of|caused by|as a result of|owing to|results? in|leads? to|causes?)\b/i;
const CAUSAL_VERB = /\b(?:causes?|caused|causing|leads? to|results? in)\b/gi;

/**
 * "X may cause Y" restates evidence only when one evidence sentence states a
 * causal relation between the same X and Y (for example "Y due to X").
 */
export function causalRelationInEvidence(generatedSentence: string, evidence: string): boolean {
  const words = contentWords(generatedSentence.replace(CAUSAL_VERB, " ")).filter(
    (word) => !/^(?:might|could|would|should|also|often|sometime)$/.test(word),
  );
  if (words.length < 2) return false;
  return splitEvidenceSentences(evidence).some((sentence) => {
    if (!CAUSAL_CONNECTIVE.test(sentence)) return false;
    const evidenceWords = new Set(contentWords(sentence));
    return words.every((word) => evidenceWords.has(word));
  });
}
