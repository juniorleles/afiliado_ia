/**
 * Internal publication workflow (Phase 2.5).
 *
 * This is NOT Google/Meta approval. READY means our linter found no
 * heuristic warns/fails — not that an ads platform will accept the page.
 *
 * Production publish path: publishCampaignAction → tryPublish → publishCampaign.
 * publishCampaign() is persistence-only and must not be called from a
 * production UI/API path without tryPublish.
 */

import type { Campaign } from "@/lib/campaigns";
import { lintCampaign, type PublicationGate } from "@/lib/policy-linter";
import { composePublicationGate, validateGrounding } from "@/lib/ai/grounding-validator";
import { consumerVisibleText, parsePresellPage } from "@/lib/presell-page";
import type { ProductFacts } from "@/lib/product-facts";

export const PUBLICATION_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type PublicationStatus = (typeof PUBLICATION_STATUS)[keyof typeof PUBLICATION_STATUS];

export function isPublishedStatus(status: string): status is "published" {
  return status === PUBLICATION_STATUS.PUBLISHED;
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
  const policyGate = lintCampaign(campaign).gate;
  const facts = factsSnapshot(campaign);
  if (!facts) return "BLOCKED";
  return composePublicationGate(policyGate, validateGrounding(consumerCopy(campaign), facts).status);
}

/**
 * Single place that turns Policy Linter V2 and post-composition Grounding
 * into a publish verdict. Persistence stays in campaigns.ts.
 */
export function tryPublish(campaign: Campaign, confirmWarnings: boolean): TryPublishResult {
  const gate = resolvePublicationGate(campaign);
  const decision = decidePublish(gate, confirmWarnings);

  if (decision === "block") {
    return {
      ok: false,
      gate,
      error:
        gate === "BLOCKED" && !factsSnapshot(campaign)
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
