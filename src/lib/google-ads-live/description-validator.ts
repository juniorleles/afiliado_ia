/**
 * Host record domain: description validator.
 *
 * Checks copied description text, length, pin positions, and repeats. It
 * does not rewrite a draft and does not send a request.
 */
import { DESCRIPTION_PINS, RSA_ASSET_KEYS, type PublishIssue } from "./publisher-context";

export const DESCRIPTION_MIN_COUNT = 2;
export const DESCRIPTION_MAX_COUNT = 4;
export const DESCRIPTION_MAX_LENGTH = 90;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function textLength(value: string): number {
  return [...value].length;
}

export function validateDescriptions(descriptions: unknown): PublishIssue[] {
  if (!Array.isArray(descriptions)) return [{ field: "rsaDraft.descriptions", message: "Invalid RSA Draft: descriptions are required." }];
  const issues: PublishIssue[] = [];
  if (descriptions.length < DESCRIPTION_MIN_COUNT || descriptions.length > DESCRIPTION_MAX_COUNT) {
    issues.push({ field: "rsaDraft.descriptions", message: "Policy Violations: a responsive search ad requires 2 to 4 descriptions." });
  }
  const seen = new Set<string>();
  const pins = new Set<string>();
  descriptions.forEach((description, index) => {
    const field = `rsaDraft.descriptions.${index}`;
    if (!isPlainRecord(description)) {
      issues.push({ field, message: "Invalid RSA Draft: a description record is required." });
      return;
    }
    for (const key of Object.keys(description)) {
      if (!(RSA_ASSET_KEYS as readonly string[]).includes(key)) issues.push({ field: `${field}.${key}`, message: "Invalid RSA Draft: the description has an unknown member." });
    }
    if (typeof description.text !== "string") {
      issues.push({ field: `${field}.text`, message: "Invalid RSA Draft: description text is required." });
      return;
    }
    const text = description.text.trim();
    if (text === "" || textLength(text) > DESCRIPTION_MAX_LENGTH || /[\r\n]/.test(text)) {
      issues.push({ field: `${field}.text`, message: "Policy Violations: a description must be 1 to 90 characters." });
    } else if (seen.has(text)) {
      issues.push({ field: `${field}.text`, message: "Duplicate Assets: a description is repeated." });
    } else {
      seen.add(text);
    }
    if (description.pinnedField === null) return;
    if (typeof description.pinnedField !== "string" || !(DESCRIPTION_PINS as readonly string[]).includes(description.pinnedField)) {
      issues.push({ field: `${field}.pinnedField`, message: "Policy Violations: a description pin is not a supported position." });
      return;
    }
    if (pins.has(description.pinnedField)) issues.push({ field: `${field}.pinnedField`, message: "Duplicate Assets: a description pin is repeated." });
    else pins.add(description.pinnedField);
  });
  return issues;
}
