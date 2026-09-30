/**
 * Generic operational evidence: product format, returns mechanics, shipping.
 *
 * Extracts only explicit source text. Never strengthens procedure into a
 * promise, never infers free shipping or worldwide availability, never
 * infers format from an image or a product category.
 */
import { htmlWithoutPageStructure } from "@/lib/content-boundary";
import { isPromotionalOrCta } from "@/lib/import-heuristics";
import { lintSourceStatement } from "@/lib/policy-linter";
import {
  collapseText,
  extractListItems,
  extractParagraphs,
  extractTableCells,
  extractTaggedTexts,
  stripHiddenMarkup,
} from "@/lib/source-html";
import type {
  CopyEligibilityFlag,
  FactConfidence,
  ProductFormatFact,
  ReturnsFactKind,
  ReturnsInformationFact,
  ShippingFactKind,
  ShippingInformationFact,
  SourcePageCategory,
} from "@/lib/product-facts";

const LEGAL_BOILERPLATE =
  /\b(privacy policy|terms of use|all rights reserved|cookie|registered trademark|clickbank|not intended to (diagnose|treat)|have not been evaluated by the food and drug administration|as is.{0,12}and.{0,12}as available|consult (your|a qualified) (physician|medical))\b/i;

const SUPPORT_CONTACT =
  /(\b(email support|order support|product support|toll free|customer support|contact us|[\w.+-]+@[\w-]+\.\w+|\+?\d[\d\s()-]{7,})\b|\[email[^\]]{0,8}protected\])/i;
/**
 * Why an operational sentence is withheld even though it reads like a fact.
 * Each reason names a way the sentence would become a stronger promise than
 * the source makes elsewhere.
 */
export type OperationalExclusionReason =
  | "UNQUALIFIED_AVAILABILITY"
  | "UNVERIFIABLE_PROMISE"
  | "HEARSAY_ESTIMATE"
  | "IMPLIED_FREE_SHIPPING"
  | "NAVIGATIONAL";

export function operationalExclusionReason(text: string): OperationalExclusionReason | null {
  const t = collapseText(text);
  if (/\b(see below|here is the list|go through them|as follows)\b/i.test(t) && !/\d/.test(t)) return "NAVIGATIONAL";
  if (/\b(wherever you want|anywhere you (have|want|like))\b/i.test(t)) return "UNQUALIFIED_AVAILABILITY";
  if (/\baccording to (most of )?(our )?customers\b|\bcustomers (say|report|tell us)\b/i.test(t)) return "HEARSAY_ESTIMATE";
  if (
    /\b(nothing at all|on our side|on the house|we cover (it|the cost))\b/i.test(t) &&
    !/\bfree\b/i.test(t)
  ) {
    return "IMPLIED_FREE_SHIPPING";
  }
  if (/\b(rest assured|guarantees?)\b/i.test(t) && /\b(ship|shipping|deliver|delivered|delivery)\b/i.test(t) && !/\d/.test(t)) {
    return "UNVERIFIABLE_PROMISE";
  }
  return null;
}

/** Titles and labels name a region of the page; they carry no operational fact. */
function isTitleOrLabel(text: string): boolean {
  const t = collapseText(text);
  if (/[:?]$/.test(t)) return true;
  return wordCount(t) <= 6 && !/\d/.test(t) && !/[.!?]$/.test(t);
}

export function splitSentences(text: string): string[] {
  return collapseText(text)
    .split(/(?<=[.!?])\s+(?=[A-Z"“])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Pairs a question block with the block that immediately answers it. */
export function pairQuestionsFromHtml(html: string): Map<string, string> {
  const blocks = [...stripHiddenMarkup(html).matchAll(/<(h[1-6]|p|dt|dd|summary|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => collapseText((match[2] ?? "").replace(/<[^>]+>/g, " ")))
    .filter(Boolean);
  return pairOrderedBlocks(blocks);
}

/** Same pairing when only extracted headings, paragraphs and page text order survive. */
export function pairQuestionsFromText(headings: string[], paragraphs: string[], plainText: string): Map<string, string> {
  const text = collapseText(plainText);
  const located: Array<{ index: number; value: string }> = [];
  for (const value of [...headings, ...paragraphs].map(collapseText).filter(Boolean)) {
    const index = text.indexOf(value);
    if (index >= 0) located.push({ index, value });
  }
  located.sort((a, b) => a.index - b.index);
  return pairOrderedBlocks(located.map((item) => item.value));
}

function pairOrderedBlocks(blocks: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i + 1 < blocks.length; i += 1) {
    const question = blocks[i]!;
    const answer = blocks[i + 1]!;
    if (!/\?$/.test(question) || /\?$/.test(answer)) continue;
    if (!out.has(answer)) out.set(answer, question);
  }
  return out;
}

const FORMAT_NOUN =
  /\b(tablets?|capsules?|softgels?|gummies|gummy|powder|liquid|drops?|lozenges?|chewables?)\b/i;

const CANONICAL_FORMAT: Record<string, string> = {
  tablet: "tablet",
  tablets: "tablet",
  capsule: "capsule",
  capsules: "capsule",
  softgel: "softgel",
  softgels: "softgel",
  gummy: "gummy",
  gummies: "gummy",
  powder: "powder",
  liquid: "liquid",
  drop: "drops",
  drops: "drops",
  lozenge: "lozenge",
  lozenges: "lozenge",
  chewable: "chewable",
  chewables: "chewable",
};

const CATEGORY_ONLY = /\b(supplement|formula|blend|product|vitamin|probiotic)\b/i;

function policyFindings(text: string): string[] {
  return lintSourceStatement(text).map(
    (finding) => `${finding.ruleId}:${finding.blocking ? "BLOCKING" : "WARN"}`,
  );
}

function hasBlockingPolicy(text: string): boolean {
  return lintSourceStatement(text).some((finding) => finding.blocking || finding.status === "fail");
}

function operationalCopyEligibility(text: string, provenance: FactConfidence): {
  copyEligibility: CopyEligibilityFlag;
  policyFindings: string[];
} {
  const findings = policyFindings(text);
  if (provenance !== "DIRECT_SOURCE" && provenance !== "MANUAL") {
    return { copyEligibility: "NO", policyFindings: findings };
  }
  // Campaign-copy review rules (refund duration, consult-a-doctor) warn when
  // this text is later used on a page. They do not withhold a sourced
  // operational fact — the same contract as guaranteeInformation.
  const blocking = lintSourceStatement(text).some(
    (finding) => finding.blocking && finding.ruleId !== "health.refund_duration",
  );
  if (blocking) return { copyEligibility: "NO", policyFindings: findings };
  const healthEfficacy = findings.some((item) =>
    /health\.(cure|treat|time_bound|authority|guarantee|inflammation|immune|respiratory|mechanism|support_effect)|unv\.(rank|volume|clinical)/.test(
      item,
    ),
  );
  if (healthEfficacy) return { copyEligibility: "NO", policyFindings: findings };
  return { copyEligibility: "YES", policyFindings: findings };
}

function skipNoise(text: string): boolean {
  const t = collapseText(text);
  if (!t || t.length < 8) return true;
  if (LEGAL_BOILERPLATE.test(t)) return true;
  if (SUPPORT_CONTACT.test(t) && !/\b(refund|return|shipping|delivery|working days)\b/i.test(t)) return true;
  if (isPromotionalOrCta(t) && !/\b(working days|shipping fee|packing slip|\d+-day period)\b/i.test(t)) return true;
  return false;
}

/** A paragraph carrying a contact or promotional sentence is read sentence by sentence. */
function hasNoiseSentence(text: string): boolean {
  const sentences = splitSentences(text);
  // An imperative contact step ("Send an email to support…") is part of a procedure.
  const isStep = (sentence: string) => /^(send|email|write|call|contact|include|add|insert|please)\b/i.test(sentence);
  return sentences.length > 1 && sentences.some((sentence) => skipNoise(sentence) && !isStep(sentence));
}

function wordCount(value: string): number {
  return collapseText(value).split(/\s+/).filter(Boolean).length;
}

export function canonicalProductFormat(raw: string): string | null {
  const match = collapseText(raw).match(FORMAT_NOUN);
  if (!match) return null;
  return CANONICAL_FORMAT[match[1]!.toLowerCase()] ?? null;
}

/**
 * Explicit textual format only. Category nouns ("supplement") and image-only
 * cues are rejected. Usage that names the dose unit ("chew a tablet") counts.
 */
export function extractExplicitProductFormat(
  texts: string[],
  sourceUrl: string,
  options: { sourcePageCategory?: SourcePageCategory; retrievedAt?: string } = {},
): ProductFormatFact | undefined {
  for (const raw of texts) {
    const statement = collapseText(raw);
    if (!statement || skipNoise(statement)) continue;
    if (hasBlockingPolicy(statement) && !/\b(chew|take|swallow)\b.{0,24}\b(tablet|capsule)/i.test(statement)) {
      continue;
    }
    const format = canonicalProductFormat(statement);
    if (!format) continue;
    if (CATEGORY_ONLY.test(statement) && !FORMAT_NOUN.test(statement)) continue;
    const eligibility = operationalCopyEligibility(statement, "DIRECT_SOURCE");
    const copyEligibility =
      hasBlockingPolicy(statement) && !/\b(chew|take|swallow)\b/i.test(statement) ? "NO" : eligibility.copyEligibility;
    return {
      value: format,
      statement,
      provenance: "DIRECT_SOURCE",
      copyEligibility,
      policyFindings: eligibility.policyFindings,
      sourceUrl,
      sourcePageCategory: options.sourcePageCategory ?? "PRIMARY",
      sourceUnit: "PARAGRAPH",
      sourceLocation: "explicit-format",
      retrievedAt: options.retrievedAt,
    };
  }
  return undefined;
}

function isPostalAddress(text: string): boolean {
  const t = collapseText(text);
  if (t.length > 140 || wordCount(t) > 18 || /[.!?]$/.test(t)) return false;
  return /^\d+[A-Za-z]?\s+\S/.test(t) && t.split(",").length >= 3 && /\b\d{4,6}(?:-\d{4})?\b/.test(t.replace(/^\d+/, ""));
}

function classifyReturnsKind(text: string): ReturnsFactKind | null {
  const t = collapseText(text);
  const hasReturnLexicon = /\b(refund|return(?:ed|ing|s)?|packing slip|money[\s-]?back)\b/i.test(t);
  const hasWindow =
    /\b(\d+\s*-?\s*days?\s+from|within\s+\d+\s*-?\s*days?|have\s+\d+\s+days|\d+\s*-?\s*day(?:s)?\s+period)\b/i.test(
      t,
    ) && /\b(deliver|order|purchase|package|refund|return)\b/i.test(t);
  const sendsBack = /\bsend\b.{0,40}\bback\b/i.test(t);
  if (!hasReturnLexicon && !hasWindow && !sendsBack) {
    // On a returns page, a bare postal address is where items are sent back.
    return isPostalAddress(t) ? "RETURN_PROCESS" : null;
  }
  if (hasWindow) return "RETURN_WINDOW";
  if (/\b(do not (?:support|cover|pay|refund) the return shipping|return shipping costs?)\b/i.test(t)) {
    return "RETURN_CONDITION";
  }
  if (sendsBack || /\b(packing slip|return (?:the )?product|return shipping|opened or not|empty or not)\b/i.test(t)) {
    return "RETURN_PROCESS";
  }
  if (/\b(ask for your money back|refund will be processed|processing time is between|refund request)\b/i.test(t)) {
    return "REFUND_MECHANISM";
  }
  if (/\b(return|refund)\b/i.test(t)) return "OTHER";
  return null;
}

function isStrengthenedGuarantee(text: string): boolean {
  return /\b(guaranteed refund|iron[- ]clad|100%\s+money[- ]back|satisfaction guaranteed)\b/i.test(text);
}

export function extractReturnsFacts(
  texts: string[],
  sourceUrl: string,
  options: { sourcePageCategory?: SourcePageCategory; retrievedAt?: string } = {},
): ReturnsInformationFact[] {
  const out: ReturnsInformationFact[] = [];
  const seen = new Set<string>();
  const accept = (raw: string, unit: "PARAGRAPH" | "SENTENCE"): boolean => {
    const statement = collapseText(raw).replace(/^step\s+\d+:\s*/i, "");
    if (!statement || isTitleOrLabel(statement)) return false;
    if (skipNoise(statement)) return false;
    if (unit === "PARAGRAPH" && hasNoiseSentence(statement)) return false;
    if (isStrengthenedGuarantee(statement)) return false;
    if (operationalExclusionReason(statement)) return false;
    const kind = classifyReturnsKind(statement);
    if (!kind) return false;
    const key = statement.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    const provenance: FactConfidence = "DIRECT_SOURCE";
    // "Use it long enough to see the effect" is a seller efficacy condition,
    // not a return term, and is stored only as non-copy-eligible.
    const efficacyTiming =
      /\b(enough time to work|to (?:prove|see|notice) (?:their|its|the) (?:effects?|results?|benefits?)|at least \d+\s+(?:months?|weeks?))\b/i.test(
        statement,
      );
    const eligibility = operationalCopyEligibility(statement, provenance);
    out.push({
      statement,
      kind,
      provenance,
      copyEligibility: efficacyTiming ? "NO" : eligibility.copyEligibility,
      policyFindings: eligibility.policyFindings,
      sourceUrl,
      sourcePageCategory: options.sourcePageCategory ?? "RETURNS",
      sourceUnit: unit,
      sourceLocation: "returns-page",
      retrievedAt: options.retrievedAt,
    });
    return true;
  };
  for (const raw of texts) {
    if (accept(raw, "PARAGRAPH")) continue;
    // A paragraph rejected as a whole can still hold one explicit term.
    const sentences = splitSentences(raw);
    if (sentences.length > 1) for (const sentence of sentences) accept(sentence, "SENTENCE");
  }
  return dropAggregatesAndFragments(out).slice(0, 12);
}

/**
 * A block that concatenates several captured statements is layout, not a new
 * fact; a fragment wholly inside another captured statement is the same fact.
 */
function dropAggregatesAndFragments<T extends { statement: string }>(items: T[]): T[] {
  const folded = items.map((item) => collapseText(item.statement).toLowerCase());
  const aggregate = new Set<number>();
  folded.forEach((value, i) => {
    const inside = folded.filter((other, j) => j !== i && other.length < value.length && value.includes(other));
    if (inside.length >= 2) aggregate.add(i);
  });
  const kept = items.filter((_, i) => !aggregate.has(i));
  const keptFolded = kept.map((item) => collapseText(item.statement).toLowerCase());
  return kept.filter(
    (_, i) => !keptFolded.some((other, j) => j !== i && other.length > keptFolded[i]!.length && other.includes(keptFolded[i]!)),
  );
}

function looksLikePlace(text: string): boolean {
  const t = collapseText(text);
  if (t.length < 3 || t.length > 48) return false;
  if (/^(delivery address|shipping fee|shipping time|free)$/i.test(t)) return false;
  if (/^\$/.test(t) || /^\d/.test(t)) return false;
  return /^[A-Za-z][A-Za-z\s&.,'-]*$/.test(t);
}

function looksLikeFee(text: string): boolean {
  const t = collapseText(text);
  return /^free$/i.test(t) || /^\$\s*[\d,.]+$/.test(t);
}

function looksLikeEstimate(text: string): boolean {
  return /\d+\s*[-–]\s*\d+\s+working days/i.test(text) || /\d+\s*-\s*\d+\s+business days/i.test(text);
}

function classifyShippingKind(text: string): ShippingFactKind | null {
  const t = collapseText(text);
  if (looksLikeEstimate(t) && /:/.test(t)) return "DESTINATION";
  if (looksLikeEstimate(t)) return "DELIVERY_ESTIMATE";
  if (/\b(\d+\s*hours?|next business day|payment is confirmed|tracking)\b/i.test(t) && /\b(ship|shipped|shipping|order|tracking|dispatch)\b/i.test(t)) {
    return "PROCESSING";
  }
  if (/\b(shipping fees? (?:will )?apply|shipping fee|free shipping|shipping is free)\b/i.test(t)) return "METHOD";
  // The weak signals below only name a fact at sentence scale; a paragraph
  // that merely contains them is re-read sentence by sentence.
  if (splitSentences(t).length > 1) return null;
  if (/\bcustoms\b/i.test(t)) return "OTHER";
  if (/\b(warranty|guarantee|refund) period\b/i.test(t) && /\b(deliver|delivery|shipping)\b/i.test(t)) return "OTHER";
  return null;
}

/** An answer only states a shipping fact together with the question it answers. */
function isShippingQuestion(question: string): boolean {
  return /\b(ship|shipping|deliver|delivery|address|track|order status|arrive)\b/i.test(question);
}

export function extractShippingFacts(
  texts: string[],
  sourceUrl: string,
  options: {
    sourcePageCategory?: SourcePageCategory;
    retrievedAt?: string;
    tableCells?: string[];
    questions?: Map<string, string>;
  } = {},
): ShippingInformationFact[] {
  const out: ShippingInformationFact[] = [];
  const seen = new Set<string>();
  const push = (statement: string, kind: ShippingFactKind, location: string, question?: string): boolean => {
    const text = collapseText(statement);
    if (!text || skipNoise(text)) return false;
    if (operationalExclusionReason(text)) return false;
    const key = text.toLowerCase();
    if (seen.has(key)) return true;
    seen.add(key);
    const eligibility = operationalCopyEligibility(text, "DIRECT_SOURCE");
    out.push({
      statement: text,
      kind,
      provenance: "DIRECT_SOURCE",
      copyEligibility: eligibility.copyEligibility,
      policyFindings: eligibility.policyFindings,
      sourceUrl,
      sourcePageCategory: options.sourcePageCategory ?? "SHIPPING",
      sourceUnit: location.includes("td")
        ? "TABLE_CELL"
        : location.includes("faq")
          ? "FAQ_ANSWER"
          : location.includes("sentence")
            ? "SENTENCE"
            : "PARAGRAPH",
      sourceLocation: location,
      question,
      retrievedAt: options.retrievedAt,
    });
    return true;
  };

  const cells = options.tableCells ?? [];
  for (let i = 0; i < cells.length - 2; i += 1) {
    const place = cells[i] ?? "";
    const fee = cells[i + 1] ?? "";
    const time = cells[i + 2] ?? "";
    if (looksLikePlace(place) && looksLikeFee(fee) && looksLikeEstimate(time)) {
      push(`${place}: ${fee}, ${time}`, "DESTINATION", "shipping#td");
      i += 2;
    }
  }

  for (const raw of texts) {
    const statement = collapseText(raw);
    if (!statement || isTitleOrLabel(statement)) continue;
    const question = options.questions?.get(statement);
    const kind = hasNoiseSentence(statement) ? null : classifyShippingKind(statement);
    if (kind && push(statement, kind, question ? "shipping#faq" : "shipping#p", question)) continue;
    // A short "Yes." answer states the fact its question asks about.
    if (!kind && question && isShippingQuestion(question) && /^(yes|no)\b/i.test(statement)) {
      if (push(statement, "OTHER", "shipping#faq", question)) continue;
    }
    const sentences = splitSentences(statement);
    if (sentences.length < 2) continue;
    for (const sentence of sentences) {
      const sentenceKind = classifyShippingKind(sentence);
      if (sentenceKind) push(sentence, sentenceKind, "shipping#sentence", question);
    }
  }

  return dropAggregatesAndFragments(out).slice(0, 16);
}

export function extractOperationalFactsFromHtml(
  html: string,
  sourceUrl: string,
  category: SourcePageCategory,
  retrievedAt?: string,
  questions: Map<string, string> = pairQuestionsFromHtml(html),
): { returns: ReturnsInformationFact[]; shipping: ShippingInformationFact[] } {
  const cleaned = stripHiddenMarkup(htmlWithoutPageStructure(html));
  const texts = [
    ...extractParagraphs(cleaned),
    ...extractListItems(cleaned),
    ...extractTaggedTexts(cleaned, "td"),
  ];
  const tableCells = extractTableCells(cleaned);
  const returns =
    category === "RETURNS" || category === "REFUNDS"
      ? extractReturnsFacts(texts, sourceUrl, { sourcePageCategory: category, retrievedAt })
      : [];
  const shipping =
    category === "SHIPPING"
      ? extractShippingFacts(texts, sourceUrl, { sourcePageCategory: category, retrievedAt, tableCells, questions })
      : [];
  return { returns, shipping };
}
