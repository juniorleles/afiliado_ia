import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { sanitizeSharedUrl } from "@/lib/campaign-sources/classify";
import { classifyUrlRoles } from "@/lib/campaign-sources/roles";
import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { fetchPublicHttps } from "@/lib/real-product-assets/fetch";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestProductResearch } from "@/lib/product-research/store";
import type { FieldProposal, ProductResearchField } from "@/lib/product-research/types";
import { pageCategoryFromUrl } from "@/lib/lp-generator/research";
import {
  extractExplicitProductFormat,
  extractOperationalFactsFromHtml,
  extractReturnsFacts,
  extractShippingFacts,
  pairQuestionsFromHtml,
} from "@/lib/operational-evidence";
import { collapseText, extractListItems, extractParagraphs, stripHiddenMarkup } from "@/lib/source-html";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { readCommercialExpansion } from "@/lib/presell-quality/commercial-research";
import type { StoredFactCandidate } from "@/lib/presell-quality/candidate-ledger";
import { validateFactCandidate, type FactCandidate } from "@/lib/presell-quality/recovery";
import { classifySourceIdentity } from "@/lib/presell-quality/source-identity";
import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";

export type StoredDocumentRow = {
  url: string;
  host: string;
  path: string;
  inventoryExtracted: boolean;
  inventoryHtmlBytes: number;
  htmlAvailable: boolean;
  htmlBytes: number;
  missing: string | null;
  sourceClass: string;
  pageCategory: string;
  fetchable: boolean;
  checkout: boolean;
  usableSellerHost: boolean;
};

export type OperationalExtract = {
  field: ProductResearchField;
  text: string;
  excerpt: string;
  sourceUrl: string;
  sourceClass: string;
  collectedAt: string;
  verification: "SELLER_STATED";
  evidenceId: string;
  conditions: string[];
  limitations: string[];
  selfDeclared: true;
};

export type OperationalCandidateRecord = FactCandidate & {
  candidateId: string;
  evidenceId: string;
  conditions: string[];
  limitations: string[];
};

export type OperationalExtractionResult = {
  campaignId: number;
  documents: StoredDocumentRow[];
  extracts: OperationalExtract[];
  newCandidates: OperationalCandidateRecord[];
  duplicatesRejected: number;
  fingerprint: string;
};

const CONTACT = /contact|support/i;
const CLONE_HOST = /vercel\.app|colibrim\.ai/i;
const HOP_HOST = /(^|\.)hop\.clickbank\.net$/i;

function keyOf(field: string, text: string): string {
  return `${field}|${text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function publicUrl(url: string): string {
  const cleaned = sanitizeSharedUrl(url);
  try {
    const parsed = new URL(cleaned);
    if (HOP_HOST.test(parsed.hostname)) return "https://hop.clickbank.net/";
    if (/\/(cart|checkout|order-now|ordernow|buy-now)/i.test(parsed.pathname)) return `${parsed.origin}${parsed.pathname}`;
    return cleaned;
  } catch {
    return cleaned;
  }
}

function loadExpansionCandidates(campaignId: number): FactCandidate[] {
  const file = path.join(qualityAssessmentRoot(), String(campaignId), "expansion-54ae.json");
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { factCandidates?: FactCandidate[] };
    return (raw.factCandidates ?? []).map((item) => ({ ...item, approvedForUse: false as const }));
  } catch {
    return [];
  }
}

function operationalFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "operational-54ao.json");
}

function pageCacheFile(campaignId: number, url: string): string {
  const hash = createHash("sha1").update(publicUrl(url)).digest("hex").slice(0, 16);
  return path.join(qualityAssessmentRoot(), String(campaignId), "stored-pages", `${hash}.json`);
}

export function readOperationalCandidates(campaignId: number): OperationalCandidateRecord[] {
  if (!existsSync(operationalFile(campaignId))) return [];
  try {
    const raw = JSON.parse(readFileSync(operationalFile(campaignId), "utf8")) as { candidates?: OperationalCandidateRecord[] };
    return raw.candidates ?? [];
  } catch {
    return [];
  }
}

export function writeOperationalCandidates(result: OperationalExtractionResult): OperationalExtractionResult {
  mkdirSync(path.dirname(operationalFile(result.campaignId)), { recursive: true });
  writeFileSync(operationalFile(result.campaignId), `${JSON.stringify({
    campaignId: result.campaignId,
    fingerprint: result.fingerprint,
    candidates: result.newCandidates,
    duplicatesRejected: result.duplicatesRejected,
  }, null, 2)}\n`);
  return result;
}

function readCachedHtml(campaignId: number, url: string): { html: string; fetchedAt: string } | null {
  const file = pageCacheFile(campaignId, url);
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { html?: string; fetchedAt?: string };
    return raw.html ? { html: raw.html, fetchedAt: raw.fetchedAt ?? "" } : null;
  } catch {
    return null;
  }
}

function writeCachedHtml(campaignId: number, url: string, html: string, fetchedAt: string): void {
  const file = pageCacheFile(campaignId, url);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ url: publicUrl(url), html, fetchedAt, bytes: html.length }, null, 2)}\n`);
}

export function inventoryStoredDocuments(campaignId: number, acceptedSellerHosts: string[]): StoredDocumentRow[] {
  const expansion = readCommercialExpansion(campaignId);
  const rows = new Map<string, StoredDocumentRow>();
  for (const item of expansion?.inventory ?? []) {
    const url = publicUrl(item.requestedUrl || item.finalUrl);
    const host = hostOf(url);
    const roles = classifyUrlRoles(url);
    const usableSellerHost = acceptedSellerHosts.some((itemHost) => host === itemHost || host.endsWith(`.${itemHost}`));
    const cached = readCachedHtml(campaignId, url);
    rows.set(url, {
      url,
      host,
      path: pathOf(url),
      inventoryExtracted: Boolean(item.extracted),
      inventoryHtmlBytes: item.htmlBytes ?? 0,
      htmlAvailable: Boolean(cached?.html),
      htmlBytes: cached?.html.length ?? 0,
      missing: cached?.html ? null : item.extracted ? "HTML was extracted in 54AE but the page body was not persisted." : "No stored HTML body.",
      sourceClass: item.sourceClass || "UNKNOWN",
      pageCategory: pageCategoryFromUrl(url),
      fetchable: roles.fetchable && !roles.checkout,
      checkout: roles.checkout,
      usableSellerHost,
    });
  }
  return [...rows.values()];
}

function contactTexts(html: string): string[] {
  const texts = [...extractParagraphs(html), ...extractListItems(html)].map(collapseText).filter(Boolean);
  return texts.filter((text) => /[\w.+-]+@[\w-]+\.\w+|\+?\d[\d\s()-]{7,}|customer support|order support|email support|toll[- ]free/i.test(text));
}

function quantityTexts(html: string): string[] {
  const texts = [...extractParagraphs(html), ...extractListItems(html)].map(collapseText).filter(Boolean);
  return texts.filter((text) => /\b(\d+)\s*(ml|fl\.?\s*oz|droppers?|servings?|bottles?|capsules?)\b/i.test(text) && !/select headline|affiliate terms/i.test(text));
}

export function extractOperationalFactsFromDocuments(input: {
  documents: Array<{ url: string; html: string; fetchedAt: string; sourceClass: string }>;
  accepted: FieldProposal[];
  existing: FactCandidate[];
}): OperationalExtract[] {
  const extracts: OperationalExtract[] = [];
  const seen = new Set<string>();
  const acceptedKeys = new Set(input.accepted.map((item) => keyOf(item.field, item.currentValue || item.suggestedValue)));
  const existingKeys = new Set(input.existing.map((item) => keyOf(item.field, item.text)));

  function push(partial: Omit<OperationalExtract, "verification" | "selfDeclared" | "evidenceId">) {
    const text = collapseText(partial.text);
    if (!text || text.length < 24) return;
    if (/order now|select headline|affiliate terms|96% of customers|loading video/i.test(text)) return;
    if (classifyEditorialText({ text, role: "OTHER" }).classification === "MEDICAL_OR_HEALTH_CLAIM") return;
    const field = partial.field;
    const key = keyOf(field, text);
    if (seen.has(key) || existingKeys.has(key) || acceptedKeys.has(key)) return;
    if (input.accepted.some((item) => collapseText(item.currentValue || item.suggestedValue).includes(text) || text.includes(collapseText(item.currentValue || item.suggestedValue)) && collapseText(item.currentValue || item.suggestedValue).length > 24)) {
      return;
    }
    seen.add(key);
    extracts.push({
      ...partial,
      text,
      excerpt: partial.excerpt || text,
      verification: "SELLER_STATED",
      selfDeclared: true,
      evidenceId: `ev-54ao-${createHash("sha1").update(key).digest("hex").slice(0, 10)}`,
    });
  }

  for (const document of input.documents) {
    const url = publicUrl(document.url);
    const roles = classifyUrlRoles(url);
    if (roles.checkout || HOP_HOST.test(hostOf(url)) || CLONE_HOST.test(hostOf(url))) continue;
    const cleaned = stripHiddenMarkup(document.html);
    const category = /return|refund/i.test(pathOf(url))
      ? "RETURNS"
      : /ship/i.test(pathOf(url))
        ? "SHIPPING"
        : CONTACT.test(pathOf(url))
          ? "FAQ"
          : pageCategoryFromUrl(url);
    const questions = pairQuestionsFromHtml(document.html);
    const operational = extractOperationalFactsFromHtml(document.html, url, category as "RETURNS" | "REFUNDS" | "SHIPPING" | "PRIMARY", document.fetchedAt, questions);
    const texts = [...extractParagraphs(cleaned), ...extractListItems(cleaned)];
    const returns = category === "RETURNS" || category === "REFUNDS"
      ? operational.returns.length
        ? operational.returns
        : extractReturnsFacts(texts, url, { sourcePageCategory: "RETURNS", retrievedAt: document.fetchedAt })
      : [];
    const shipping = category === "SHIPPING"
      ? operational.shipping.length
        ? operational.shipping
        : extractShippingFacts(texts, url, { sourcePageCategory: "SHIPPING", retrievedAt: document.fetchedAt, questions })
      : [];

    for (const item of shipping) {
      push({
        field: "faq",
        text: item.question ? `${item.question} ${item.statement}` : item.statement,
        excerpt: item.statement,
        sourceUrl: url,
        sourceClass: document.sourceClass || "SELLER",
        collectedAt: document.fetchedAt,
        conditions: [`Shipping kind ${item.kind}. Region or fee is not generalized.`],
        limitations: item.copyEligibility === "NO" ? ["Copy-ineligible shipping statement."] : ["Seller-stated shipping term. Not a manufacturer promise."],
      });
    }
    for (const item of returns) {
      push({
        field: "faq",
        text: item.statement,
        excerpt: item.statement,
        sourceUrl: url,
        sourceClass: document.sourceClass || "SELLER",
        collectedAt: document.fetchedAt,
        conditions: [`Returns kind ${item.kind}.`],
        limitations: ["Seller-stated return procedure. Does not replace the accepted 60-day guarantee fact."],
      });
    }
    if (CONTACT.test(pathOf(url))) {
      for (const text of contactTexts(cleaned)) {
        if (!/[\w.+-]+@[\w-]+\.\w+|\+?\d[\d\s()-]{7,}/.test(text)) continue;
        push({
          field: "faq",
          text,
          excerpt: text,
          sourceUrl: url,
          sourceClass: document.sourceClass || "SELLER",
          collectedAt: document.fetchedAt,
          conditions: ["Contact channel as published by the seller."],
          limitations: ["Seller contact is not manufacturer identity."],
        });
      }
    }
    if (category === "SHIPPING" || category === "RETURNS" || category === "REFUNDS" || category === "USAGE" || category === "PRODUCT_DETAILS") {
      const format = extractExplicitProductFormat(texts, url, { sourcePageCategory: category as "PRIMARY", retrievedAt: document.fetchedAt });
      if (format?.statement) {
        push({
          field: "howItWorks",
          text: format.statement,
          excerpt: format.statement,
          sourceUrl: url,
          sourceClass: document.sourceClass || "SELLER",
          collectedAt: document.fetchedAt,
          conditions: [`Format ${format.value}.`],
          limitations: ["Format taken from explicit seller text only."],
        });
      }
      for (const text of quantityTexts(cleaned)) {
        push({
          field: "faq",
          text,
          excerpt: text,
          sourceUrl: url,
          sourceClass: document.sourceClass || "SELLER",
          collectedAt: document.fetchedAt,
          conditions: ["Quantity or serving as written. Not inferred for other packages."],
          limitations: ["Do not invent bottle counts or prices."],
        });
      }
    }
  }
  return extracts;
}

async function defaultHtmlFetch(url: string): Promise<{ ok: boolean; html?: string; status?: number | null; reason?: string }> {
  const result = await fetchPublicHttps(url);
  if (!result.ok) return { ok: false, status: result.status, reason: result.reason };
  return { ok: true, html: result.body.toString("utf8"), status: result.status };
}

export async function recoverSellerInformationalHtml(input: {
  campaignId: number;
  documents: StoredDocumentRow[];
  fetchPage?: (url: string) => Promise<{ ok: boolean; html?: string; status?: number | null; reason?: string }>;
}): Promise<Array<{ url: string; html: string; fetchedAt: string; sourceClass: string; recovered: boolean }>> {
  const out: Array<{ url: string; html: string; fetchedAt: string; sourceClass: string; recovered: boolean }> = [];
  for (const document of input.documents) {
    if (!document.usableSellerHost || document.checkout || !document.fetchable) continue;
    if (!/shipping|return|refund|contact/i.test(document.path)) continue;
    const cached = readCachedHtml(input.campaignId, document.url);
    if (cached) {
      out.push({ url: document.url, html: cached.html, fetchedAt: cached.fetchedAt, sourceClass: document.sourceClass, recovered: false });
      continue;
    }
    const safe = inspectPublicHttpsUrl(document.url);
    if (!safe.ok) continue;
    const fetched = input.fetchPage
      ? await input.fetchPage(safe.url.toString())
      : await defaultHtmlFetch(safe.url.toString());
    if (!fetched.ok || !fetched.html) continue;
    const fetchedAt = new Date().toISOString();
    writeCachedHtml(input.campaignId, document.url, fetched.html, fetchedAt);
    out.push({ url: document.url, html: fetched.html, fetchedAt, sourceClass: document.sourceClass === "UNKNOWN" ? "SELLER" : document.sourceClass, recovered: true });
  }
  return out;
}

export async function extractAndPersistOperationalFacts(input: {
  campaignId: number;
  fetchPage?: (url: string) => Promise<{ ok: boolean; html?: string; status?: number | null; reason?: string }>;
  documents?: Array<{ url: string; html: string; fetchedAt: string; sourceClass: string }>;
}): Promise<OperationalExtractionResult> {
  const run = readLatestProductResearch(input.campaignId);
  const accepted = acceptedProposals(run);
  const acceptedSellerHosts = [...new Set(accepted.map((item) => hostOf(item.sourceUrl ?? "")).filter(Boolean))];
  const existing = loadExpansionCandidates(input.campaignId);
  const inventory = inventoryStoredDocuments(input.campaignId, acceptedSellerHosts);
  const recovered = input.documents ?? await recoverSellerInformationalHtml({
    campaignId: input.campaignId,
    documents: inventory,
    fetchPage: input.fetchPage,
  });
  const documents = recovered.map((item) => ({
    ...item,
    sourceClass: item.sourceClass === "UNKNOWN" ? "SELLER" : item.sourceClass,
  }));
  const extracts = extractOperationalFactsFromDocuments({ documents, accepted, existing });
  const previous = readOperationalCandidates(input.campaignId);
  const previousByKey = new Map(previous.map((item) => [keyOf(item.field, item.text), item]));
  const created: OperationalCandidateRecord[] = [];
  let createdCount = 0;
  let rejected = 0;
  for (const extract of extracts) {
    const validated = validateFactCandidate({
      proposal: {
        field: extract.field,
        currentValue: "",
        suggestedValue: extract.text,
        status: "SELLER_STATED",
        evidenceIds: [extract.evidenceId],
        sourceUrl: extract.sourceUrl,
        sourceClass: extract.sourceClass,
        verification: "SELLER_STATED",
        restriction: "PUBLISHABLE",
        collectedAt: extract.collectedAt,
        eligibleForBatch: false,
        notes: [...extract.conditions, ...extract.limitations],
        evidenceExcerpt: extract.excerpt,
        originalText: extract.excerpt,
        proposalKind: "RECOVERED_OPERATIONAL",
      },
      accepted,
    });
    if (!validated.usable) {
      rejected += 1;
      continue;
    }
    const existingRecord = previousByKey.get(keyOf(validated.field, validated.text));
    if (!existingRecord) createdCount += 1;
    created.push({
      ...validated,
      approvedForUse: false,
      candidateId: existingRecord?.candidateId ?? `54AO-${String(previous.length + createdCount).padStart(2, "0")}`,
      evidenceId: extract.evidenceId,
      conditions: extract.conditions,
      limitations: extract.limitations,
    });
  }
  const merged: OperationalCandidateRecord[] = [];
  for (const item of created) {
    const previousMatch = previousByKey.get(keyOf(item.field, item.text));
    merged.push(previousMatch ?? item);
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({
    urls: documents.map((item) => item.url).sort(),
    keys: merged.map((item) => keyOf(item.field, item.text)).sort(),
  })).digest("hex");
  const result: OperationalExtractionResult = {
    campaignId: input.campaignId,
    documents: inventory.map((item) => {
      const recoveredDoc = documents.find((doc) => doc.url === item.url);
      return recoveredDoc
        ? { ...item, htmlAvailable: true, htmlBytes: recoveredDoc.html.length, missing: null }
        : item;
    }),
    extracts,
    newCandidates: merged,
    duplicatesRejected: rejected,
    fingerprint,
  };
  const prior = existsSync(operationalFile(input.campaignId))
    ? JSON.parse(readFileSync(operationalFile(input.campaignId), "utf8")) as { fingerprint?: string; candidates?: OperationalCandidateRecord[] }
    : null;
  if (prior?.fingerprint === fingerprint && prior.candidates?.length === merged.length) {
    return { ...result, newCandidates: prior.candidates, fingerprint: prior.fingerprint ?? fingerprint };
  }
  return writeOperationalCandidates(result);
}

export function operationalCandidateToFact(item: OperationalCandidateRecord): StoredFactCandidate {
  return {
    field: item.field,
    text: item.text,
    sourceUrl: item.sourceUrl,
    sourceClass: item.sourceClass,
    excerpt: item.excerpt,
    collectedAt: item.collectedAt,
    verification: item.verification,
    usable: item.usable,
    approvedForUse: false,
    blockReason: item.blockReason,
    duplicateOf: item.duplicateOf,
    candidateId: item.candidateId,
  };
}

export function sellerHostAllowed(host: string, acceptedSellerHosts: string[]): boolean {
  const identity = classifySourceIdentity({ host, acceptedSellerHosts });
  return identity.role === "SELLER_OR_AFFILIATE" || identity.role === "MANUFACTURER";
}
