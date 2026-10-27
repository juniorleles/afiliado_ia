import type { ProductContract } from "@/lib/product-contract/types";
import { presellCtaAuthorization } from "@/lib/presell-strategy/plan";
import type { PresellMode, SearchIntent } from "@/lib/search-intent/types";

export const INTENT_HEADLINE_SUFFIXES = [
  "Product Overview",
  "Product Overview and Ingredients",
  "Product Overview and Specifications",
  "Product Details",
  "Product Details and Ingredients",
  "Product Details and Specifications",
  "Product Details, Ingredients and Official Offer",
  "Product Details, Specifications and Official Offer",
  "Product Information",
] as const;

const FORBIDDEN_HEADLINE = /\bofficial (?:web)?site\b|\bwe are the (?:official )?manufacturer\b/i;

function compositionLabel(contract: ProductContract): "ingredients" | "specifications" | null {
  if ((contract.components ?? []).length > 0) return "ingredients";
  if ((contract.specifications ?? []).length > 0) return "specifications";
  return null;
}

const GENERIC_KIND = /^(natural )?formula$|^product$|^item$/i;

function displayKind(kind: string | undefined): string | null {
  const value = kind?.replace(/\s+/g, " ").trim();
  if (!value || value.length < 2 || value.length > 40) return null;
  if (GENERIC_KIND.test(value)) return null;
  return value.toLowerCase();
}

export function isIntentHeadlineSuffix(suffix: string): boolean {
  const key = suffix.replace(/\s+/g, " ").trim();
  return (INTENT_HEADLINE_SUFFIXES as readonly string[]).includes(key);
}

function usagePresent(contract: ProductContract): boolean {
  return (contract.usage ?? []).length > 0;
}

function termsPresent(contract: ProductContract): boolean {
  return Boolean(contract.guarantee) || (contract.operational?.returns?.length ?? 0) > 0;
}

/**
 * Closed set of name-led headlines that restate documented facts without concatenating field labels.
 */
export function intentHeadlineCandidates(contract: ProductContract): string[] {
  const name = contract.identity.productName;
  if (!name) return [];
  const kind = displayKind(contract.identity.productKind);
  const composition = compositionLabel(contract);
  const usage = usagePresent(contract);
  const terms = termsPresent(contract);
  const hop = presellCtaAuthorization(contract).status === "AUTHORIZED";
  const out = new Set<string>(INTENT_HEADLINE_SUFFIXES.map((suffix) => `${name}: ${suffix}`));

  if (kind && composition && usage) out.add(`${name}: what this ${kind} lists and how it is used`);
  if (kind && composition) out.add(`${name}: what this ${kind} lists`);
  if (kind && usage) out.add(`${name}: what this ${kind} is and how it is used`);
  if (kind) out.add(`${name}: what this ${kind} is`);
  if (composition && usage) out.add(`${name}: listed ${composition} and how it is used`);
  if (composition) out.add(`${name}: listed ${composition}`);
  out.add(`${name}: what the source states`);
  out.add(`${name}: product information from the listed sources`);

  if (composition && terms) out.add(`${name}: listed ${composition} and seller-stated terms`);
  if (kind && terms) out.add(`${name}: review this ${kind} and seller-stated terms`);
  if (composition) out.add(`${name}: listed ${composition} to review`);
  if (kind) out.add(`${name}: review this ${kind}`);
  out.add(`${name}: review the listed details`);
  if (hop && composition) out.add(`${name}: listed ${composition} and the official offer`);
  if (hop) out.add(`${name}: review the official offer`);

  return [...out];
}

export function isIntentAlignedHeadline(text: string, contract: ProductContract): boolean {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (FORBIDDEN_HEADLINE.test(trimmed)) return false;
  const name = contract.identity.productName;
  if (!name || !trimmed.startsWith(`${name}: `)) return false;
  if (intentHeadlineCandidates(contract).includes(trimmed)) return true;
  const rest = trimmed.slice(name.length + 2);
  return isIntentHeadlineSuffix(rest);
}

/**
 * Builds a name-led headline from available contract facts.
 * It never claims this page is the official manufacturer website.
 */
export function composeIntentHeadline(input: {
  contract: ProductContract;
  intent: SearchIntent;
  mode: PresellMode;
}): string {
  const name = input.contract.identity.productName;
  const composition = compositionLabel(input.contract);
  const kind = displayKind(input.contract.identity.productKind);
  const usage = usagePresent(input.contract);
  const terms = termsPresent(input.contract);
  const hop = presellCtaAuthorization(input.contract).status === "AUTHORIZED";

  if (input.intent === "NAVIGATIONAL") {
    return `${name}: product information from the listed sources`;
  }

  if (input.mode === "PRESELL_EDITORIAL") {
    if (kind && composition && usage) return `${name}: what this ${kind} lists and how it is used`;
    if (kind && composition) return `${name}: what this ${kind} lists`;
    if (kind && usage) return `${name}: what this ${kind} is and how it is used`;
    if (composition && usage) return `${name}: listed ${composition} and how it is used`;
    if (kind) return `${name}: what this ${kind} is`;
    if (composition) return `${name}: listed ${composition}`;
    return `${name}: what the source states`;
  }

  if (hop && composition) return `${name}: listed ${composition} and the official offer`;
  if (composition && terms) return `${name}: listed ${composition} and seller-stated terms`;
  if (kind && terms) return `${name}: review this ${kind} and seller-stated terms`;
  if (composition) return `${name}: listed ${composition} to review`;
  if (kind) return `${name}: review this ${kind}`;
  return `${name}: review the listed details`;
}
