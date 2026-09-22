import type { MarketSourceClass } from "@/lib/market-research/types";
import { compactHostLabel, hostnameOf, isPromotionalHost, isPromotionalTitle } from "@/lib/market-research/promotional";

const RETAILERS =
  /amazon\.|walmart\.|iherb\.|ebay\.|target\.|costco\.|cvs\.|walgreens\.|newegg\.|bestbuy\./i;
const EDITORIAL_HOST =
  /webmd\.|healthline\.|mayoclinic\.|forbes\.|nytimes\.|wikipedia\.|investopedia\.|verywell|clevelandclinic|consumerreports|wired\.|theguardian|nih\.gov|harvard\.edu/i;
const FORUM = /reddit\.|quora\.|facebook\.|trustpilot\.|sitejabber|disqus|forum\./i;
const SELLER_PLATFORM = /shopify|clickbank|digistore|paykickstart|samcart|gumroad/i;

const SELLER_PATH_SEGMENTS = new Set([
  "shop",
  "store",
  "product",
  "products",
  "buy",
  "checkout",
  "cart",
  "order",
  "orders",
  "basket",
]);

const FORUM_PATH_SEGMENTS = new Set([
  "forum",
  "forums",
  "thread",
  "threads",
  "community",
  "discussion",
  "discussions",
]);

const PRESS_RELEASE_PATH_SEGMENTS = new Set([
  "press-release",
  "press-releases",
  "pressrelease",
  "news-release",
  "news-releases",
]);

const EDITORIAL_PATH_SEGMENTS = new Set([
  "review",
  "reviews",
  "article",
  "articles",
  "blog",
  "news",
  "guide",
  "guides",
  "analysis",
  "compare",
  "comparison",
]);

const GENERIC_TOKENS = new Set([
  "joint",
  "support",
  "supplement",
  "official",
  "site",
  "website",
  "usa",
  "shop",
  "store",
  "buy",
  "get",
  "deal",
  "offer",
  "coupon",
  "health",
  "care",
  "plus",
  "best",
  "online",
  "sale",
  "today",
  "formula",
  "complex",
  "advanced",
]);

export function distinctiveNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token));
}

export type ClassifyMarketSourceInput = {
  url: string;
  productName: string;
  manufacturer?: string;
  title?: string;
};

export type MarketClassification = {
  classification: MarketSourceClass;
  reason: string;
};

/**
 * Precedence (final):
 * 1. no host → UNKNOWN
 * 2. known retailer host → RETAILER
 * 3. forum/community host OR structural forum path
 *    (/forum/, /threads/, /community/, /discussion/, …) → FORUM/COMMUNITY
 *    Concrete forum structure beats a weak editorial host/title signal.
 * 4. strong brand identity on a non-promotional host → BRAND
 *    Official titles are never brand evidence.
 * 5. seller-platform host, commerce pathname (/shop/, /store/, /product/, …),
 *    promotional title, or promotional host → SELLER
 *    Shop/product paths do not promote to BRAND.
 * 6. structural press-release pathname → OTHER
 *    A known publisher host is not independent editorial evidence here.
 * 7. known editorial host, or combined editorial path+title signals
 *    without seller/brand/forum/press-release evidence → EDITORIAL
 *    The word "review" alone is not enough.
 * 8. otherwise → OTHER
 */
export function classifyMarketSource(
  urlOrInput: string | ClassifyMarketSourceInput,
  productName?: string,
  manufacturer?: string,
): MarketSourceClass {
  return classifyMarketSourceDetailed(urlOrInput, productName, manufacturer).classification;
}

export function classifyMarketSourceDetailed(
  urlOrInput: string | ClassifyMarketSourceInput,
  productName?: string,
  manufacturer?: string,
): MarketClassification {
  const input: ClassifyMarketSourceInput =
    typeof urlOrInput === "string"
      ? { url: urlOrInput, productName: productName || "", manufacturer }
      : urlOrInput;
  const host = hostnameOf(input.url);
  if (!host) return { classification: "UNKNOWN", reason: "no-host" };
  const title = input.title || "";

  if (RETAILERS.test(host)) return { classification: "RETAILER", reason: "retailer-host" };
  if (FORUM.test(host)) return { classification: "FORUM/COMMUNITY", reason: "forum-host" };
  if (hasForumCommunityPath(input.url)) {
    return { classification: "FORUM/COMMUNITY", reason: "forum-path" };
  }

  const brand = hasBrandIdentity(host, input.productName, input.manufacturer) && !isPromotionalHost(host);
  if (brand) return { classification: "BRAND", reason: "brand-identity" };

  if (SELLER_PLATFORM.test(host)) return { classification: "SELLER", reason: "seller-platform" };
  if (hasSellerCommercePath(input.url)) return { classification: "SELLER", reason: "seller-path" };
  if (isPromotionalTitle(title)) return { classification: "SELLER", reason: "promotional-title" };
  if (isPromotionalHost(host)) return { classification: "SELLER", reason: "promotional-host" };

  if (hasPressReleasePath(input.url)) {
    return { classification: "OTHER", reason: "press-release-path" };
  }

  if (EDITORIAL_HOST.test(host)) return { classification: "EDITORIAL", reason: "editorial-host" };
  if (hasCombinedEditorialSignals(input.url, title)) {
    return { classification: "EDITORIAL", reason: "editorial-signals" };
  }

  return { classification: "OTHER", reason: "other" };
}

export function pathnameFromUrl(url: string): string {
  try {
    return new URL(url).pathname || "";
  } catch {
    return "";
  }
}

export function hasSellerCommercePath(url: string): boolean {
  return pathSegments(pathnameFromUrl(url)).some((segment) => SELLER_PATH_SEGMENTS.has(segment));
}

export function hasForumCommunityPath(url: string): boolean {
  return pathSegments(pathnameFromUrl(url)).some((segment) => FORUM_PATH_SEGMENTS.has(segment));
}

export function hasPressReleasePath(url: string): boolean {
  return pathSegments(pathnameFromUrl(url)).some((segment) => PRESS_RELEASE_PATH_SEGMENTS.has(segment));
}

export function hasCombinedEditorialSignals(url: string, title: string): boolean {
  const pathHit = hasEditorialPath(url);
  const titleScore = editorialTitleScore(title);
  if (pathHit && titleScore >= 1) return true;
  if (titleScore >= 3) return true;
  return false;
}

function hasEditorialPath(url: string): boolean {
  return pathSegments(pathnameFromUrl(url)).some((segment) => {
    if (EDITORIAL_PATH_SEGMENTS.has(segment)) return true;
    return /(?:^|-)(reviews?|articles?|guides?|analysis|comparison)(?:-|$)/i.test(segment);
  });
}

function editorialTitleScore(title: string): number {
  let score = 0;
  if (/\b(honest|independent|in-depth|in depth|expert)\b/i.test(title) && /\breviews?\b/i.test(title)) {
    score += 2;
  }
  if (/\b(analysis|verdict|buying guide|comparison|vs\.?|worth it)\b/i.test(title)) score += 2;
  if (/\breviews?\b/i.test(title)) score += 1;
  return score;
}

function pathSegments(pathname: string): string[] {
  return pathname
    .toLowerCase()
    .split("/")
    .map((part) => part.replace(/\.[a-z0-9]{1,8}$/i, ""))
    .filter(Boolean);
}

function hasBrandIdentity(host: string, productName: string, manufacturer?: string): boolean {
  const compactHost = compactHostLabel(host);
  if (!compactHost) return false;

  const makerTokens = distinctiveNameTokens(manufacturer || "");
  if (makerTokens.length > 0 && makerTokens.every((token) => compactHost.includes(token))) {
    return true;
  }

  const productCompact = productName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (productCompact.length >= 8 && compactHost === productCompact) {
    return true;
  }

  return false;
}
