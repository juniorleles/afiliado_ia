import { cleanHtmlText } from "@/lib/source-html";
import type { PriceRecord, PriceStatus, PriceVerification, SourceClass } from "@/lib/research-coverage/types";

const PRICE = /([$€£])\s*(\d+(?:[.,]\d{2})?)/g;
const DISCOUNT = /\b\d+\s*%\s*off\b|\bsave\s*\$|\bbest value\b/i;

function currencyOf(symbol: string): string | null {
  if (symbol === "$") return "USD";
  if (symbol === "€") return "EUR";
  if (symbol === "£") return "GBP";
  return null;
}

export function extractPriceCandidates(input: {
  html: string;
  url: string;
  retrievedAt: string | null;
  sourceClass: SourceClass;
}): PriceRecord[] {
  const text = cleanHtmlText(input.html).slice(0, 20_000);
  const out: PriceRecord[] = [];
  for (const match of text.matchAll(PRICE)) {
    const amount = `${match[1]}${match[2]}`;
    const around = text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + 40);
    const pack = around.match(/\b(\d+\s*(?:bottle|pack|tube|unit|capsule)s?)\b/i)?.[1] ?? null;
    const promotional = DISCOUNT.test(around);
    const displayable = input.sourceClass === "SELLER" || input.sourceClass === "MANUFACTURER_OR_BRAND" || input.sourceClass === "MARKETPLACE";
    out.push({
      amount,
      currency: currencyOf(match[1] ?? ""),
      packageLabel: pack,
      sourceUrl: input.url,
      retrievedAt: input.retrievedAt,
      sourceClass: input.sourceClass,
      status: displayable && !promotional ? "PRICE_RECORDED" : "PRICE_UNVERIFIED",
      restrictions: [
        promotional ? "Promotional discount language is not a confirmed list price." : "",
        !displayable ? "Affiliate or review prices are not treated as current commercial terms." : "",
        "Unit and package prices stay separate.",
      ].filter(Boolean),
    });
    if (out.length >= 6) break;
  }
  return out;
}

export function verifyPrices(records: PriceRecord[]): PriceVerification {
  if (!records.length) {
    return { status: "PRICE_ABSENT", records: [], note: "No price was found. That is an evidence gap, not a technical error." };
  }
  if (records.some((item) => item.status === "PRICE_RECORDED")) {
    return {
      status: "PRICE_RECORDED",
      records,
      note: "A seller, manufacturer, or marketplace price was recorded with its source and date. It is still not a live offer.",
    };
  }
  return {
    status: "PRICE_UNVERIFIED",
    records,
    note: "Price mentions were found but not confirmed on a seller or manufacturer page.",
  };
}

export function priceStatusOf(verification: PriceVerification): PriceStatus {
  return verification.status;
}
