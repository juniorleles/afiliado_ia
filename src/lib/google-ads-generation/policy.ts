const BANNED = /\b(cures?|cured|curing|miracle|guaranteed results|reverse disease|reverses disease|doctor approved|doctors approved|instant results|instantly|clinically proven|studies show|study shows|buy now|medical breakthrough)\b/i;

export function policyHits(value: string): string[] {
  const found = value.match(BANNED);
  return found ? [found[0].toLowerCase()] : [];
}

export function isAllowedAdText(value: string): boolean {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || !/^[\x00-\x7F]+$/.test(clean)) return false;
  if (/not intended to diagnose/i.test(clean)) return false;
  if (/(?:\bUSD\b|\$\s?\d)/i.test(clean)) return false;
  return policyHits(clean).length === 0;
}

export const POLICY_NEGATIVES = [
  "cure",
  "miracle",
  "guaranteed results",
  "reverse disease",
  "doctor approved",
  "instant results",
  "clinically proven",
] as const;
