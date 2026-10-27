import { classifyEditorialText, hasOperationalPayload } from "@/lib/editorial-neutrality/classify";
import { recoverOperationalSegments } from "@/lib/editorial-neutrality/segment";
import type { NeutralityDecision, NeutralityRole } from "@/lib/editorial-neutrality/types";

const STRIP: Array<{ pattern: RegExp; replacement: string; rule: string }> = [
  { pattern: /\bexplore the benefits of (?:this |our )?/gi, replacement: "", rule: "strip-unsupported-benefit" },
  { pattern: /\b(?:our |this )?(?:amazing|incredible|awesome|revolutionary) product\b/gi, replacement: "the product", rule: "strip-promo-amplifier" },
  { pattern: /\baccording to most of (?:our )?customers,?\s*/gi, replacement: "", rule: "strip-customer-generalization" },
  { pattern: /\bmost of our customers,?\s*/gi, replacement: "", rule: "strip-customer-generalization" },
  { pattern: /\bnothing at all!\s*/gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\bas a sign of appreciation(?: and trust)?\b/gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\byou will be happy with your (?:order|purchase|investment)\b/gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\bon our side,?\s*/gi, replacement: "", rule: "strip-implied-free-shipping" },
  { pattern: /\byou can rest assured,?\s*/gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\brest assured,?\s*/gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\bbe patient,?\s*/gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\bin no time\b/gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\beasily /gi, replacement: "", rule: "strip-commercial-pressure" },
  { pattern: /\bwe stand right by our customers every step of the way\.?\s*/gi, replacement: "", rule: "strip-promo-support" },
  { pattern: /\bwherever you want\.?\s*/gi, replacement: "", rule: "strip-unqualified-reach" },
  { pattern: /\banywhere you have a physical address\.?\s*/gi, replacement: "", rule: "strip-unqualified-reach" },
  { pattern: /\s+and trust\b/gi, replacement: "", rule: "strip-dangling-promo" },
  { pattern: /\s+to the product\.?$/i, replacement: ".", rule: "strip-dangling-product" },
];

const BROKEN_REMAINDER = /\b(you can the|you can we|the the|,\s*,)\b/i;

const BLOCK_OMIT =
  /\b(clinically proven|cures?|treats?|heals?|prevents?|toxin cleanse|clears your entire body|fda[- ]approved)\b/i;

function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[,\s.;:-]+/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/!\s*$/g, ".")
    .trim();
}

export function neutralizeEditorialText(input: {
  text: string;
  role?: NeutralityRole;
}): NeutralityDecision {
  const original = input.text.replace(/\s+/g, " ").trim();
  const role = input.role ?? "OTHER";
  const first = classifyEditorialText({ text: original, role });
  if (
    first.classification === "NEUTRAL_INFORMATION" ||
    first.classification === "SELLER_STATED_FACT"
  ) {
    const recovered = recoverOperationalSegments({ text: original, role });
    if (recovered.omitted.length && recovered.recoveredText) {
      return {
        originalText: original,
        renderedText: recovered.recoveredText,
        classification: first.classification,
        action: "NEUTRALIZE",
        reasons: [...first.reasons, "promotional or unsafe clauses were omitted; operational remainder kept"],
        rule: "segment-operational-remainder",
        remainderSupported: true,
      };
    }
    if (recovered.omitted.length && !recovered.recoveredText) {
      return {
        originalText: original,
        renderedText: null,
        classification: first.classification,
        action: "OMIT",
        reasons: [...first.reasons, "no operational remainder survived segmentation"],
        rule: "segment-empty-remainder",
        remainderSupported: false,
      };
    }
    return {
      originalText: original,
      renderedText: original,
      classification: first.classification,
      action: "KEEP",
      reasons: first.reasons,
      rule: "keep-neutral-or-seller-stated",
      remainderSupported: true,
    };
  }
  if (BLOCK_OMIT.test(original) || first.classification === "MEDICAL_OR_HEALTH_CLAIM") {
    return {
      originalText: original,
      renderedText: null,
      classification: first.classification,
      action: "OMIT",
      reasons: [...first.reasons, "medical or prohibited language is not neutralized into a fact"],
      rule: "omit-health-or-prohibited",
      remainderSupported: false,
    };
  }

  let next = original;
  const rules: string[] = [];
  for (const row of STRIP) {
    if (row.pattern.test(next)) {
      next = next.replace(row.pattern, row.replacement);
      rules.push(row.rule);
    }
  }
  next = tidy(next);
  if (!next || next.length < 12 || next.toLowerCase() === original.toLowerCase() || BROKEN_REMAINDER.test(next)) {
    return {
      originalText: original,
      renderedText: null,
      classification: first.classification,
      action: "OMIT",
      reasons: [...first.reasons, "no safe informational remainder could be separated"],
      rule: rules[0] ?? "omit-inseparable",
      remainderSupported: false,
    };
  }

  const second = classifyEditorialText({ text: next, role });
  const keepable =
    (second.classification === "NEUTRAL_INFORMATION" || second.classification === "SELLER_STATED_FACT") &&
    (role !== "OPERATIONAL" && role !== "FAQ" && role !== "GUARANTEE" ? true : hasOperationalPayload(next) || role === "GUARANTEE");
  if (!keepable) {
    return {
      originalText: original,
      renderedText: null,
      classification: first.classification,
      action: "OMIT",
      reasons: [...first.reasons, ...second.reasons, "the remainder is still not editorial-safe"],
      rule: rules.join("+") || "omit-unsafe-remainder",
      remainderSupported: false,
    };
  }
  return {
    originalText: original,
    renderedText: next,
    classification: first.classification,
    action: "NEUTRALIZE",
    reasons: [...first.reasons, `remainder kept as ${second.classification}`],
    rule: rules.join("+"),
    remainderSupported: true,
  };
}
