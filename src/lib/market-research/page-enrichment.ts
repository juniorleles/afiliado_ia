import { checkRobotsRules } from "@/lib/robots";
import { assertSafeOutboundUrl } from "@/lib/fetch-guard";
import { createLandingPageHttpClient, type LandingPageHttpClient } from "@/lib/real-landing-page/landing-page-http-client";
import { mediaTypeOf } from "@/lib/real-landing-page/landing-page-validator";
import { emptyInsight, extractPage, isBlockedInterstitial } from "@/lib/market-research/page-extract";
import type {
  MarketAudienceObservation,
  MarketCtaPattern,
  MarketFaqItem,
  MarketGuaranteeObservation,
  MarketNamedSource,
  MarketPageInsight,
  MarketPolicyRisk,
  MarketPriceObservation,
  MarketResearchReport,
  MarketScientificEvidence,
  MarketStructureCount,
  MarketCountedPhrase,
} from "@/lib/market-research/types";

export const MAX_ENRICHED_PAGES = 10;
const PAGE_TIMEOUT_MS = 10_000;
const ROBOTS_TIMEOUT_MS = 5_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BLOCKED_STATUSES = new Set([401, 403, 429, 451]);
const SKIP_EXTENSION = /\.(?:pdf|mp4|webm|mov|avi|zip|rar|7z|gz|exe|dmg|docx?|xlsx?|pptx?|csv)(?:$|[?#])/i;
const SKIP_HOST = /(^|\.)((?:youtube\.com)|(?:youtu\.be)|(?:vimeo\.com)|(?:tiktok\.com))$/i;
const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);

export type EnrichMarketResearchOptions = {
  client?: LandingPageHttpClient;
  robotsClient?: LandingPageHttpClient;
  previous?: MarketResearchReport | null;
  maxPages?: number;
  allow?: (url: string) => Promise<boolean>;
  onPage?: (info: { domain: string; status: string }) => void;
};

function keyOf(text: string): string {
  return text.toLowerCase().replace(/[“”"']/g, "").replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
}

function sourceLabel(insight: MarketPageInsight): string {
  return insight.headline || insight.domain;
}

function cachedInsight(previous: MarketResearchReport | null | undefined, url: string): MarketPageInsight | null {
  const found = previous?.pageInsights?.find((item) => item.url === url && item.extractVersion === 2 && (item.status === "ENRICHED" || item.status === "CACHED"));
  if (!found) return null;
  return { ...found, status: "CACHED", durationMs: 0, reason: null };
}

function skipReason(url: string): string | null {
  let parsed: URL;
  try {
    parsed = assertSafeOutboundUrl(url);
  } catch {
    return "Endereço não permitido";
  }
  if (SKIP_EXTENSION.test(parsed.pathname) || SKIP_EXTENSION.test(parsed.href)) return "Arquivo ou mídia";
  if (SKIP_HOST.test(parsed.hostname)) return "Vídeo";
  return null;
}

async function allowedByRobots(url: string, client: LandingPageHttpClient, cache: Map<string, string | null>): Promise<boolean> {
  const parsed = new URL(url);
  if (!cache.has(parsed.origin)) {
    const response = await client.request(`${parsed.origin}/robots.txt`);
    const type = mediaTypeOf(response.headers["content-type"] ?? "");
    const usable = response.httpStatus === 200 && response.bodyText && !response.tooLarge && (type === "" || type.startsWith("text/"));
    cache.set(parsed.origin, usable ? response.bodyText : null);
  }
  const text = cache.get(parsed.origin);
  if (!text) return true;
  return checkRobotsRules(text, parsed.pathname);
}

async function readHtml(client: LandingPageHttpClient, start: string): Promise<{
  html: string;
  status: number;
  contentType: string;
  disposition: string;
  timedOut: boolean;
  tooLarge: boolean;
  finalUrl: string;
}> {
  let current = start;
  const seen = new Set<string>();
  for (let hop = 0; hop < 4; hop += 1) {
    if (seen.has(current)) return { html: "", status: 0, contentType: "", disposition: "", timedOut: false, tooLarge: false, finalUrl: current };
    seen.add(current);
    const response = await client.request(current);
    const contentType = response.headers["content-type"] ?? "";
    const disposition = response.headers["content-disposition"] ?? "";
    if (REDIRECT_STATUSES.has(response.httpStatus)) {
      const location = response.headers.location;
      if (!location) return { html: "", status: response.httpStatus, contentType, disposition, timedOut: false, tooLarge: false, finalUrl: current };
      const next = new URL(location, current);
      if (next.protocol !== "https:" && next.protocol !== "http:") {
        return { html: "", status: response.httpStatus, contentType, disposition, timedOut: false, tooLarge: false, finalUrl: current };
      }
      current = next.toString();
      continue;
    }
    return {
      html: response.bodyText,
      status: response.httpStatus,
      contentType,
      disposition,
      timedOut: response.timedOut,
      tooLarge: response.tooLarge,
      finalUrl: current,
    };
  }
  return { html: "", status: 0, contentType: "", disposition: "", timedOut: false, tooLarge: false, finalUrl: current };
}

function aggregate(insights: MarketPageInsight[]): Pick<
  MarketResearchReport,
  "landingStructures" | "ctaPatterns" | "benefits" | "ingredients" | "pricing" | "guarantees" | "claims" | "policyRisks" | "faq" | "scientificEvidence" | "audience"
> {
  const opened = insights.filter((item) => item.status === "ENRICHED" || item.status === "CACHED");
  const structures = new Map<string, number>();
  const ctas = new Map<string, MarketCtaPattern>();
  const benefits = new Map<string, MarketCountedPhrase>();
  const ingredients = new Map<string, MarketNamedSource>();
  const pricing: MarketPriceObservation[] = [];
  const guarantees: MarketGuaranteeObservation[] = [];
  const claims = new Map<string, MarketCountedPhrase>();
  const risks = new Map<string, MarketPolicyRisk>();
  const faq: MarketFaqItem[] = [];
  const science: MarketScientificEvidence[] = [];
  const audience: MarketAudienceObservation = { ages: [], sexes: [], pains: [], goals: [], personas: [] };

  for (const insight of opened) {
    for (const structure of insight.structures) structures.set(structure, (structures.get(structure) ?? 0) + 1);
    for (const cta of insight.ctas) {
      const key = `${keyOf(cta.text)}|${cta.position}`;
      const current = ctas.get(key);
      if (current) current.frequency += cta.frequency;
      else ctas.set(key, { ...cta });
    }
    for (const benefit of insight.benefits) addPhrase(benefits, benefit, insight);
    for (const claim of insight.claims) addPhrase(claims, claim, insight);
    for (const name of insight.ingredients) {
      const key = keyOf(name);
      if (!key || ingredients.has(key)) continue;
      ingredients.set(key, { name, source: sourceLabel(insight), domain: insight.domain });
    }
    for (const price of insight.pricing) {
      pricing.push({ price: price.price, currency: price.currency, source: sourceLabel(insight), domain: insight.domain });
    }
    for (const guarantee of insight.guarantees) {
      guarantees.push({ text: guarantee.text, days: guarantee.days, source: sourceLabel(insight), domain: insight.domain });
    }
    for (const risk of insight.policyRisks) {
      const key = `${risk.claim}|${insight.domain}`;
      if (risks.has(key)) continue;
      risks.set(key, { claim: risk.claim, risk: risk.risk, source: sourceLabel(insight), domain: insight.domain });
    }
    for (const item of insight.faq) {
      if (faq.some((row) => keyOf(row.question) === keyOf(item.question) && row.domain === insight.domain)) continue;
      faq.push({ question: item.question, answer: item.answer, source: sourceLabel(insight), domain: insight.domain });
    }
    for (const item of insight.scientificEvidence) {
      science.push({ ingredient: item.ingredient, type: item.type, source: sourceLabel(insight), domain: insight.domain });
    }
    for (const field of ["ages", "sexes", "pains", "goals", "personas"] as const) {
      for (const value of insight.audience[field]) {
        const limit = field === "pains" || field === "goals" ? 8 : 12;
        if (audience[field].length >= limit) break;
        if (!audience[field].some((item) => keyOf(item) === keyOf(value))) audience[field].push(value);
      }
    }
  }

  const landingStructures: MarketStructureCount[] = [...structures.entries()]
    .map(([structure, frequency]) => ({ structure, frequency }))
    .sort((a, b) => b.frequency - a.frequency);

  return {
    landingStructures,
    ctaPatterns: [...ctas.values()].sort((a, b) => b.frequency - a.frequency),
    benefits: [...benefits.values()].sort((a, b) => b.count - a.count),
    ingredients: [...ingredients.values()],
    pricing,
    guarantees,
    claims: [...claims.values()].sort((a, b) => b.count - a.count),
    policyRisks: [...risks.values()],
    faq,
    scientificEvidence: science,
    audience,
  };
}

function addPhrase(bucket: Map<string, MarketCountedPhrase>, text: string, insight: MarketPageInsight): void {
  const key = keyOf(text);
  if (!key) return;
  const current = bucket.get(key);
  if (current) {
    current.count += 1;
    return;
  }
  bucket.set(key, { text, source: sourceLabel(insight), domain: insight.domain, count: 1 });
}

export async function enrichMarketResearch(
  report: MarketResearchReport,
  options: EnrichMarketResearchOptions = {},
): Promise<MarketResearchReport> {
  try {
    const client = options.client ?? createLandingPageHttpClient({ timeoutMs: PAGE_TIMEOUT_MS });
    const robotsClient = options.robotsClient ?? options.client ?? createLandingPageHttpClient({ timeoutMs: ROBOTS_TIMEOUT_MS });
    const limit = Math.max(0, Math.min(options.maxPages ?? MAX_ENRICHED_PAGES, MAX_ENRICHED_PAGES));
    const targets = report.sources.filter((source) => source.usable && source.url).slice(0, limit);
    const robotsCache = new Map<string, string | null>();
    const insights: MarketPageInsight[] = [];
    const seen = new Set<string>();

    for (const source of targets) {
      if (seen.has(source.url)) continue;
      seen.add(source.url);
      const started = Date.now();
      const cached = cachedInsight(options.previous, source.url);
      if (cached) {
        insights.push(cached);
        options.onPage?.({ domain: source.domain, status: "CACHED" });
        continue;
      }
      const skipped = skipReason(source.url);
      if (skipped) {
        insights.push(emptyInsight(source.url, source.domain, "SKIPPED", skipped, Date.now() - started));
        options.onPage?.({ domain: source.domain, status: "SKIPPED" });
        continue;
      }
      try {
        const allowed = options.allow
          ? await options.allow(source.url)
          : await allowedByRobots(source.url, robotsClient, robotsCache);
        if (!allowed) {
          insights.push(emptyInsight(source.url, source.domain, "SKIPPED", "robots.txt", Date.now() - started));
          options.onPage?.({ domain: source.domain, status: "SKIPPED" });
          continue;
        }
        const page = await readHtml(client, source.url);
        const durationMs = Date.now() - started;
        if (page.timedOut) {
          insights.push(emptyInsight(source.url, source.domain, "ERROR", "Tempo esgotado", durationMs));
        } else if (page.tooLarge) {
          insights.push(emptyInsight(source.url, source.domain, "ERROR", "Página grande demais", durationMs));
        } else if (BLOCKED_STATUSES.has(page.status)) {
          insights.push(emptyInsight(source.url, source.domain, "SKIPPED", "Página bloqueada", durationMs));
        } else if (page.status < 200 || page.status >= 300) {
          insights.push(emptyInsight(source.url, source.domain, "ERROR", `HTTP ${page.status || 0}`, durationMs));
        } else if (/attachment/i.test(page.disposition) || SKIP_EXTENSION.test(page.finalUrl)) {
          insights.push(emptyInsight(source.url, source.domain, "SKIPPED", "Arquivo ou mídia", durationMs));
        } else if (!htmlType(page.contentType, page.html)) {
          insights.push(emptyInsight(source.url, source.domain, "SKIPPED", "Conteúdo que não é HTML", durationMs));
        } else if (isBlockedInterstitial(page.html)) {
          insights.push(emptyInsight(source.url, source.domain, "SKIPPED", "Página bloqueada", durationMs));
        } else {
          insights.push({
            ...emptyInsight(source.url, source.domain, "ENRICHED", null, durationMs),
            ...extractPage(page.html),
            url: source.url,
            domain: source.domain,
            status: "ENRICHED",
            reason: null,
            extractVersion: 2,
          });
        }
      } catch (error) {
        const message = error instanceof Error && error.message.trim() ? error.message : "Falha ao abrir a página";
        insights.push(emptyInsight(source.url, source.domain, "ERROR", message, Date.now() - started));
      }
      options.onPage?.({ domain: source.domain, status: insights[insights.length - 1]?.status ?? "ERROR" });
    }

    return { ...report, pageInsights: insights, ...aggregate(insights) };
  } catch {
    return report;
  }
}

function htmlType(contentType: string, html: string): boolean {
  const type = mediaTypeOf(contentType);
  if (HTML_TYPES.has(type)) return true;
  if (type.startsWith("text/plain")) return /<html\b|<!doctype/i.test(html);
  if (type === "") return /<html\b|<!doctype/i.test(html);
  return false;
}

export function formatObservedEnrichment(report: MarketResearchReport): string {
  if (!report.pageInsights || report.pageInsights.length === 0) return "";
  const structures = (report.landingStructures ?? []).map((item) => `${item.structure} ${item.frequency}`).join(", ");
  const ctas = (report.ctaPatterns ?? []).map((item) => item.text).filter((text, index, all) => all.indexOf(text) === index).slice(0, 6);
  const benefits = (report.benefits ?? []).slice(0, 5).map((item) => item.text);
  return [
    "PAGE OBSERVATIONS (opened competitor pages — NOT product facts):",
    "Do not copy benefits, ingredients, prices, guarantees, claims, audience, or medical wording into the page.",
    "Use this only as emphasis. A competitor sentence is not a product fact.",
    structures ? `Observed landing sections: ${structures}.` : "Observed landing sections: none.",
    ctas.length ? `Observed CTA labels: ${ctas.join(", ")}.` : "Observed CTA labels: none.",
    benefits.length ? `Competitor wording, do not restate: ${benefits.join(" | ")}.` : "Competitor benefit wording: none.",
    (report.policyRisks ?? []).length > 0 ? "Policy-risk wording was observed. Do not use it." : "No policy-risk wording was observed on the opened pages.",
  ].join("\n");
}
