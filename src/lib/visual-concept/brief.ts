import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Campaign } from "@/lib/campaigns";
import { applyProductionCandidate } from "@/lib/production-candidate";
import { getConsumerCopyEligibleFacts, type ProductFacts } from "@/lib/product-facts";
import { loadResolvedProductFacts } from "@/lib/manual-overrides";
import { parsePresellPage, type PresellPage } from "@/lib/presell-page";
import { localMediaRoot } from "@/lib/storage/local";
import { FORBIDDEN_CLAIMS, FORBIDDEN_VISUAL_PATTERNS } from "@/lib/visual-concept/firewall";
import type { VisualAssetRecord, VisualBrief } from "@/lib/visual-concept/types";

function pushText(out: string[], value: string | null | undefined) {
  const text = value?.replace(/\s+/g, " ").trim();
  if (text) out.push(text);
}

export function visibleConsumerCopy(page: PresellPage): string[] {
  const out: string[] = [];
  pushText(out, page.hero.headline);
  pushText(out, page.hero.subheadline);
  pushText(out, page.hero.summary);
  for (const highlight of page.hero.highlights) pushText(out, highlight);
  pushText(out, page.ctaLabel);
  for (const section of page.sections) {
    if (!section.visible) continue;
    pushText(out, section.title);
    for (const paragraph of section.paragraphs) pushText(out, paragraph);
    for (const bullet of section.bullets) pushText(out, bullet);
    for (const card of section.cards) {
      pushText(out, card.title);
      pushText(out, card.body);
    }
    for (const item of section.faq) {
      pushText(out, item.question);
      pushText(out, item.answer);
    }
  }
  return [...new Set(out)];
}

export function contentVersionFor(copy: string[]): string {
  return createHash("sha256").update(JSON.stringify(copy)).digest("hex");
}

function factsFromCampaign(campaign: Campaign): ProductFacts | null {
  return loadResolvedProductFacts(campaign);
}

export function resolvePackshotPath(src: string | null | undefined): string | null {
  if (!src || !src.startsWith("/media/product/")) return null;
  const filename = path.basename(src);
  if (!filename || filename === "." || filename === "..") return null;
  const file = path.join(localMediaRoot(), filename);
  return existsSync(file) ? file : null;
}

export function inventoryPermittedAssets(campaign: Campaign): VisualAssetRecord[] {
  const provenance = campaign.productImageProvenance;
  const permitted = provenance === "DIRECT_SOURCE" || provenance === "MANUAL";
  const src = campaign.productImageSrc ?? null;
  if (!permitted || !src) return [];
  return [
    {
      id: `packshot:${path.basename(src)}`,
      role: "PRODUCT_PACKSHOT",
      provenance,
      src,
      authoritativeForAppearance: true,
      isEvidence: false,
      imageTextReimportAllowed: false,
    },
  ];
}

export function buildVisualBrief(campaign: Campaign): VisualBrief | null {
  const view = applyProductionCandidate(campaign);
  const page = parsePresellPage(view.pageComposition);
  if (!page) return null;
  const facts = factsFromCampaign(campaign);
  const eligible = facts ? getConsumerCopyEligibleFacts(facts) : null;
  const name = page.hero.headline.trim() || eligible?.productName || "";
  const affiliate = campaign.affiliateUrl?.trim() || "";
  const allowedCopy = visibleConsumerCopy(page).filter((line) => !affiliate || !line.includes(affiliate));
  const assets = inventoryPermittedAssets(view);
  return {
    campaignId: campaign.id,
    campaignSlug: campaign.slug,
    contentVersion: contentVersionFor(allowedCopy),
    productIdentity: { name },
    categoryContext: null,
    allowedCopy,
    availableAssets: assets,
    visualIdentity: { derivedFrom: "VALIDATED_CONSUMER_COPY_AND_PERMITTED_ASSETS" },
    designObjectives: [
      "Produce a full-page premium ecommerce website design mockup, not an advertisement or poster.",
      "Use only permitted consumer copy. Do not invent slogans, benefits, testimonials, ratings, certifications, prices, or results.",
      "Keep the real packshot authoritative. Do not treat generated pixels as a new product label.",
    ],
    forbiddenClaims: [...FORBIDDEN_CLAIMS],
    forbiddenVisualPatterns: [...FORBIDDEN_VISUAL_PATTERNS],
    sourceReferences: assets.map((asset) => asset.id),
  };
}
