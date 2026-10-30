import {
  EDITORIAL_HEADLINE_MAX_WORDS,
  EDITORIAL_QUALITY_GATE_ID,
  EDITORIAL_SUBHEADLINE_MAX_WORDS,
  type ApprovedCopyInventory,
  type CommercialCopyState,
  type EditorialIssue,
  type FaqMode,
  type VisualComposition,
} from "./types.ts";
import { copyChangeIsGrounded, mapApprovedFacts } from "./commercial.ts";
import { isFactDumpHeadline, wordCount } from "./editorial-rules.ts";

export { isFactDumpHeadline, wordCount } from "./editorial-rules.ts";

export function detectDuplicateSectionTitles(markup: string): string[] {
  const titles = [...markup.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map((match) => match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const duplicated: string[] = [];
  for (const title of titles) {
    if (seen.has(title) && !duplicated.includes(title)) duplicated.push(title);
    seen.add(title);
  }
  return duplicated;
}

export function detectEmptySections(markup: string): string[] {
  const empty: string[] = [];
  if (/data-product-presentation="editorial"/i.test(markup) && /<h2[^>]*>\s*The product\s*<\/h2>/i.test(markup)) {
    empty.push("The product");
  }
  const blocks = [...markup.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>([\s\S]*?)(?=<h2\b|<\/main>|$)/gi)];
  for (const block of blocks) {
    const title = block[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const body = block[2].replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (title && body.length < 24) empty.push(title);
  }
  return [...new Set(empty)];
}

export function detectFaqWithoutAnswer(markup: string): boolean {
  const items = [...markup.matchAll(/<details\b[\s\S]*?<\/details>/gi)];
  if (!items.length) return /data-premium="faq"/i.test(markup);
  return items.some((item) => {
    const answer = item[0].match(/data-faq-answer[\s\S]*?<\/p>/i)?.[0] ?? item[0].match(/<p class="ds-body">([\s\S]*?)<\/p>/i)?.[1] ?? "";
    return !answer.replace(/<[^>]+>/g, "").trim();
  });
}

export function editorialHeadlineAcceptable(
  text: string,
  inventory: ApprovedCopyInventory,
): { ok: boolean; reason: string } {
  const grounded = copyChangeIsGrounded(text, ["identity.productName"], inventory, "headline");
  if (!grounded.ok) return grounded;
  if (wordCount(text) > EDITORIAL_HEADLINE_MAX_WORDS) {
    return { ok: false, reason: "HEADLINE_TOO_LONG" };
  }
  if (isFactDumpHeadline(text)) {
    return { ok: false, reason: "HEADLINE_FACT_DUMP" };
  }
  return { ok: true, reason: "Natural commercial headline." };
}

export function editorialOperationsFromIssues(issues: EditorialIssue[]): Array<{ op: string; value?: string | boolean }> {
  return issues.map((issue) => ({ op: issue.operation, value: issue.proposed_value }));
}

export function runEditorialQualityGate(input: {
  markup: string;
  copy: CommercialCopyState;
  composition: VisualComposition;
  inventory: ApprovedCopyInventory;
}): {
  gateId: typeof EDITORIAL_QUALITY_GATE_ID;
  pass: boolean;
  issues: EditorialIssue[];
  headlineWordCount: number;
  subheadlineWordCount: number;
  duplicatedTitles: string[];
  emptySections: string[];
  faqWithoutAnswer: boolean;
} {
  const issues: EditorialIssue[] = [];
  const headlineWordCount = wordCount(input.copy.headline.text);
  const subheadlineWordCount = wordCount(input.copy.subheadline.text);
  const duplicatedTitles = detectDuplicateSectionTitles(input.markup);
  const emptySections = detectEmptySections(input.markup);
  const faqWithoutAnswer = detectFaqWithoutAnswer(input.markup);
  const name = input.inventory.productName.trim() || "this product";

  if (headlineWordCount > EDITORIAL_HEADLINE_MAX_WORDS) {
    issues.push({
      issue: "HEADLINE_TOO_LONG",
      component: "hero",
      severity: "HIGH",
      operation: "REWRITE_HEADLINE",
      proposed_value: `Discover ${name}`,
      supporting_fact_ids: ["identity.productName"],
      requires_content_approval: false,
      evidence: `Headline has ${headlineWordCount} words; limit is ${EDITORIAL_HEADLINE_MAX_WORDS}.`,
    });
  }
  if (isFactDumpHeadline(input.copy.headline.text)) {
    issues.push({
      issue: "HEADLINE_FACT_DUMP",
      component: "hero",
      severity: "HIGH",
      operation: "REWRITE_HEADLINE",
      proposed_value: `Discover ${name}`,
      supporting_fact_ids: ["identity.productName"],
      requires_content_approval: false,
      evidence: `Headline concatenates packages and commercial terms: "${input.copy.headline.text}".`,
    });
  }
  if (subheadlineWordCount > EDITORIAL_SUBHEADLINE_MAX_WORDS) {
    issues.push({
      issue: "LOW_INFORMATION_DENSITY",
      component: "hero",
      severity: "MEDIUM",
      operation: "REWRITE_SUBHEADLINE",
      proposed_value: editorialSubheadline(input.inventory),
      supporting_fact_ids: editorialSubheadlineFacts(input.inventory),
      requires_content_approval: false,
      evidence: `Subheadline has ${subheadlineWordCount} words; preferred limit is ${EDITORIAL_SUBHEADLINE_MAX_WORDS}.`,
    });
  }
  for (const title of duplicatedTitles) {
    issues.push({
      issue: "DUPLICATED_SECTION",
      component: title,
      severity: "HIGH",
      operation: "MERGE_DUPLICATE_SECTIONS",
      proposed_value: "true",
      supporting_fact_ids: ["fulfillment"],
      requires_content_approval: false,
      evidence: `Section title "${title}" appears more than once.`,
    });
  }
  for (const title of emptySections) {
    issues.push({
      issue: "EMPTY_SECTION",
      component: title,
      severity: "HIGH",
      operation: "REMOVE_EMPTY_SECTION",
      proposed_value: "none",
      supporting_fact_ids: [],
      requires_content_approval: false,
      evidence: `Section "${title}" does not carry enough approved information.`,
    });
  }
  if (
    input.composition.conversion.productPresentation === "editorial" &&
    /data-product-presentation="editorial"/i.test(input.markup)
  ) {
    issues.push({
      issue: "EXCESSIVE_REPETITION",
      component: "product-presentation",
      severity: "MEDIUM",
      operation: "REMOVE_EMPTY_SECTION",
      proposed_value: "none",
      supporting_fact_ids: [],
      requires_content_approval: false,
      evidence: "Editorial product block repeats the packshot and hero introduction.",
    });
  }
  const mapping = mapApprovedFacts(input.copy, input.inventory);
  for (const row of mapping.filter((item) => !item.grounded)) {
    issues.push({
      issue: "UNSUPPORTED_COPY",
      component: row.field,
      severity: "HIGH",
      operation: row.field === "headline" ? "REWRITE_HEADLINE" : "REWRITE_SUBHEADLINE",
      proposed_value: row.field === "headline" ? `Discover ${name}` : editorialSubheadline(input.inventory),
      supporting_fact_ids: row.supportingFactIds,
      requires_content_approval: true,
      evidence: row.reason,
    });
  }
  if (faqWithoutAnswer) {
    issues.push({
      issue: "FAQ_WITHOUT_ANSWER",
      component: "faq",
      severity: "HIGH",
      operation: "COMPLETE_GROUNDED_FAQ",
      proposed_value: "interactive",
      supporting_fact_ids: ["faq"],
      requires_content_approval: false,
      evidence: "FAQ items are missing visible grounded answers.",
    });
  }
  if (input.composition.conversion.faqMode !== "interactive") {
    issues.push({
      issue: "FAQ_WITHOUT_ANSWER",
      component: "faq",
      severity: "MEDIUM",
      operation: "COMPLETE_GROUNDED_FAQ",
      proposed_value: "interactive" satisfies FaqMode,
      supporting_fact_ids: ["faq"],
      requires_content_approval: false,
      evidence: "FAQ answers are not demonstrated in an interactive open state.",
    });
  }

  return {
    gateId: EDITORIAL_QUALITY_GATE_ID,
    pass: issues.filter((item) => item.severity === "HIGH").length === 0,
    issues,
    headlineWordCount,
    subheadlineWordCount,
    duplicatedTitles,
    emptySections,
    faqWithoutAnswer,
  };
}

export function editorialSubheadline(inventory: ApprovedCopyInventory): string {
  const parts: string[] = ["the formula"];
  if (inventory.ingredients.length) parts.push("ingredients");
  if (inventory.packages.length) parts.push("available packages");
  if (inventory.guaranteeDays) parts.push(`${inventory.guaranteeDays}-day refund terms`);
  if (parts.length === 1) return "Review the seller-listed product details below.";
  const last = parts.pop()!;
  return `Explore ${parts.join(", ")}, and ${last}.`;
}

export function editorialSubheadlineFacts(inventory: ApprovedCopyInventory): string[] {
  return [
    "identity.productName",
    ...(inventory.ingredients.length ? ["ingredients"] : []),
    ...(inventory.packages.length ? ["pricing.packages"] : []),
    ...(inventory.guaranteeDays ? ["guarantee.days"] : []),
  ];
}
