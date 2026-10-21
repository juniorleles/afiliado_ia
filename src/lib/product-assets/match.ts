import type { EvaluationContext, MatchStatus, ProductAssetCandidate } from "@/lib/product-assets/types";

/**
 * Does this image belong to this product? Generic, name-based, no product-specific rules.
 * Hosting the file on the product's own domain is weak evidence (PLAUSIBLE). Naming the
 * product in the file name, path, alt text, or the source's own product label is strong (CONFIRMED).
 */

const GENERIC_WORDS = new Set([
  "the", "and", "for", "with", "capsule", "capsules", "supplement", "supplements", "formula", "pills", "pill", "drops", "drop",
  "oil", "powder", "tonic", "advanced", "natural", "official", "original", "pro", "plus", "support", "complex", "health", "product",
]);

function compact(value: string): string {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    decoded = value;
  }
  return decoded.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Distinctive tokens of a product name, compacted. Falls back to the whole name. */
export function distinctiveTokens(name: string): string[] {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !GENERIC_WORDS.has(word));
  if (words.length > 0) return words;
  const whole = compact(name);
  return whole.length >= 4 ? [whole] : [];
}

function strongHaystack(candidate: ProductAssetCandidate): string {
  let path = candidate.url;
  try {
    path = new URL(candidate.url).pathname;
  } catch {
    path = candidate.url;
  }
  return compact(`${candidate.fileName} ${path} ${candidate.alt ?? ""}`);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function hostMatches(host: string, allowed: readonly string[]): boolean {
  const clean = host.toLowerCase();
  return allowed.some((entry) => {
    const rule = entry.toLowerCase().replace(/^www\./, "");
    return clean === rule || clean === `www.${rule}` || clean.endsWith(`.${rule}`);
  });
}

export function matchProduct(candidate: ProductAssetCandidate, context: EvaluationContext): { status: MatchStatus; reasons: string[] } {
  const tokens = distinctiveTokens(context.productName).map(compact);
  const reasons: string[] = [];
  if (tokens.length === 0) {
    return { status: "UNCONFIRMED", reasons: ["The product name has no distinctive word to compare against."] };
  }
  const hasOwn = (text: string) => tokens.every((token) => text.includes(token));
  const strong = strongHaystack(candidate);
  const ownStrong = hasOwn(strong);

  const declared = candidate.declaredProduct ? compact(candidate.declaredProduct) : null;
  if (declared && !hasOwn(declared)) {
    return { status: "CONTRADICTED", reasons: [`The source labels this image as "${candidate.declaredProduct}", which is not ${context.productName}.`] };
  }

  const others = (context.otherProducts ?? [])
    .filter((name) => compact(name) !== compact(context.productName))
    .map((name) => ({ name, tokens: distinctiveTokens(name).map(compact) }))
    .filter((entry) => entry.tokens.length > 0 && !entry.tokens.every((token) => tokens.includes(token)));
  const named = others.find((entry) => entry.tokens.every((token) => strong.includes(token)));
  if (named && !ownStrong) {
    return { status: "CONTRADICTED", reasons: [`The file names "${named.name}", another product, and not ${context.productName}.`] };
  }
  if (named && ownStrong) {
    return { status: "UNCONFIRMED", reasons: [`The file names both ${context.productName} and "${named.name}". A person must say which one it shows.`] };
  }

  if (ownStrong) {
    reasons.push(candidate.declaredProduct ? "The source labels the image with this product's name." : "The product name appears in the file name, path, or alt text.");
    return { status: "CONFIRMED", reasons };
  }
  if (declared && hasOwn(declared)) {
    return { status: "CONFIRMED", reasons: ["The source that offers the file labels it with this product's name."] };
  }
  const host = hostOf(candidate.url);
  if (hostMatches(host, [...context.officialHosts, ...(context.declaredAssetHosts ?? [])])) {
    return { status: "PLAUSIBLE", reasons: ["Hosted on a domain of the product, but nothing in the file name or alt text names the product."] };
  }
  return { status: "UNCONFIRMED", reasons: ["Nothing ties this file to the product by name or by an official host."] };
}
