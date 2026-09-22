import { namesSimilar, normalizeName } from "@/lib/import-heuristics";
import type { SourceStatus } from "@/lib/source-resolution/types";

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "official",
  "site",
  "buy",
  "best",
  "review",
  "formula",
  "advanced",
  "new",
  "plus",
  "page",
  "home",
  "store",
]);

export function significantNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP.has(token));
}

export function tokenCoverage(productName: string, haystack: string): number {
  const tokens = significantNameTokens(productName);
  if (tokens.length === 0) return 0;
  const hay = haystack.toLowerCase();
  const hit = tokens.filter((token) => hay.includes(token)).length;
  return hit / tokens.length;
}

export function verifyProductIdentity(input: {
  productName: string;
  pageTitle?: string;
  extractedName?: string | null;
  pageText: string;
  manufacturer?: string;
  ingredients?: string[];
}): { status: SourceStatus; reasons: string[] } {
  const reasons: string[] = [];
  const productName = input.productName.trim();
  if (!productName) {
    return { status: "IDENTITY_UNCERTAIN", reasons: ["no product name to verify"] };
  }
  const title = input.pageTitle || "";
  const extracted = input.extractedName || "";
  const head = `${title}\n${extracted}\n${input.pageText.slice(0, 1200)}`;
  const coverage = tokenCoverage(productName, head);
  const exact =
    namesSimilar(title, productName) ||
    namesSimilar(extracted, productName) ||
    normalizeName(title).includes(normalizeName(productName));

  if (exact) reasons.push("product name match");
  if (coverage >= 1) reasons.push("all distinctive name tokens present");
  else if (coverage >= 0.66) reasons.push(`partial name token coverage ${coverage.toFixed(2)}`);

  if (input.manufacturer && input.pageText.toLowerCase().includes(input.manufacturer.toLowerCase())) {
    reasons.push("manufacturer/brand mentioned");
  }
  if ((input.ingredients || []).some((item) => item.length >= 4 && input.pageText.toLowerCase().includes(item.toLowerCase()))) {
    reasons.push("distinctive ingredient/formula overlap");
  }

  if (exact || coverage >= 1) {
    return { status: "ACCEPTED", reasons: reasons.length ? reasons : ["product identity confirmed"] };
  }
  if (coverage >= 0.5) {
    return { status: "IDENTITY_UNCERTAIN", reasons: reasons.length ? reasons : ["incomplete identity evidence"] };
  }
  return {
    status: "REJECTED",
    reasons: [`page does not refer to ${productName}`],
  };
}
