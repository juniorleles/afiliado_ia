/**
 * Applies stored builder overrides onto a campaign clone for rendering.
 * The stored page composition and ProductFacts are not written.
 */

import type { Campaign } from "@/lib/campaigns";
import { AFFILIATE_DISCLOSURE_TEXT, TRUST_EDITORIAL } from "@/lib/public-site";
import { parsePresellPage, serializePresellPage } from "@/lib/presell-page";
import { presentOffers } from "@/lib/presell-presentation";
import type { ProductFacts } from "@/lib/product-facts";
import {
  applyEffectiveContent,
  projectContentFields,
  projectLooseFields,
  resolveContentFields,
  type ContentContext,
  type ResolvedContentField,
} from "@/lib/lp-builder/content";
import { listBuilderAudit, listBuilderOverrides, type BuilderAuditRow } from "@/lib/lp-builder/store";

export function contentContextForCampaign(campaign: Campaign): ContentContext {
  let facts: ProductFacts | null = null;
  if (campaign.sourceFactsJson) {
    try {
      facts = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
    } catch {
      facts = null;
    }
  }
  const offers = presentOffers(facts);
  const shipping = offers.map((offer) => offer.shipping?.trim() ?? "").filter(Boolean).join("\n");
  return {
    disclosure: AFFILIATE_DISCLOSURE_TEXT,
    footer: TRUST_EDITORIAL.paragraphs[0],
    pricing: offers.map((offer) => ({ title: offer.name, description: "" })),
    shipping,
  };
}

function fieldsFor(campaign: Campaign): ResolvedContentField[] {
  const context = contentContextForCampaign(campaign);
  const page = parsePresellPage(campaign.pageComposition);
  const generated = page
    ? projectContentFields(page, context)
    : projectLooseFields({
        headline: campaign.headline,
        subheadline: campaign.subheadline ?? "",
        ctaLabel: campaign.ctaLabel,
        disclosure: context.disclosure,
        footer: context.footer,
      });
  const rows = listBuilderOverrides(campaign.id).map((row) => ({
    fieldId: row.fieldId,
    value: row.value,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    version: row.version,
  }));
  return resolveContentFields(generated, rows);
}

export function withBuilderContent(campaign: Campaign): Campaign {
  const page = parsePresellPage(campaign.pageComposition);
  const fields = fieldsFor(campaign);
  if (!fields.some((item) => item.modified)) return campaign;
  if (!page) {
    return {
      ...campaign,
      headline: fields.find((item) => item.id === "hero.headline")?.effective ?? campaign.headline,
      subheadline: fields.find((item) => item.id === "hero.subheadline")?.effective ?? campaign.subheadline,
      ctaLabel: fields.find((item) => item.id === "hero.cta")?.effective ?? campaign.ctaLabel,
    };
  }
  const next = applyEffectiveContent(page, fields);
  return {
    ...campaign,
    headline: next.hero.headline,
    subheadline: next.hero.subheadline,
    ctaLabel: next.ctaLabel,
    pageComposition: serializePresellPage(next),
  };
}

export function builderEditorState(campaign: Campaign): { fields: ResolvedContentField[]; audit: BuilderAuditRow[] } {
  return { fields: fieldsFor(campaign), audit: listBuilderAudit(campaign.id) };
}
