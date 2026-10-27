import { isHealthEfficacyStatement } from "@/lib/ingredient-context";
import { isPromotionalOrCta } from "@/lib/import-heuristics";
import { operationalExclusionReason } from "@/lib/operational-evidence";
import { statementFindings } from "@/lib/product-contract/claims";
import type { NeutralityClass, NeutralityRole } from "@/lib/editorial-neutrality/types";

const PROMO_AMPLIFIER =
  /\b(amazing|incredible|awesome|revolutionary|miracle|life[- ]changing|powerful deep|unbeatable|must[- ]have)\b/i;
const CUSTOMER_GENERALIZATION =
  /\b(according to most of (?:our )?customers|most of our customers|thousands of customers|customers (?:say|report|agree)|real users|everyone loves)\b/i;
const COMMERCIAL_PRESSURE =
  /\b(rest assured|nothing at all|on our side|sign of appreciation|you will be happy|easily ask|act now|don't miss|stand right by our customers|every step of the way|be patient|in no time)\b/i;
const UNSUPPORTED_BENEFIT =
  /\b(explore the benefits|enjoy the results|see the results|transform your|clears your entire body|toxin cleanse)\b/i;
const UNQUALIFIED_REACH = /\b(wherever you want|anywhere you (have|want|like)|worldwide availability)\b/i;
const MEDICAL_MARK =
  /\b(clinically proven|scientifically proven|cures?|treats?|heals?|prevents?|diagnos|toxin cleanse|clears your entire body|fda[- ]approved)\b/i;
const TECHNICAL_SPEC =
  /\b(\d+\s?(mah|hz|gb|tb|mp|mm|cm|inch|in\.|hours?|minutes?|pages?|oz|ml|mg|mcg|iu|watts?|volts?)|battery life|resolution|file format|pdf|usb-c|ip\d{2})\b/i;
const OPERATIONAL_PAYLOAD =
  /\b((?:\d+|one|two|three|four|five|six|seven|ten)\s*-?\s*(?:to\s*)?(?:\d+\s*)?(?:business |working )?days?|\$\s*\d|free|refund|money[- ]back|return shipping|packing slip|tracking|customs|united states|canada|australia|ireland)\b/i;
const USAGE_PAYLOAD =
  /\b(take|droppers?|capsules?|tablets?|softgels?|teaspoons?|tablespoons?|dissolve|swallow|chew|under (?:the |your )?tongue|before (?:breakfast|meals?|bed)|once (?:a |per )?day|twice (?:a |per )?day|daily|directions? for use)\b/i;

export function classifyEditorialText(input: {
  text: string;
  role?: NeutralityRole;
}): { classification: NeutralityClass; reasons: string[] } {
  const text = input.text.replace(/\s+/g, " ").trim();
  const role = input.role ?? "OTHER";
  const reasons: string[] = [];
  if (!text) return { classification: "AMBIGUOUS_CLAIM", reasons: ["empty text"] };

  const findings = statementFindings(text, role === "OPERATIONAL" || role === "GUARANTEE" || role === "CAUTION" ? "OPERATIONAL" : "PROMOTIONAL");
  if (MEDICAL_MARK.test(text) || findings.some((item) => item.category === "HEALTH_CLAIM") || isHealthEfficacyStatement(text)) {
    return { classification: "MEDICAL_OR_HEALTH_CLAIM", reasons: ["health or efficacy language is not restated as a fact"] };
  }
  if (CUSTOMER_GENERALIZATION.test(text) || UNQUALIFIED_REACH.test(text) || operationalExclusionReason(text) === "HEARSAY_ESTIMATE") {
    reasons.push("a customer generalization is not independent confirmation");
    return { classification: "UNSUPPORTED_GENERALIZATION", reasons };
  }
  if (UNSUPPORTED_BENEFIT.test(text)) {
    return { classification: "UNSUPPORTED_BENEFIT", reasons: ["a benefit or result is not a restatable operational fact"] };
  }
  if (COMMERCIAL_PRESSURE.test(text) || operationalExclusionReason(text) === "IMPLIED_FREE_SHIPPING") {
    return { classification: "COMMERCIAL_PRESSURE", reasons: ["thanks, urgency, or implied free shipping is promotional"] };
  }
  if (PROMO_AMPLIFIER.test(text) || (isPromotionalOrCta(text) && role !== "GUARANTEE")) {
    return { classification: "PROMOTIONAL_LANGUAGE", reasons: ["promotional amplifier or CTA language"] };
  }
  if (findings.some((item) => item.category === "SUPERLATIVE" || item.category === "ABSOLUTE_PROMISE" || item.category === "RESULT_PROMISE")) {
    return { classification: "PROMOTIONAL_LANGUAGE", reasons: findings.map((item) => item.rule) };
  }
  if (role === "USAGE" && USAGE_PAYLOAD.test(text) && !MEDICAL_MARK.test(text)) {
    return { classification: "SELLER_STATED_FACT", reasons: ["seller-stated directions with a usable dose or method"] };
  }
  if (role === "FEATURE" || role === "SPECIFICATION" || role === "USAGE") {
    if (TECHNICAL_SPEC.test(text) || text.split(/\s+/).length <= 6) {
      return { classification: role === "FEATURE" ? "SELLER_STATED_FACT" : "NEUTRAL_INFORMATION", reasons: ["short characteristic or specification"] };
    }
  }
  if ((role === "OPERATIONAL" || role === "GUARANTEE" || role === "FAQ") && OPERATIONAL_PAYLOAD.test(text)) {
    return { classification: "SELLER_STATED_FACT", reasons: ["operational term with a duration, cost, region, or procedure"] };
  }
  if (role === "CAUTION") {
    return { classification: "SELLER_STATED_FACT", reasons: ["caution is kept with source attribution"] };
  }
  if (role === "OVERVIEW" && /\b(is a|is an|supplied as|formulated as)\b/i.test(text) && !PROMO_AMPLIFIER.test(text)) {
    return { classification: "NEUTRAL_INFORMATION", reasons: ["identity or format statement"] };
  }
  if (text.length > 140 && !OPERATIONAL_PAYLOAD.test(text) && !TECHNICAL_SPEC.test(text)) {
    return { classification: "AMBIGUOUS_CLAIM", reasons: ["long copy without a separable operational or technical payload"] };
  }
  return { classification: role === "OPERATIONAL" || role === "FAQ" ? "SELLER_STATED_FACT" : "NEUTRAL_INFORMATION", reasons: reasons.length ? reasons : ["no promotional, medical, or generalization pattern matched"] };
}

export function hasOperationalPayload(text: string): boolean {
  return OPERATIONAL_PAYLOAD.test(text);
}
