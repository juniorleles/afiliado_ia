/**
 * Internal publication workflow (Phase 2.5).
 *
 * This is NOT Google/Meta approval. READY means our linter found no
 * heuristic warns/fails — not that an ads platform will accept the page.
 *
 * Production publish path: publishCampaignAction → tryPublish → publishCampaign.
 * publishCampaign repeats the gate inside one write transaction. A failed
 * gate does not change publication status.
 */

import type { Campaign } from "@/lib/campaigns";
import { lintCampaign, type PublicationGate } from "@/lib/policy-linter";
import { presellPageFaqAuthorityBindings } from "@/lib/ai/presell-faq-authority";
import { composePublicationGate, validateGrounding } from "@/lib/ai/grounding-validator";
import { applyGenericFaqRecovery } from "@/lib/faq-field-promotion";
import { applyProductionCandidate } from "@/lib/production-candidate-view";
import { consumerVisibleText, parsePresellPage } from "@/lib/presell-page";
import type { ProductFacts } from "@/lib/product-facts";
import { withResolvedCampaign } from "@/lib/manual-overrides";

function filled(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

/**
 * Structural record required before grounding and policy are even consulted.
 * Incomplete rows are not publishable. This does not judge copy.
 */
export function publicationBlockReason(campaign: Campaign): string | null {
  const rawFacts = filled(campaign.sourceFactsJson);
  if (!rawFacts) {
    return "Publishing refused: sourceFactsJson is required. Absence is not treated as an empty fact set.";
  }
  try {
    const parsed = JSON.parse(rawFacts) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return "Publishing refused: sourceFactsJson is required. Absence is not treated as an empty fact set.";
    }
  } catch {
    return "Publishing refused: sourceFactsJson is required. Absence is not treated as an empty fact set.";
  }
  if (!filled(campaign.name) || !filled(campaign.slug) || !filled(campaign.headline) || !filled(campaign.ctaLabel)) {
    return "Publishing refused: required metadata is missing.";
  }
  let tracking = false;
  try {
    const url = new URL(campaign.affiliateUrl);
    tracking = url.protocol === "http:" || url.protocol === "https:";
  } catch {
    tracking = false;
  }
  if (!tracking) return "Publishing refused: a tracking destination is required.";
  const presentation =
    parsePresellPage(campaign.productionPageComposition) ?? parsePresellPage(campaign.pageComposition);
  if (!presentation && !filled(campaign.body)) return "Publishing refused: a presentation is required.";
  return null;
}

export const PUBLICATION_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type PublicationStatus = (typeof PUBLICATION_STATUS)[keyof typeof PUBLICATION_STATUS];

export function isPublishedStatus(status: string): status is "published" {
  return status === PUBLICATION_STATUS.PUBLISHED;
}

/**
 * Public availability. This is the stored publication status and nothing else.
 * A row can be published only after the publication gate has passed, so a
 * published campaign is the public page. Drafts, previews, and legacy rows
 * that never passed the gate are not published.
 */
export function isReleasePublication(campaign: Pick<Campaign, "publicationStatus">): boolean {
  return campaign.publicationStatus === PUBLICATION_STATUS.PUBLISHED;
}

export type PublishDecision = "allow" | "block" | "confirm";

export function isPublishableContentGate(gate: PublicationGate): boolean {
  return gate === "READY";
}

/**
 * Only READY may become /p/[slug]. confirmWarnings never upgrades
 * REVIEW_REQUIRED into a publishable state.
 */
export function decidePublish(gate: PublicationGate, _confirmWarnings: boolean): PublishDecision {
  if (gate === "READY") return "allow";
  if (gate === "REVIEW_REQUIRED") return "confirm";
  return "block";
}

export type TryPublishResult =
  | { ok: true; gate: PublicationGate }
  | {
      ok: false;
      gate: PublicationGate;
      error: string;
      needsConfirmation?: boolean;
    };

function factsSnapshot(campaign: Campaign): ProductFacts | null {
  if (!campaign.sourceFactsJson) return null;
  try {
    const parsed = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function consumerCopy(campaign: Campaign): string {
  const page = parsePresellPage(campaign.pageComposition);
  return page ? consumerVisibleText(page) : `${campaign.headline}\n${campaign.body}\n${campaign.ctaLabel}`;
}

/**
 * Policy + composed consumer copy Grounding. Missing/unreadable
 * sourceFactsJson fails closed (BLOCKED). Does not infer "no claims".
 */
export function resolvePublicationGate(campaign: Campaign): PublicationGate {
  const rendered = withResolvedCampaign(applyProductionCandidate(campaign));
  const policyGate = lintCampaign(rendered).gate;
  const facts = factsSnapshot(rendered);
  if (!facts) return "BLOCKED";
  const recovered = applyGenericFaqRecovery(facts);
  const page = parsePresellPage(rendered.pageComposition);
  const faqAuthorities = page ? presellPageFaqAuthorityBindings(page, recovered) : [];
  return composePublicationGate(
    policyGate,
    validateGrounding(consumerCopy(rendered), recovered, { faqAuthorities }).status,
  );
}

/**
 * Single place that turns Policy Linter V2 and post-composition Grounding
 * into a publish verdict. Persistence stays in campaigns.ts.
 */
export function tryPublish(campaign: Campaign, confirmWarnings: boolean): TryPublishResult {
  const viewed = withResolvedCampaign(campaign);
  const structural = publicationBlockReason(viewed);
  if (structural) {
    return { ok: false, gate: "BLOCKED", error: structural };
  }
  let gate: PublicationGate;
  try {
    gate = resolvePublicationGate(viewed);
  } catch {
    return {
      ok: false,
      gate: "BLOCKED",
      error: "Publishing refused: the publication gate could not read this campaign.",
    };
  }
  const decision = decidePublish(gate, confirmWarnings);

  if (decision === "block") {
    return {
      ok: false,
      gate,
      error:
        gate === "BLOCKED" && !factsSnapshot(viewed)
          ? "Publishing refused: sourceFactsJson is required. Absence is not treated as an empty fact set."
          : "Publishing refused: CONTENT_GATE is BLOCKED. This is an internal risk decision, not advertising-platform approval.",
    };
  }

  if (decision === "confirm") {
    return {
      ok: false,
      gate,
      needsConfirmation: true,
      error:
        "REVIEW_REQUIRED cannot publish. Confirming warnings does not make this READY. Resolve findings until the gate is READY.",
    };
  }

  return { ok: true, gate };
}
