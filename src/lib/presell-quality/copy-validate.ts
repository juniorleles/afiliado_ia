export const REWRITE_STATUSES = ["SAFE_REWRITE", "NEEDS_REVIEW", "UNSUPPORTED_CLAIM", "MEANING_CHANGED", "REJECTED"] as const;
export type RewriteStatus = (typeof REWRITE_STATUSES)[number];

export type CopyRewriteProposal = {
  id: string;
  field: string;
  factId: string;
  original: string;
  proposed: string;
  section: string;
  status: RewriteStatus;
  reasons: string[];
};

const FORBIDDEN_NEW = /\b(proven|clinical|testimonial|fda|cure|treats?|diabetes|blood sugar|guaranteed results|limited time|certif(?:ied|ication)|doctor recommended|miracle|studies show)\b/i;
const WORD_NUMBERS: Record<string, string> = { two: "2", three: "3", thirty: "30", sixty: "60" };

export function extractComparableNumbers(text: string): string[] {
  const digits = text.match(/\d+/g) ?? [];
  const words = [...text.matchAll(/\b(two|three|thirty|sixty)\b/gi)].map((item) => WORD_NUMBERS[item[1].toLowerCase()] ?? item[1]);
  return [...new Set([...digits, ...words])].sort();
}

export function criticalTokensFor(field: string, original: string): string[] {
  if (field === "howItWorks") {
    return ["two full droppers", "30 seconds", "under your tongue", "before breakfast"];
  }
  if (field === "guarantee") {
    return ["60 days", "refund", "return"];
  }
  if (field === "ingredients") {
    return original
      .split(/\s+/)
      .map((item) => item.replace(/[.,]/g, "").trim())
      .filter((item) => item.length > 2);
  }
  return [];
}

function missingTokens(original: string, proposed: string, field: string): string[] {
  return criticalTokensFor(field, original).filter((token) => !proposed.toLowerCase().includes(token.toLowerCase()));
}

export function validateCopyRewrite(input: {
  field: string;
  factId: string;
  original: string;
  proposed: string;
  section: string;
}): CopyRewriteProposal {
  const original = input.original.replace(/\s+/g, " ").trim();
  const proposed = input.proposed.replace(/\s+/g, " ").trim();
  const reasons: string[] = [];
  let status: RewriteStatus = "SAFE_REWRITE";
  const id = `${input.field}:${input.factId}`;

  if (!proposed) {
    return { id, field: input.field, factId: input.factId, original, proposed, section: input.section, status: "REJECTED", reasons: ["Empty rewrite is rejected."] };
  }
  if (proposed === original) {
    return { id, field: input.field, factId: input.factId, original, proposed, section: input.section, status: "SAFE_REWRITE", reasons: ["Unchanged text is safe."] };
  }

  const originalNumbers = extractComparableNumbers(original);
  const proposedNumbers = extractComparableNumbers(proposed);
  if (originalNumbers.join(",") !== proposedNumbers.join(",")) {
    status = "MEANING_CHANGED";
    reasons.push("Numbers or quantities changed.");
  }

  const missing = missingTokens(original, proposed, input.field);
  if (missing.length) {
    status = "MEANING_CHANGED";
    reasons.push(`Critical terms missing: ${missing.join(", ")}.`);
  }

  const forbidden = proposed.match(FORBIDDEN_NEW);
  if (forbidden && !FORBIDDEN_NEW.test(original)) {
    status = "UNSUPPORTED_CLAIM";
    reasons.push(`New unsupported claim: ${forbidden[0]}.`);
  }

  if (input.field === "guarantee" && !/seller|stated/i.test(proposed) && /seller|stated/i.test(original + " seller")) {
    if (!/seller/i.test(proposed)) {
      reasons.push("Guarantee must stay attributed to the seller.");
      if (status === "SAFE_REWRITE") status = "NEEDS_REVIEW";
    }
  }

  if (input.field === "howItWorks" && /\b(mechanism|works by|causes|lowers)\b/i.test(proposed) && !/\b(mechanism|works by|causes|lowers)\b/i.test(original)) {
    status = "UNSUPPORTED_CLAIM";
    reasons.push("Usage copy cannot be turned into a mechanism of action.");
  }

  if (status === "SAFE_REWRITE") reasons.push("Deterministic checks preserved numbers, conditions, and critical terms.");
  return { id, field: input.field, factId: input.factId, original, proposed, section: input.section, status, reasons };
}

export function onlySafeRewrites(proposals: CopyRewriteProposal[]): CopyRewriteProposal[] {
  return proposals.filter((item) => item.status === "SAFE_REWRITE");
}
