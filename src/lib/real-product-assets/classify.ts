import { distinctiveTokens } from "@/lib/product-assets/match";
import { promoImageLandingBlock } from "@/lib/official-assets/review";
import type { ProbableKind } from "@/lib/real-product-assets/types";

const TRACKING = /facebook\.com\/tr|google-analytics|pixel|spacer\.gif|1x1|tracking|beacon/i;
const ICON = /favicon|apple-touch|icon[-_]?|sprite|emoji/i;
const LOGO = /\blogo\b/i;
const BANNER = /\bbanner\b|leaderboard|skyscraper/i;
const INFO = /infographic|chart|diagram/i;

export function classifyProbableKind(input: {
  url: string;
  fileName: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}): ProbableKind {
  const hay = `${input.url} ${input.fileName} ${input.alt ?? ""}`;
  if (TRACKING.test(hay) || (input.width != null && input.width <= 4 && input.height != null && input.height <= 4)) {
    return "tracking";
  }
  if (ICON.test(hay) || (input.width != null && input.width > 0 && input.width < 48 && (input.height ?? 0) < 48)) {
    return "icon";
  }
  if (LOGO.test(hay)) return "logo";
  if (BANNER.test(hay) || (input.width != null && input.height != null && input.width / input.height >= 3)) return "banner";
  if (INFO.test(hay)) return "infographic";
  if (/\blifestyle\b|in[-_ ]use/i.test(hay)) return "lifestyle";
  if (/\bpack(shot)?\b|bottle|box|product/i.test(hay)) return "packshot";
  return "other";
}

export function isRelevantKind(kind: ProbableKind): boolean {
  return kind === "packshot" || kind === "lifestyle" || kind === "banner" || kind === "infographic" || kind === "other";
}

export function matchDiscoveredProduct(productName: string, url: string, fileName: string, alt?: string | null): "CONFIRMED" | "PLAUSIBLE" | "UNCONFIRMED" | "CONTRADICTED" {
  const tokens = distinctiveTokens(productName);
  if (tokens.length === 0) return "UNCONFIRMED";
  let pathName = url;
  try {
    pathName = new URL(url).pathname;
  } catch {
    pathName = url;
  }
  const strong = `${fileName} ${pathName} ${alt ?? ""}`.toLowerCase();
  if (tokens.every((token) => strong.includes(token))) return "CONFIRMED";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (tokens.some((token) => host.includes(token))) return "PLAUSIBLE";
  } catch {
    /* ignore */
  }
  return "UNCONFIRMED";
}

export function policyBlockFor(text: string): string | null {
  return promoImageLandingBlock(text);
}
