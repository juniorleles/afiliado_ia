import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedProposals } from "@/lib/product-research/approved-facts";
import { readLatestProductResearch } from "@/lib/product-research/store";
import { fetchPublicHttps } from "@/lib/real-product-assets/fetch";
import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { qualityAssessmentRoot } from "@/lib/presell-quality/persist";
import { validateFactCandidate, type FactCandidate } from "@/lib/presell-quality/recovery";
import type { StoredFactCandidate } from "@/lib/presell-quality/candidate-ledger";
import { readOperationalCandidates } from "@/lib/presell-quality/operational-extract";
import { classifyEditorialText } from "@/lib/editorial-neutrality/classify";
import { inventoryPrimaryHtml, type PrimaryPageInventory } from "@/lib/campaign-sources/primary-extract";
import { renderPrimaryAffiliatePage, type PrimaryRenderResult } from "@/lib/campaign-sources/primary-render";
import {
  PRIMARY_AFFILIATE_LANDING_PAGE,
  publicLandingUrl,
  readPrimaryAffiliatePage,
  secondaryResearchAllowed,
  sourcePriorityOf,
} from "@/lib/campaign-sources/primary-page";
import { readUserProvidedAffiliateUrl } from "@/lib/campaign-sources/user-provided";
import type { ProductResearchField } from "@/lib/product-research/types";

export type PrimaryPageCandidate = FactCandidate & {
  candidateId: string;
  evidenceId: string;
  section: string;
  risk: "OPERATIONAL" | "HIGH_RISK";
  sourceKind: typeof PRIMARY_AFFILIATE_LANDING_PAGE;
};

export type PrimaryPageResearchResult = {
  campaignId: number;
  kind: typeof PRIMARY_AFFILIATE_LANDING_PAGE;
  publicUrl: string;
  accessStatus: "REACHED" | "BLOCKED" | "FAILED" | "NEEDS_ALTERNATIVE";
  renderStatus: string;
  extractionStatus: "COMPLETE" | "PARTIAL" | "BLOCKED" | "FAILED";
  rootCause: string;
  inventory: PrimaryPageInventory | null;
  expandedControls: number;
  transactionalClicks: 0;
  newCandidates: PrimaryPageCandidate[];
  duplicates: number;
  highRiskBlocked: number;
  commerciallyAuthorized: false;
  usedAsActiveCta: false;
  secondaryResearch: ReturnType<typeof secondaryResearchAllowed>;
  fingerprint: string;
};

function keyOf(field: string, text: string): string {
  return `${field}|${text.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

function primaryFile(campaignId: number): string {
  return path.join(qualityAssessmentRoot(), String(campaignId), "primary-54ar.json");
}

export function readPrimaryPageResearch(campaignId: number): PrimaryPageResearchResult | null {
  if (!existsSync(primaryFile(campaignId))) return null;
  try {
    return JSON.parse(readFileSync(primaryFile(campaignId), "utf8")) as PrimaryPageResearchResult;
  } catch {
    return null;
  }
}

export function readPrimaryPageCandidates(campaignId: number): PrimaryPageCandidate[] {
  return readPrimaryPageResearch(campaignId)?.newCandidates ?? [];
}

export function writePrimaryPageResearch(result: PrimaryPageResearchResult): PrimaryPageResearchResult {
  mkdirSync(path.dirname(primaryFile(result.campaignId)), { recursive: true });
  const serialized = JSON.parse(JSON.stringify(result)) as PrimaryPageResearchResult;
  writeFileSync(primaryFile(result.campaignId), `${JSON.stringify(serialized, null, 2)}\n`);
  return result;
}

function existingKeys(campaignId: number): Set<string> {
  const keys = new Set<string>();
  const expansion = path.join(qualityAssessmentRoot(), String(campaignId), "expansion-54ae.json");
  const ledger = path.join(qualityAssessmentRoot(), String(campaignId), "candidate-ledger.json");
  for (const file of [expansion, ledger]) {
    if (!existsSync(file)) continue;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as {
        factCandidates?: Array<{ field?: string; text?: string }>;
        candidates?: Array<{ field?: string; extractedValue?: string; text?: string }>;
      };
      for (const item of raw.factCandidates ?? []) {
        if (item.field && item.text) keys.add(keyOf(item.field, item.text));
      }
      for (const item of raw.candidates ?? []) {
        const text = item.extractedValue || item.text;
        if (item.field && text) keys.add(keyOf(item.field, text));
      }
    } catch {
      /* ignore */
    }
  }
  for (const item of readOperationalCandidates(campaignId)) keys.add(keyOf(item.field, item.text));
  return keys;
}

function blockedResult(
  campaignId: number,
  publicUrl: string,
  accessStatus: PrimaryPageResearchResult["accessStatus"],
  renderStatus: string,
  rootCause: string,
): PrimaryPageResearchResult {
  const missing = ["Primary page content was not inventoried."];
  return {
    campaignId,
    kind: PRIMARY_AFFILIATE_LANDING_PAGE,
    publicUrl,
    accessStatus,
    renderStatus,
    extractionStatus: accessStatus === "NEEDS_ALTERNATIVE" ? "BLOCKED" : "FAILED",
    rootCause,
    inventory: {
      requestedUrl: publicUrl,
      finalUrl: null,
      title: null,
      sections: [],
      faqs: [],
      images: [],
      facts: [],
      missing,
      extractionErrors: [rootCause],
    },
    expandedControls: 0,
    transactionalClicks: 0,
    newCandidates: [],
    duplicates: 0,
    highRiskBlocked: 0,
    commerciallyAuthorized: false,
    usedAsActiveCta: false,
    secondaryResearch: secondaryResearchAllowed({
      primaryProcessed: false,
      primaryReadAttempted: true,
      missingFields: missing,
    }),
    fingerprint: createHash("sha1").update(`${campaignId}|${publicUrl}|${rootCause}`).digest("hex"),
  };
}

export function candidatesFromPrimaryInventory(input: {
  campaignId: number;
  inventory: PrimaryPageInventory;
  accepted: ReturnType<typeof acceptedProposals>;
}): { created: PrimaryPageCandidate[]; duplicates: number; highRiskBlocked: number } {
  const existing = existingKeys(input.campaignId);
  const acceptedKeys = new Set(input.accepted.map((item) => keyOf(item.field, item.currentValue || item.suggestedValue)));
  const created: PrimaryPageCandidate[] = [];
  let duplicates = 0;
  let highRiskBlocked = 0;
  let index = 0;
  for (const fact of input.inventory.facts) {
    const key = keyOf(fact.field, fact.text);
    if (existing.has(key) || acceptedKeys.has(key)) {
      duplicates += 1;
      continue;
    }
    const medical = classifyEditorialText({ text: fact.text, role: "OTHER" }).classification === "MEDICAL_OR_HEALTH_CLAIM"
      || fact.risk === "HIGH_RISK";
    const validated = validateFactCandidate({
      proposal: {
        field: fact.field as ProductResearchField,
        currentValue: "",
        suggestedValue: fact.text,
        status: "SELLER_STATED",
        evidenceIds: [],
        sourceUrl: input.inventory.finalUrl || input.inventory.requestedUrl,
        sourceClass: "AFFILIATE_RESOURCE",
        verification: "SELLER_STATED",
        restriction: medical ? "BLOCKED" : "PUBLISHABLE",
        collectedAt: new Date().toISOString(),
        eligibleForBatch: false,
        notes: fact.conditions,
        evidenceExcerpt: fact.excerpt,
        originalText: fact.excerpt,
        proposalKind: "EXTRACTED",
      },
      accepted: input.accepted,
    });
    if (medical) {
      validated.usable = false;
      validated.blockReason = validated.blockReason || "Medical or efficacy language cannot be used on the presell without independent evidence.";
      highRiskBlocked += 1;
    }
    if (validated.duplicateOf) {
      duplicates += 1;
      continue;
    }
    existing.add(key);
    index += 1;
    created.push({
      ...validated,
      approvedForUse: false,
      candidateId: `54AR-${String(index).padStart(2, "0")}`,
      evidenceId: `ev-54ar-${createHash("sha1").update(key).digest("hex").slice(0, 10)}`,
      section: fact.section,
      risk: medical ? "HIGH_RISK" : "OPERATIONAL",
      sourceKind: PRIMARY_AFFILIATE_LANDING_PAGE,
    });
  }
  return { created, duplicates, highRiskBlocked };
}

export async function processPrimaryAffiliatePage(input: {
  campaignId: number;
  html?: string;
  visibleText?: string;
  title?: string | null;
  renderPage?: typeof renderPrimaryAffiliatePage;
  fetchPage?: typeof fetchPublicHttps;
}): Promise<PrimaryPageResearchResult> {
  const page = readPrimaryAffiliatePage(input.campaignId);
  const record = readUserProvidedAffiliateUrl(input.campaignId);
  if (!page || !record) {
    return blockedResult(input.campaignId, "", "FAILED", "NOT_CONFIGURED", "No user-provided primary affiliate page is registered.");
  }
  if (!page.readAllowed) {
    const result = blockedResult(input.campaignId, page.publicUrl, "BLOCKED", "SECURITY_BLOCKED", page.notes[0] ?? "Primary page read is not allowed.");
    return writePrimaryPageResearch(result);
  }

  let render: PrimaryRenderResult | null = null;
  let html = input.html ?? "";
  let visibleText = input.visibleText ?? "";
  let title = input.title ?? null;
  let finalUrl = page.publicUrl;

  if (!html) {
    const renderer = input.renderPage ?? renderPrimaryAffiliatePage;
    render = await renderer({ url: record.originalUrl, primary: page });
    if (render.ok && render.html) {
      html = render.html;
      visibleText = render.visibleText;
      title = render.title;
      finalUrl = render.finalUrl || page.publicUrl;
    } else if (render.status === "BROWSER_UNAVAILABLE") {
      const safe = inspectPublicHttpsUrl(record.originalUrl);
      if (safe.ok) {
        const fetched = await (input.fetchPage ?? fetchPublicHttps)(safe.url.toString());
        if (fetched.ok) {
          html = fetched.body.toString("utf8");
          finalUrl = publicLandingUrl(fetched.url);
        }
      }
      if (!html) {
        const result = blockedResult(input.campaignId, page.publicUrl, "NEEDS_ALTERNATIVE", render.status, render.reason ?? "Browser rendering was unavailable.");
        return writePrimaryPageResearch(result);
      }
    } else {
      const accessStatus = render.status === "NEEDS_ALTERNATIVE" || render.status === "CHECKOUT_REDIRECT_BLOCKED"
        ? render.status === "NEEDS_ALTERNATIVE" ? "NEEDS_ALTERNATIVE" : "BLOCKED"
        : "FAILED";
      const result = blockedResult(input.campaignId, page.publicUrl, accessStatus, render.status, render.reason ?? "Primary page was not rendered.");
      result.inventory = result.inventory
        ? { ...result.inventory, finalUrl: render.finalUrl }
        : result.inventory;
      return writePrimaryPageResearch(result);
    }
  }

  const inventory = inventoryPrimaryHtml({
    html,
    visibleText,
    requestedUrl: page.publicUrl,
    finalUrl,
    title,
  });
  const accepted = acceptedProposals(readLatestProductResearch(input.campaignId));
  const { created, duplicates, highRiskBlocked } = candidatesFromPrimaryInventory({
    campaignId: input.campaignId,
    inventory,
    accepted,
  });
  const complete = inventory.sections.length > 0 && inventory.extractionErrors.length === 0;
  const result: PrimaryPageResearchResult = {
    campaignId: input.campaignId,
    kind: PRIMARY_AFFILIATE_LANDING_PAGE,
    publicUrl: page.publicUrl,
    accessStatus: "REACHED",
    renderStatus: render?.status ?? (input.html ? "HTTP_OR_PROVIDED" : "RENDERED"),
    extractionStatus: complete ? "COMPLETE" : "PARTIAL",
    rootCause: complete
      ? "User-provided primary page was inventoried. Generic checkout classification no longer skips this registered URL."
      : inventory.extractionErrors[0] ?? inventory.missing[0] ?? "Primary page was only partially inventoried.",
    inventory,
    expandedControls: render?.expandedControls ?? 0,
    transactionalClicks: 0,
    newCandidates: created,
    duplicates,
    highRiskBlocked,
    commerciallyAuthorized: false,
    usedAsActiveCta: false,
    secondaryResearch: secondaryResearchAllowed({
      primaryProcessed: true,
      primaryReadAttempted: true,
      missingFields: inventory.missing,
    }),
    fingerprint: createHash("sha1").update(JSON.stringify({
      url: inventory.requestedUrl,
      facts: created.map((item) => keyOf(item.field, item.text)),
      faqs: inventory.faqs.map((item) => item.question),
    })).digest("hex"),
  };
  void sourcePriorityOf({ url: record.originalUrl, campaignId: input.campaignId });
  return writePrimaryPageResearch(result);
}

export function primaryCandidateToFact(item: PrimaryPageCandidate): StoredFactCandidate {
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
