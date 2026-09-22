const FORBIDDEN_METRIC =
  /\b(search volume|conversion rate|roas|ad spend|revenue|cpa|ctr|impressions|clicks per|sales volume|units sold|best[- ]seller rank)\b/i;
const FORBIDDEN_QUANT =
  /\b\d[\d,]*(?:\.\d+)?\s?%\s+(?:of )?(?:people|customers|buyers|users|reviews)\b|\b(?:millions?|billions?) of (?:customers|users|sold)\b/i;

export function looksLikeFabricatedMarketMetric(text: string): boolean {
  return FORBIDDEN_METRIC.test(text) || FORBIDDEN_QUANT.test(text);
}

export function stripFabricatedMarketClaims(text: string): { text: string; discarded: boolean } {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return { text: "", discarded: false };
  if (looksLikeFabricatedMarketMetric(trimmed)) return { text: "", discarded: true };
  return { text: trimmed, discarded: false };
}

export function sanitizeEvidenceList(items: string[]): { kept: string[]; discarded: string[] } {
  const kept: string[] = [];
  const discarded: string[] = [];
  for (const item of items) {
    const result = stripFabricatedMarketClaims(item);
    if (result.discarded) discarded.push(item.trim());
    else if (result.text) kept.push(result.text);
  }
  return { kept, discarded };
}
