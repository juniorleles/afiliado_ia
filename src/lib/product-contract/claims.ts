import { isConsumerHealthClaim } from "@/lib/landing-composer/present";
import { lintSourceStatement } from "@/lib/policy-linter";
import { hasContactDetail, hasEncodingCorruption } from "@/lib/product-facts";

/**
 * Statement gate for the universal contract.
 *
 * It composes the rules that already exist (health claims, the policy linter's statement scan) and
 * adds generic unverifiable-claim patterns that do not depend on a product or a category:
 * superlatives, unattributed authority, promised results and absolute promises.
 * It only ever removes statements. It never rewrites one and never adds one.
 */

export type ClaimCategory =
  | "HEALTH_CLAIM"
  | "POLICY_RULE"
  | "SUPERLATIVE"
  | "UNATTRIBUTED_AUTHORITY"
  | "RESULT_PROMISE"
  | "ABSOLUTE_PROMISE"
  | "CONTACT_DETAIL"
  | "ENCODING_CORRUPTION";

export type ClaimFinding = { category: ClaimCategory; rule: string };

/** Promotional statements (features, benefits, descriptions, answers) get the full scan. */
export type StatementKind = "PROMOTIONAL" | "OPERATIONAL";

const SUPERLATIVE =
  /\b(?:the\s+best|best[- ](?:in|of|ever|on)\b|#\s?1\b|no\.?\s?1\b|number[- ]one|world'?s\s+(?:best|first|leading|most|finest)|top[- ]rated|finest|ultimate|unbeatable|unmatched|unrivall?ed|incomparable|greatest)\b/i;

const UNATTRIBUTED_AUTHORITY =
  /\b(?:(?:doctors?|physicians?|dermatologists?|scientists?|experts?|specialists?|dentists?|nutritionists?|veterinarians?|vets?)\s+(?:recommend|approve|endorse|trust|love|swear|agree|say)\w*|(?:recommended|approved|endorsed|trusted)\s+by\s+(?:doctors?|physicians?|dermatologists?|experts?|scientists?|professionals?)|clinically\s+(?:proven|tested|shown|studied)|scientifically\s+(?:proven|tested)|proven\s+to\b|dermatologist[- ](?:tested|approved))/i;

const PROMISSORY_VERB = /\b(?:erases?|eliminates?|eradicates?|reverses?|cures?|melts?|banishes?|obliterates?|destroys?)\b/i;
const PERSONAL_EFFECT = /\b(?:wrinkles?|fatigue|pain|acne|cellulite|fat|scars?|aging|ageing|stress|anxiety|insomnia|dandruff|hair\s+loss|stains?|odou?r)\b/i;
const RESULT_TIMEFRAME =
  /\b(?:in|within|after)\s+(?:just\s+|only\s+)?(?:\d+|one|two|three|four|five|six|seven|ten|a\s+few)\s*(?:-|\s)?(?:minutes?|hours?|days?|weeks?)\b[^.]{0,60}\b(?:results?|visible|see|notice|lose|gone|reduce|improve|erase|clear)/i;

const ABSOLUTE_PROMISE =
  /\b(?:100\s?%\s*(?:guaranteed|effective|safe)|guaranteed\s+results?|works?\s+(?:every\s+time|for\s+everyone)|no\s+side\s+effects?|risk[- ]free|miracle|instant(?:ly)?\s+(?:results?|relief)|never\s+(?:need|needs|require|requires|fail|fails|break|breaks|wear|wears|run|runs|get|gets|lose|loses|stop|stops)\b|lasts?\s+forever|unbreakable|indestructible|foolproof)\b/i;

/**
 * Linter rules that review a stated refund or warranty window. They exist to catch an invented window
 * in generated copy. A window the source itself stated is evidence, and the contract restates it
 * verbatim, so these rules do not apply to guarantee and returns statements.
 */
export const RESTATEMENT_EXEMPT_RULES: readonly string[] = ["health.refund_duration"];

function lintCategory(text: string, exempt: readonly string[]): ClaimFinding[] {
  return lintSourceStatement(text)
    .filter((finding) => !exempt.includes(finding.ruleId))
    .map((finding) => ({ category: "POLICY_RULE" as const, rule: finding.ruleId }));
}

export function statementFindings(text: string, kind: StatementKind = "PROMOTIONAL", exempt: readonly string[] = []): ClaimFinding[] {
  const value = text.trim();
  const findings: ClaimFinding[] = [];
  if (!value) return findings;
  if (hasEncodingCorruption(value)) findings.push({ category: "ENCODING_CORRUPTION", rule: "encoding" });
  if (hasContactDetail(value)) findings.push({ category: "CONTACT_DETAIL", rule: "contact" });
  if (isConsumerHealthClaim(value)) findings.push({ category: "HEALTH_CLAIM", rule: "consumer-health-claim" });
  findings.push(...lintCategory(value, exempt));
  if (kind === "PROMOTIONAL") {
    if (SUPERLATIVE.test(value)) findings.push({ category: "SUPERLATIVE", rule: "superlative" });
    if (UNATTRIBUTED_AUTHORITY.test(value)) findings.push({ category: "UNATTRIBUTED_AUTHORITY", rule: "unattributed-authority" });
    if ((PROMISSORY_VERB.test(value) && PERSONAL_EFFECT.test(value)) || RESULT_TIMEFRAME.test(value)) {
      findings.push({ category: "RESULT_PROMISE", rule: "result-promise" });
    }
    if (ABSOLUTE_PROMISE.test(value)) findings.push({ category: "ABSOLUTE_PROMISE", rule: "absolute-promise" });
  }
  return findings;
}

/** True when the statement may be restated. Contact details and corruption are never copy. */
export function statementAllowed(text: string, kind: StatementKind = "PROMOTIONAL", exempt: readonly string[] = []): boolean {
  return statementFindings(text, kind, exempt).length === 0;
}

/** A guarantee is restated only when it states terms: a duration, or a refund, return or replacement. */
export function guaranteeStatesTerms(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  if (/\b\d+\s*[- ]?\s*(?:day|week|month|year)s?\b/i.test(value)) return true;
  return /\b(?:money[- ]back|refund(?:s|ed|able)?|returns?|replace(?:ment|d|s)?|exchange)\b/i.test(value);
}

/** Distinct durations in one guarantee text ("30-day ... 60-day"). Two means the source disagrees with itself. */
export function guaranteeDurations(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\b(\d+)\s*[- ]?\s*(day|week|month|year)s?\b/gi)) {
    found.add(`${Number(match[1])} ${match[2].toLowerCase()}`);
  }
  return [...found];
}
