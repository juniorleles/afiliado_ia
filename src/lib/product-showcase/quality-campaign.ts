import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Campaign } from "@/lib/campaigns";
import { getCampaignById } from "@/lib/campaigns";
import { readAffiliateProgram } from "@/lib/affiliate-program";
import { readStoredLandingDocument } from "@/lib/landing-composer/store";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, isHealthDisclaimerEnabled } from "@/lib/public-site";
import { adaptLandingToShowcase } from "@/lib/product-showcase/adapt-campaign";
import {
  evaluateLpQuality,
  lighthouseProbeFromReport,
  type DomProbe,
  type LighthouseProbe,
  type LpQualityReport,
  type QualityEvidence,
  type ViewportProbe,
} from "@/lib/product-showcase/quality-gate";

const EVIDENCE_ROOT = path.join(process.cwd(), "data", "evidence");
const CURRENT_EVIDENCE = "premium-editorial-composition-v2";

type StoredViewport = {
  name?: string;
  width?: number;
  overflow?: boolean;
  file?: string;
  route?: string;
};

export function loadQualityEvidence(slug: string, presentationTemplate: string | null): QualityEvidence {
  const viewports = loadViewports(slug);
  const dom = loadDom(slug);
  return {
    viewports,
    dom: dom ? { ...dom, matchesSelectedTemplate: dom.matchesSelectedTemplate && presentationTemplate === "PRODUCT_SHOWCASE_PREMIUM_V1" } : null,
    lighthouse: loadLighthouse(slug),
    humanReview: "PENDING",
    humanReviewNote: "Visual review remains pending. A score cannot accept it.",
  };
}

export function evaluateCampaignQuality(campaignId: number): LpQualityReport | null {
  const campaign = getCampaignById(campaignId);
  const document = campaign ? readStoredLandingDocument(campaign.id) : null;
  if (!campaign || !document) return null;
  return evaluateStoredCampaign(campaign);
}

export function evaluateStoredCampaign(campaign: Campaign, evidence?: QualityEvidence): LpQualityReport | null {
  const document = readStoredLandingDocument(campaign.id);
  if (!document) return null;
  const model = adaptLandingToShowcase(campaign, document, {
    channel: "presell",
    siteName: "Product Reviews",
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: isHealthDisclaimerEnabled() ? HEALTH_DISCLAIMER_TEXT : null,
    footerLinks: [],
  });
  if (!model.adaptivePlan || !model.editorial) return null;
  const program = readAffiliateProgram(campaign.id);
  const facts = parseFacts(campaign.sourceFactsJson);
  return evaluateLpQuality({
    facts,
    plan: model.adaptivePlan,
    editorial: model.editorial,
    structuralGate: document.metadata.gates?.structural ?? null,
    policyGate: document.metadata.gates?.policy ?? null,
    presentationTemplate: campaign.presentationTemplate ?? null,
    ppc: program ? { brandPpc: program.brandPpc, genericSearchPpc: program.genericSearchPpc } : null,
    googleAdsPolicy: program?.googleAdsPolicy ?? null,
    directCheckoutLinking: program?.directCheckoutLinking ?? null,
    productSalesUrl: program?.productSalesUrl ?? null,
    evidence: evidence ?? loadQualityEvidence(campaign.slug, campaign.presentationTemplate ?? null),
  });
}

function parseFacts(json: string | null | undefined): import("@/lib/product-facts").ProductFacts | null {
  if (!json?.trim()) return null;
  try {
    const parsed = JSON.parse(json) as import("@/lib/product-facts").ProductFacts;
    if (!parsed || typeof parsed !== "object" || !parsed.confidence) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadViewports(slug: string): ViewportProbe[] | null {
  const summary = newestSummary();
  if (!summary) return null;
  const rows = (summary.viewports ?? []).filter((item) => item.name === slug && (item.width === 1440 || item.width === 768 || item.width === 390));
  if (rows.length < 3) return null;
  return rows.map((item) => ({
    width: item.width as 1440 | 768 | 390,
    overflow: item.overflow === true,
    file: item.file,
  }));
}

function loadDom(slug: string): DomProbe | null {
  const file = path.join(EVIDENCE_ROOT, CURRENT_EVIDENCE, "dom-checklist.json");
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as { pages?: Record<string, DomProbe> };
    return parsed.pages?.[slug] ?? null;
  } catch {
    return null;
  }
}

function loadLighthouse(slug: string): LighthouseProbe | null {
  const candidate = path.join(EVIDENCE_ROOT, CURRENT_EVIDENCE, `lighthouse-${slug}.json`);
  if (!existsSync(candidate)) return null;
  try {
    const parsed = JSON.parse(readFileSync(candidate, "utf8")) as {
      categories?: Record<string, { score?: number | null }>;
      audits?: Record<string, { score?: number | null }>;
    };
    return lighthouseProbeFromReport(parsed, candidate);
  } catch {
    return null;
  }
}

function newestSummary(): { viewports?: StoredViewport[] } | null {
  const file = path.join(EVIDENCE_ROOT, CURRENT_EVIDENCE, "summary.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as { viewports?: StoredViewport[] };
  } catch {
    return null;
  }
}
