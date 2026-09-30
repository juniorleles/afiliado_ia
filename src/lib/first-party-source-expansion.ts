/**
 * Controlled first-party source expansion.
 *
 * Same-origin, depth 1, robots-respecting, category-gated. Not a crawler.
 * Secondary facts keep their own URL and page category so a refund page is
 * never indistinguishable from the primary offer page.
 */
import { classifyImportFailure } from "@/lib/source-resolution/block";
import { FetchTimeoutError, fetchWithTimeout } from "@/lib/source-resolution/http";
import { PER_ALTERNATIVE_SOURCE_TIMEOUT_MS } from "@/lib/source-resolution/timeouts";
import type { FetchImpl } from "@/lib/source-resolution/types";
import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import { checkRobotsRules } from "@/lib/robots";
import { extractIngredientContextFromHtml } from "@/lib/ingredient-context";
import {
  extractExplicitProductFormat,
  extractOperationalFactsFromHtml,
  pairQuestionsFromText,
} from "@/lib/operational-evidence";
import { collapseText, extractHeadings, extractTaggedTexts, stripHiddenMarkup } from "@/lib/source-html";
import type {
  ProductFacts,
  SourceFact,
  SourcePageCategory,
} from "@/lib/product-facts";

export const SOURCE_EXPANSION_LIMITS = {
  MAX_SECONDARY_PAGES: 6,
  MAX_DEPTH: 1,
  SAME_ORIGIN_ONLY: true,
} as const;

export const ELIGIBLE_SOURCE_CATEGORIES: SourcePageCategory[] = [
  "RETURNS",
  "REFUNDS",
  "SHIPPING",
  "USAGE",
  "PRODUCT_DETAILS",
  "FAQ",
];

export const REJECTED_SOURCE_CATEGORIES: SourcePageCategory[] = [
  "PRIVACY",
  "TERMS",
  "GENERAL_LEGAL",
  "BLOG",
  "TESTIMONIALS",
  "REVIEWS",
  "UNRELATED_SUPPORT",
];

export type DiscoveredSourceLink = {
  url: string;
  origin: string;
  pathname: string;
  anchorText: string;
  depth: number;
  sameOrigin: boolean;
};

export type ClassifiedSourcePage = DiscoveredSourceLink & {
  category: SourcePageCategory;
  eligible: boolean;
  rejectReason?: string;
  robotsAllowed?: boolean;
  fetched?: boolean;
  httpStatus?: number;
  factualUnits?: number;
  copyEligibleUnits?: number;
};

export type SecondaryPageInput = {
  url: string;
  html?: string;
  headings?: string[];
  paragraphs?: string[];
  tableCells?: string[];
  /** Page text in reading order; lets FAQ answers be paired without the HTML. */
  plainText?: string;
  anchorText?: string;
  depth?: number;
  robotsAllowed?: boolean;
  httpStatus?: number;
};

export type SourceExpansionResult = {
  facts: ProductFacts;
  discovered: ClassifiedSourcePage[];
  eligible: ClassifiedSourcePage[];
  fetched: ClassifiedSourcePage[];
  maxDepth: number;
  sameOriginOnly: boolean;
};

function normalizePath(pathname: string): string {
  return pathname.replace(/\/+/g, "/").replace(/\/index\.php$/i, "/").replace(/\/$/, "") || "/";
}

function isPrimaryDuplicate(url: string, primaryUrl: string): boolean {
  try {
    const candidate = new URL(url);
    const primary = new URL(primaryUrl);
    if (candidate.origin !== primary.origin) return false;
    const path = normalizePath(candidate.pathname);
    if (path === "/") return true;
    return path === normalizePath(primary.pathname);
  } catch {
    return false;
  }
}

function normalizeUrl(href: string, base: string): string | null {
  try {
    const resolved = new URL(href, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    resolved.hash = "";
    return resolved.toString().replace(/\?$/, "");
  } catch {
    return null;
  }
}

export function discoverSameOriginLinks(html: string, primaryUrl: string): DiscoveredSourceLink[] {
  const origin = new URL(primaryUrl).origin;
  const seen = new Set<string>();
  const out: DiscoveredSourceLink[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attrs = match[1] ?? "";
    const href = attrs.match(/href=["']([^"']+)["']/i)?.[1]?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    const url = normalizeUrl(href, primaryUrl);
    if (!url || seen.has(url) || url === primaryUrl) continue;
    seen.add(url);
    const anchor = collapseText(match[0].replace(/<[^>]+>/g, " "));
    const parsed = new URL(url);
    out.push({
      url,
      origin: parsed.origin,
      pathname: parsed.pathname.replace(/\/+/g, "/"),
      anchorText: anchor,
      depth: 1,
      sameOrigin: parsed.origin === origin,
    });
  }
  return out;
}

function pathSignals(pathname: string, extra = ""): Partial<Record<SourcePageCategory, number>> {
  const hay = `${pathname} ${extra}`.toLowerCase();
  const scores: Partial<Record<SourcePageCategory, number>> = {};
  const hit = (category: SourcePageCategory, weight: number) => {
    scores[category] = (scores[category] ?? 0) + weight;
  };
  if (/\brefund/.test(hay)) hit("REFUNDS", 3);
  if (/\breturn/.test(hay)) hit("RETURNS", 3);
  if (/\bshipping\b|\bdelivery\b/.test(hay)) hit("SHIPPING", 3);
  if (/\bfaq\b|frequently asked/.test(hay)) hit("FAQ", 2);
  if (/\busage\b|\bdirections?\b|\bhow-to-use\b|\bhow to use\b/.test(hay)) hit("USAGE", 2);
  if (/\bproduct[-_]?details\b|\bingredients?\b|\bsupplement facts\b/.test(hay)) hit("PRODUCT_DETAILS", 2);
  if (/\bprivacy\b/.test(hay)) hit("PRIVACY", 4);
  if (/\bterms\b/.test(hay)) hit("TERMS", 4);
  if (/\bdisclaimer\b|\blegal\b/.test(hay)) hit("GENERAL_LEGAL", 4);
  if (/\bblog\b|\barticle\b|\bnews\b/.test(hay)) hit("BLOG", 3);
  if (/\btestimonial/.test(hay)) hit("TESTIMONIALS", 4);
  if (/\breviews?\b/.test(hay)) hit("REVIEWS", 3);
  if (/\bcontact\b|\bsupport\b/.test(hay) && !/\brefund|return|shipping|faq\b/.test(hay)) {
    hit("UNRELATED_SUPPORT", 3);
  }
  return scores;
}

/**
 * Page purpose is read from the URL path, anchor text, document title and
 * primary heading; each subordinate heading adds weaker evidence of its own,
 * so one incidental subheading cannot override a coherent page purpose while
 * many can still contradict it.
 */
const STRUCTURAL_WEIGHT = 2;
const SUBORDINATE_WEIGHT = 1;
const MIN_CATEGORY_SCORE = 2 * STRUCTURAL_WEIGHT;

/**
 * Categories whose pages feed the same operational extractor. A tie inside
 * one family resolves to the member with stronger structural evidence, then
 * to the first (canonical) member; ties across families stay ambiguous.
 */
const COMPATIBLE_SOURCE_FAMILIES: SourcePageCategory[][] = [["RETURNS", "REFUNDS"]];

export function classifySourcePage(input: {
  url: string;
  pathname?: string;
  anchorText?: string;
  headings?: string[];
  html?: string;
}): SourcePageCategory {
  let pathname = input.pathname;
  if (!pathname) {
    try {
      pathname = new URL(input.url).pathname;
    } catch {
      pathname = input.url;
    }
  }
  const headings = input.headings ?? (input.html ? extractHeadings(input.html) : []);
  const title = input.html ? (extractTaggedTexts(input.html, "title")[0] ?? "") : "";
  const primaryHeading = (input.html ? extractTaggedTexts(input.html, "h1")[0] : undefined) ?? headings[0] ?? "";
  const subordinate = headings.filter((heading) => heading !== primaryHeading);

  const structural = pathSignals(pathname.replace(/\/+/g, "/"), `${input.anchorText ?? ""} ${title} ${primaryHeading}`);
  const scores: Partial<Record<SourcePageCategory, number>> = {};
  for (const [category, weight] of Object.entries(structural) as Array<[SourcePageCategory, number]>) {
    scores[category] = (scores[category] ?? 0) + weight * STRUCTURAL_WEIGHT;
  }
  for (const heading of subordinate) {
    for (const [category, weight] of Object.entries(pathSignals("", heading)) as Array<[SourcePageCategory, number]>) {
      scores[category] = (scores[category] ?? 0) + weight * SUBORDINATE_WEIGHT;
    }
  }

  const ranked = Object.entries(scores).sort((a, b) => (b[1] as number) - (a[1] as number)) as Array<
    [SourcePageCategory, number]
  >;
  if (ranked.length === 0) return "AMBIGUOUS_SOURCE_CATEGORY";
  const [top, topScore] = ranked[0];
  if (topScore < MIN_CATEGORY_SCORE) return "AMBIGUOUS_SOURCE_CATEGORY";
  const tied = ranked.filter(([, score]) => score === topScore).map(([category]) => category);
  if (tied.length === 1) return top;
  const family = COMPATIBLE_SOURCE_FAMILIES.find((members) => tied.every((category) => members.includes(category)));
  if (family) {
    return [...tied].sort((a, b) => (structural[b] ?? 0) - (structural[a] ?? 0) || family.indexOf(a) - family.indexOf(b))[0];
  }
  if (tied.every((category) => REJECTED_SOURCE_CATEGORIES.includes(category))) return top;
  return "AMBIGUOUS_SOURCE_CATEGORY";
}

export function isEligibleSourceCategory(category: SourcePageCategory): boolean {
  return ELIGIBLE_SOURCE_CATEGORIES.includes(category);
}

function snippetFor(
  field: string,
  text: string,
  sourceUrl: string,
  category: SourcePageCategory,
  extra?: { sourceUnit?: string; sourceLocation?: string; retrievedAt?: string; question?: string },
): SourceFact {
  return {
    field,
    text,
    sourceUrl,
    confidence: "DIRECT_SOURCE",
    question: extra?.question,
    sourcePageCategory: category,
    sourceUnit: extra?.sourceUnit,
    sourceLocation: extra?.sourceLocation,
    retrievedAt: extra?.retrievedAt,
  };
}

export function applySecondaryPageToFacts(
  facts: ProductFacts,
  page: SecondaryPageInput,
  category: SourcePageCategory,
): ProductFacts {
  const sourceUrl = page.url;
  const retrievedAt = new Date().toISOString();
  const html = page.html ? stripHiddenMarkup(page.html) : "";
  const ingredientContext = [...(facts.ingredientContext ?? [])];
  const returnsInformation = [...(facts.returnsInformation ?? [])];
  const shippingInformation = [...(facts.shippingInformation ?? [])];
  const next: ProductFacts = {
    ...facts,
    ingredientContext,
    returnsInformation,
    shippingInformation,
    sourceSnippets: [...facts.sourceSnippets],
  };

  if (html) {
    const operational = extractOperationalFactsFromHtml(html, sourceUrl, category, retrievedAt);
    returnsInformation.push(...operational.returns);
    shippingInformation.push(...operational.shipping);
    if (facts.ingredientsOrComponents.length > 0 && category === "PRODUCT_DETAILS") {
      ingredientContext.push(
        ...extractIngredientContextFromHtml(html, facts.ingredientsOrComponents, sourceUrl, {
          sourcePageCategory: category,
          retrievedAt,
        }),
      );
    }
    if (!next.productFormat && (category === "USAGE" || category === "PRODUCT_DETAILS" || category === "FAQ")) {
      const paragraphs = page.paragraphs ?? [];
      next.productFormat = extractExplicitProductFormat(paragraphs, sourceUrl, {
        sourcePageCategory: category,
        retrievedAt,
      });
    }
  } else {
    const texts = [...(page.paragraphs ?? []), ...(page.headings ?? [])];
    const questions = page.plainText
      ? pairQuestionsFromText(page.headings ?? [], page.paragraphs ?? [], page.plainText)
      : new Map<string, string>();
    const operational = extractOperationalFactsFromHtml(
      texts.map((item) => `<p>${item}</p>`).join("") +
        (page.tableCells ?? []).map((cell) => `<td>${cell}</td>`).join(""),
      sourceUrl,
      category,
      retrievedAt,
      questions,
    );
    returnsInformation.push(...operational.returns);
    shippingInformation.push(...operational.shipping);
  }

  for (const item of returnsInformation) {
    if (item.sourceUrl !== sourceUrl) continue;
    next.sourceSnippets.push(
      snippetFor("returnsInformation", item.statement, sourceUrl, category, {
        sourceUnit: item.sourceUnit,
        sourceLocation: item.sourceLocation,
        retrievedAt: item.retrievedAt,
      }),
    );
  }
  for (const item of shippingInformation) {
    if (item.sourceUrl !== sourceUrl) continue;
    next.sourceSnippets.push(
      snippetFor("shippingInformation", item.statement, sourceUrl, category, {
        sourceUnit: item.sourceUnit,
        sourceLocation: item.sourceLocation,
        retrievedAt: item.retrievedAt,
        question: item.question,
      }),
    );
  }
  return next;
}

export function mergeSecondaryPages(
  facts: ProductFacts,
  pages: SecondaryPageInput[],
  options: { primaryUrl: string; robotsText?: string } = { primaryUrl: facts.sourceUrl },
): SourceExpansionResult {
  const primaryOrigin = (() => {
    try {
      return new URL(options.primaryUrl || facts.sourceUrl).origin;
    } catch {
      return "";
    }
  })();
  const discovered: ClassifiedSourcePage[] = [];
  let next = facts;

  for (const page of pages) {
    let parsed: URL;
    try {
      parsed = new URL(page.url);
    } catch {
      continue;
    }
    const depth = page.depth ?? 1;
    const originOk = parsed.origin === primaryOrigin;
    const category = classifySourcePage({
      url: page.url,
      pathname: parsed.pathname,
      anchorText: page.anchorText,
      headings: page.headings,
      html: page.html,
    });
    const robotsAllowed =
      page.robotsAllowed ??
      (options.robotsText ? checkRobotsRules(options.robotsText, parsed.pathname) : true);
    const record: ClassifiedSourcePage = {
      url: page.url,
      origin: parsed.origin,
      pathname: parsed.pathname.replace(/\/+/g, "/"),
      anchorText: page.anchorText ?? "",
      depth,
      sameOrigin: originOk,
      category,
      eligible: false,
      robotsAllowed,
      httpStatus: page.httpStatus,
    };
    if (!originOk) {
      record.rejectReason = "EXTERNAL_ORIGIN";
    } else if (isPrimaryDuplicate(page.url, options.primaryUrl || facts.sourceUrl)) {
      record.rejectReason = "PRIMARY_DUPLICATE";
    } else if (depth > SOURCE_EXPANSION_LIMITS.MAX_DEPTH) {
      record.rejectReason = "DEPTH_EXCEEDED";
    } else if (!robotsAllowed) {
      record.rejectReason = "ROBOTS_DISALLOWED";
    } else if (category === "AMBIGUOUS_SOURCE_CATEGORY") {
      record.rejectReason = "AMBIGUOUS_SOURCE_CATEGORY";
    } else if (!isEligibleSourceCategory(category)) {
      record.rejectReason = `CATEGORY_${category}`;
    } else {
      record.eligible = true;
    }
    discovered.push(record);
  }

  const eligible = discovered.filter((page) => page.eligible).slice(0, SOURCE_EXPANSION_LIMITS.MAX_SECONDARY_PAGES);
  const fetched: ClassifiedSourcePage[] = [];
  for (const record of eligible) {
    const page = pages.find((item) => item.url === record.url);
    if (!page || (!page.html && !(page.paragraphs && page.paragraphs.length))) continue;
    const beforeReturns = next.returnsInformation?.length ?? 0;
    const beforeShipping = next.shippingInformation?.length ?? 0;
    next = applySecondaryPageToFacts(next, page, record.category);
    const addedReturns = (next.returnsInformation ?? []).slice(beforeReturns);
    const addedShipping = (next.shippingInformation ?? []).slice(beforeShipping);
    const added = [...addedReturns, ...addedShipping];
    record.fetched = true;
    record.factualUnits = added.length;
    record.copyEligibleUnits = added.filter((item) => item.copyEligibility === "YES").length;
    fetched.push(record);
  }

  return {
    facts: next,
    discovered,
    eligible,
    fetched,
    maxDepth: SOURCE_EXPANSION_LIMITS.MAX_DEPTH,
    sameOriginOnly: SOURCE_EXPANSION_LIMITS.SAME_ORIGIN_ONLY,
  };
}

export async function expandFirstPartySources(
  facts: ProductFacts,
  primaryHtml: string,
  primaryUrl: string,
  deps: { fetchImpl?: FetchImpl; signal?: AbortSignal; robotsText?: string } = {},
): Promise<SourceExpansionResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const links = discoverSameOriginLinks(primaryHtml, primaryUrl).filter((link) => link.sameOrigin);
  let robotsText = deps.robotsText ?? "";
  if (!robotsText) {
    try {
      const origin = new URL(primaryUrl).origin;
      const robotsUrl = `${origin}/robots.txt`;
      const response = await fetchWithTimeout(
        fetchImpl,
        robotsUrl,
        { headers: { "user-agent": "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)" } },
        PER_ALTERNATIVE_SOURCE_TIMEOUT_MS,
        deps.signal,
      );
      if (response.ok) robotsText = await response.text();
    } catch {
      robotsText = "";
    }
  }

  const classified = links.map((link) => {
    const category = classifySourcePage({ url: link.url, pathname: link.pathname, anchorText: link.anchorText });
    const robotsAllowed = robotsText ? checkRobotsRules(robotsText, link.pathname) : true;
    const record: ClassifiedSourcePage = {
      ...link,
      category,
      eligible: false,
      robotsAllowed,
    };
    if (isPrimaryDuplicate(link.url, primaryUrl)) record.rejectReason = "PRIMARY_DUPLICATE";
    else if (link.depth > SOURCE_EXPANSION_LIMITS.MAX_DEPTH) record.rejectReason = "DEPTH_EXCEEDED";
    else if (!robotsAllowed) record.rejectReason = "ROBOTS_DISALLOWED";
    else if (category === "AMBIGUOUS_SOURCE_CATEGORY") record.rejectReason = "AMBIGUOUS_SOURCE_CATEGORY";
    else if (!isEligibleSourceCategory(category)) record.rejectReason = `CATEGORY_${category}`;
    else record.eligible = true;
    return record;
  });

  const toFetch = classified.filter((item) => item.eligible).slice(0, SOURCE_EXPANSION_LIMITS.MAX_SECONDARY_PAGES);
  const pages: SecondaryPageInput[] = [];
  for (const record of toFetch) {
    try {
      assertSafeOutboundUrl(record.url);
      const response = await fetchWithTimeout(
        fetchImpl,
        record.url,
        { headers: { "user-agent": "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)" }, cache: "no-store" },
        PER_ALTERNATIVE_SOURCE_TIMEOUT_MS,
        deps.signal,
      );
      const body = await response.text();
      const block = classifyImportFailure({ status: response.status, body });
      if (block === "ANTI_BOT_BLOCKED" || !response.ok) {
        record.rejectReason = block === "ANTI_BOT_BLOCKED" ? "ANTI_BOT_BLOCKED" : `HTTP_${response.status}`;
        record.eligible = false;
        record.httpStatus = response.status;
        continue;
      }
      record.httpStatus = response.status;
      pages.push({
        url: record.url,
        html: body,
        headings: extractHeadings(body),
        anchorText: record.anchorText,
        depth: 1,
        robotsAllowed: true,
        httpStatus: response.status,
      });
    } catch (error) {
      if (error instanceof FetchTimeoutError) record.rejectReason = "FETCH_TIMEOUT";
      else record.rejectReason = "FETCH_FAILED";
      record.eligible = false;
    }
  }

  const merged = mergeSecondaryPages(facts, pages, { primaryUrl, robotsText });
  const byUrl = new Map(classified.map((item) => [item.url, item]));
  for (const fetched of merged.fetched) {
    const prior = byUrl.get(fetched.url);
    if (prior) {
      prior.fetched = true;
      prior.factualUnits = fetched.factualUnits;
      prior.copyEligibleUnits = fetched.copyEligibleUnits;
      prior.httpStatus = fetched.httpStatus ?? prior.httpStatus;
    }
  }
  return {
    facts: merged.facts,
    discovered: classified,
    eligible: classified.filter((item) => item.eligible),
    fetched: classified.filter((item) => item.fetched),
    maxDepth: SOURCE_EXPANSION_LIMITS.MAX_DEPTH,
    sameOriginOnly: SOURCE_EXPANSION_LIMITS.SAME_ORIGIN_ONLY,
  };
}
