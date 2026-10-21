/**
 * Structured specification lines ("Name: value unit").
 *
 * Pure and dependency-free so the fact model, the operator form and the contract can all use it.
 * It only splits what the author wrote together. It never infers a name or a value, and it
 * rejects anything that is not a short label followed by a short value.
 */

export type ParsedSpecification = { name: string; value: string; unit?: string };

const MAX_NAME_LENGTH = 60;
const MAX_NAME_WORDS = 6;
const MAX_VALUE_LENGTH = 120;

/** Units that may close a value. A closed vocabulary of measurement symbols, not product words. */
const UNIT_TOKEN =
  /^(?:mm|cm|m|km|in|inch(?:es)?|ft|g|kg|mg|mcg|oz|lb|lbs|ml|l|fl\.? ?oz|mah|wh|v|mv|w|kw|a|ma|hz|khz|mhz|ghz|gb|mb|kb|tb|db|dbi|rpm|lm|lux|k|°c|°f|%|hours?|hrs?|h|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|pcs?|pieces?|pairs?)$/i;

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Splits a closing unit from a numeric value: "710 ml" -> value 710, unit ml. Other values stay whole. */
export function splitValueAndUnit(raw: string): { value: string; unit?: string } {
  const text = clean(raw);
  const match = text.match(/^(-?\d+(?:[.,]\d+)?(?:\s?[x×]\s?-?\d+(?:[.,]\d+)?)*)\s*([^\d\s][^\s]*(?:\s[^\s]+)?)$/);
  if (!match) return { value: text };
  const unit = clean(match[2]);
  return UNIT_TOKEN.test(unit) ? { value: clean(match[1]), unit } : { value: text };
}

/**
 * One line to one specification, or null. The label must be a short phrase without sentence
 * punctuation and the value must be short. A line with several colons splits at the first one.
 */
export function parseSpecificationLine(line: string): ParsedSpecification | null {
  const text = clean(line.replace(/^[•\-*]\s*/, ""));
  // A link is never a specification, and its own colon must not be read as the name/value separator.
  if (/https?:\/\/|\bwww\./i.test(text)) return null;
  const cut = text.indexOf(":");
  if (cut <= 0) return null;
  const name = clean(text.slice(0, cut));
  const rest = clean(text.slice(cut + 1));
  if (!name || !rest) return null;
  if (name.length > MAX_NAME_LENGTH || name.split(" ").length > MAX_NAME_WORDS) return null;
  if (/[.!?;]/.test(name) || /https?:\/\//i.test(name)) return null;
  if (rest.length > MAX_VALUE_LENGTH || /https?:\/\//i.test(rest)) return null;
  const { value, unit } = splitValueAndUnit(rest);
  return unit ? { name, value, unit } : { name, value };
}

export function parseSpecificationText(text: string | undefined): { items: ParsedSpecification[]; ignored: string[] } {
  const items: ParsedSpecification[] = [];
  const ignored: string[] = [];
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parsed = parseSpecificationLine(line);
    if (parsed) items.push(parsed);
    else ignored.push(line);
  }
  return { items, ignored };
}
