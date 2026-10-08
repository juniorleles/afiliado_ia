/**
 * Paused Search campaign plan.
 *
 * Copy, keywords, and assets are copied from records that already exist.
 * This module does not invent a headline, a keyword, or an asset.
 */
import type { Campaign } from "@/lib/campaigns";
import type { GoogleAdsStoredAccount } from "@/lib/integrations/google-ads-oauth/store";
import { lintCampaign } from "@/lib/policy-linter";
import { configuredOrigin } from "@/lib/env";

export type SafeBidding = "MANUAL_CPC" | "MAXIMIZE_CLICKS";
export type SafeMatch = "BROAD" | "PHRASE" | "EXACT";

export type SafeKeyword = { text: string; matchType: SafeMatch; negative: boolean };
export type SafeSitelink = { text: string };
export type SafeCallout = { text: string };
export type SafeSnippet = { header: string; values: string[] };

export type SafePlan = {
  localCampaignId: number;
  draftId: string;
  name: string;
  budgetName: string;
  customerId: string;
  accountName: string;
  finalUrl: string;
  amountMicros: number;
  languageConstant: string;
  languageLabel: string;
  countryConstant: string;
  countryLabel: string;
  searchPartners: boolean;
  bidding: SafeBidding;
  headlines: string[];
  descriptions: string[];
  keywords: SafeKeyword[];
  sitelinks: SafeSitelink[];
  callouts: SafeCallout[];
  snippets: SafeSnippet[];
};

const LANGUAGES = [
  { id: "1000", label: "Inglês" },
  { id: "1014", label: "Português" },
  { id: "1003", label: "Espanhol" },
] as const;

const COUNTRIES = [
  { id: "2840", label: "Estados Unidos" },
  { id: "2076", label: "Brasil" },
  { id: "2826", label: "Reino Unido" },
] as const;

export const SAFE_LANGUAGES = LANGUAGES;
export const SAFE_COUNTRIES = COUNTRIES;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = value.trim();
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
}

export function existingHeadlines(campaign: Pick<Campaign, "headline" | "adHeadline" | "subheadline" | "ctaLabel">): string[] {
  return unique([campaign.adHeadline ?? "", campaign.headline ?? "", campaign.subheadline ?? "", campaign.ctaLabel ?? ""]).filter(
    (text) => text.length > 0 && text.length <= 30,
  );
}

export function existingDescriptions(campaign: Pick<Campaign, "body" | "subheadline">): string[] {
  const parts = `${campaign.subheadline ?? ""}\n${campaign.body ?? ""}`.split(/[\n.!?]+/);
  return unique(parts).filter((text) => text.length > 0 && text.length <= 90).slice(0, 4);
}

function walk(value: unknown, visit: (key: string, child: unknown) => void, depth = 0): void {
  if (depth > 6) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit, depth + 1);
  }
}

function jsonValues(campaign: Campaign): unknown[] {
  return [campaign.sourceFactsJson, campaign.designPlanJson, campaign.creativeCompositionJson]
    .map((text) => {
      if (!text) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    })
    .filter((value) => value !== null);
}

function stringsAt(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else if (isRecord(item) && typeof item.text === "string" && item.text.trim()) out.push(item.text.trim());
  }
  return out;
}

export function existingKeywords(campaign: Campaign): SafeKeyword[] {
  const found: SafeKeyword[] = [];
  for (const parsed of jsonValues(campaign)) {
    walk(parsed, (key, child) => {
      const negative = key === "negativeKeywords" || key === "negatives";
      if (key !== "keywords" && key !== "searchTerms" && !negative) return;
      for (const text of stringsAt(child)) {
        if (text.length > 80) continue;
        const match = isRecord(child) && (child.matchType === "PHRASE" || child.matchType === "EXACT" || child.matchType === "BROAD")
          ? child.matchType
          : "BROAD";
        found.push({ text, matchType: match, negative });
      }
      if (Array.isArray(child)) {
        for (const item of child) {
          if (!isRecord(item) || typeof item.text !== "string") continue;
          const match = item.matchType === "PHRASE" || item.matchType === "EXACT" || item.matchType === "BROAD" ? item.matchType : "BROAD";
          found.push({ text: item.text.trim(), matchType: match, negative: negative || item.negative === true });
        }
      }
    });
  }
  const seen = new Set<string>();
  return found.filter((item) => {
    if (!item.text) return false;
    const id = `${item.negative}:${item.matchType}:${item.text.toLowerCase()}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export function existingAssets(campaign: Campaign): { sitelinks: SafeSitelink[]; callouts: SafeCallout[]; snippets: SafeSnippet[] } {
  const sitelinks: SafeSitelink[] = [];
  const callouts: SafeCallout[] = [];
  const snippets: SafeSnippet[] = [];
  for (const parsed of jsonValues(campaign)) {
    walk(parsed, (key, child) => {
      if (key === "sitelinks") {
        for (const text of stringsAt(child)) {
          if (text.length <= 25) sitelinks.push({ text });
        }
      }
      if (key === "callouts") {
        for (const text of stringsAt(child)) {
          if (text.length <= 25) callouts.push({ text });
        }
      }
      if (key === "structuredSnippets" && Array.isArray(child)) {
        for (const item of child) {
          if (!isRecord(item) || typeof item.header !== "string") continue;
          const values = stringsAt(item.values).filter((text) => text.length <= 25).slice(0, 10);
          if (item.header.trim() && values.length > 0) snippets.push({ header: item.header.trim(), values });
        }
      }
    });
  }
  return { sitelinks, callouts, snippets };
}

export function landingUrl(campaign: Pick<Campaign, "slug" | "publicationStatus">): string | null {
  if (campaign.publicationStatus !== "published") return null;
  const origin = configuredOrigin();
  if (!origin || !origin.startsWith("https://")) return null;
  return `${origin}/p/${campaign.slug}`;
}

export function validateSafePlan(input: {
  campaign: Campaign;
  account: GoogleAdsStoredAccount | null;
  budget: number;
  languageId: string;
  countryId: string;
  searchPartners: boolean;
  bidding: string;
}): { plan: SafePlan | null; issues: string[] } {
  const issues: string[] = [];
  const language = LANGUAGES.find((item) => item.id === input.languageId);
  const country = COUNTRIES.find((item) => item.id === input.countryId);
  const bidding: SafeBidding | null = input.bidding === "MANUAL_CPC" || input.bidding === "MAXIMIZE_CLICKS" ? input.bidding : null;
  if (!input.campaign.name.trim() || input.campaign.name.trim().length > 255) issues.push("O nome da campanha está ausente ou passa de 255 caracteres.");
  if (!input.account || !input.account.selected) issues.push("Selecione uma conta ativa do Google Ads.");
  if (input.account?.manager) issues.push("Uma conta gerente não recebe a campanha.");
  const finalUrl = landingUrl(input.campaign);
  if (!finalUrl) issues.push("A landing page precisa estar publicada em HTTPS antes do anúncio.");
  if (!Number.isFinite(input.budget) || input.budget <= 0 || input.budget > 1_000_000) issues.push("Informe um orçamento diário maior que zero.");
  if (!language) issues.push("Escolha um idioma.");
  if (!country) issues.push("Escolha um país.");
  if (!bidding) issues.push("Escolha CPC manual ou Maximizar cliques.");
  const headlines = existingHeadlines(input.campaign);
  const descriptions = existingDescriptions(input.campaign);
  if (headlines.length < 3) issues.push("A campanha não tem três títulos existentes com até 30 caracteres.");
  if (descriptions.length < 2) issues.push("A campanha não tem duas descrições existentes com até 90 caracteres.");
  const keywords = existingKeywords(input.campaign);
  if (!keywords.some((item) => !item.negative)) issues.push("O Opportunity Engine não deixou palavras-chave nesta campanha.");
  const lint = lintCampaign(input.campaign);
  if (lint.gate !== "READY") issues.push("A política interna não está pronta. A publicação no Google Ads fica bloqueada.");
  if (issues.length > 0 || !input.account || !finalUrl || !language || !country || !bidding) return { plan: null, issues };
  const amountMicros = Math.round(input.budget * 1_000_000);
  const assets = existingAssets(input.campaign);
  return {
    plan: {
      localCampaignId: input.campaign.id,
      draftId: `safe-${input.campaign.id}-${input.account.customerId}`,
      name: input.campaign.name.trim(),
      budgetName: `${input.campaign.name.trim()} orçamento`,
      customerId: input.account.customerId,
      accountName: input.account.accountName || input.account.customerId,
      finalUrl,
      amountMicros,
      languageConstant: language.id,
      languageLabel: language.label,
      countryConstant: country.id,
      countryLabel: country.label,
      searchPartners: input.searchPartners,
      bidding,
      headlines: headlines.slice(0, 15),
      descriptions: descriptions.slice(0, 4),
      keywords,
      sitelinks: assets.sitelinks,
      callouts: assets.callouts,
      snippets: assets.snippets,
    },
    issues: [],
  };
}
