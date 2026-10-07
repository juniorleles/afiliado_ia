/**
 * Host record domain: headline validator.
 *
 * Checks copied headline text, length, pin positions, and repeats. It does
 * not rewrite a draft and does not send a request.
 */
import { HEADLINE_PINS, RSA_ASSET_KEYS, type PublishIssue } from "./publisher-context";

export const HEADLINE_MIN_COUNT = 3;
export const HEADLINE_MAX_COUNT = 15;
export const HEADLINE_MAX_LENGTH = 30;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function textLength(value: string): number {
  return [...value].length;
}

export function validateHeadlines(headlines: unknown): PublishIssue[] {
  if (!Array.isArray(headlines)) return [{ field: "rsaDraft.headlines", message: "Invalid RSA Draft: headlines are required." }];
  const issues: PublishIssue[] = [];
  if (headlines.length < HEADLINE_MIN_COUNT || headlines.length > HEADLINE_MAX_COUNT) {
    issues.push({ field: "rsaDraft.headlines", message: "Policy Violations: a responsive search ad requires 3 to 15 headlines." });
  }
  const seen = new Set<string>();
  const pins = new Set<string>();
  headlines.forEach((headline, index) => {
    const field = `rsaDraft.headlines.${index}`;
    if (!isPlainRecord(headline)) {
      issues.push({ field, message: "Invalid RSA Draft: a headline record is required." });
      return;
    }
    for (const key of Object.keys(headline)) {
      if (!(RSA_ASSET_KEYS as readonly string[]).includes(key)) issues.push({ field: `${field}.${key}`, message: "Invalid RSA Draft: the headline has an unknown member." });
    }
    if (typeof headline.text !== "string") {
      issues.push({ field: `${field}.text`, message: "Invalid RSA Draft: headline text is required." });
      return;
    }
    const text = headline.text.trim();
    if (text === "" || textLength(text) > HEADLINE_MAX_LENGTH || /[\r\n]/.test(text)) {
      issues.push({ field: `${field}.text`, message: "Policy Violations: a headline must be 1 to 30 characters." });
    } else if (seen.has(text)) {
      issues.push({ field: `${field}.text`, message: "Duplicate Assets: a headline is repeated." });
    } else {
      seen.add(text);
    }
    if (headline.pinnedField === null) return;
    if (typeof headline.pinnedField !== "string" || !(HEADLINE_PINS as readonly string[]).includes(headline.pinnedField)) {
      issues.push({ field: `${field}.pinnedField`, message: "Policy Violations: a headline pin is not a supported position." });
      return;
    }
    if (pins.has(headline.pinnedField)) issues.push({ field: `${field}.pinnedField`, message: "Duplicate Assets: a headline pin is repeated." });
    else pins.add(headline.pinnedField);
  });
  return issues;
}
