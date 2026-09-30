// Shared publication fixture. The gate refuses incomplete rows, so tests that
// publish must supply this known READY record. Fictional product only.
import { emptyProductFacts } from "../../src/lib/product-facts.ts";
import type { CampaignInput } from "../../src/lib/campaigns.ts";

export const READY_PUBLICATION_BODY = `This winter jacket is a mid-weight insulated layer for daily cold weather. It is not a medical device and this page does not promise an extraordinary outcome.

## What Is The XT-200?

A synthetic-fill coat meant for walking and commuting when temperatures drop. It is a clothing product, not a treatment.

## Key Features

- Insulated core for ordinary winter days
- Machine-washable outer shell
- Standard front zipper and pockets

## Who May Consider It?

People who want a practical winter coat for short outdoor trips, school runs, or a cold commute.

## Things to Consider

Fit can run large. Check the merchant size chart before you buy. Weather protection depends on what you wear underneath.

## FAQ

- Does it replace a technical mountaineering suit? No. It is a daily winter jacket.
- Can I machine wash it? The product information describes a washable shell.

## Final Thoughts

A straightforward option if you need warmth for ordinary winter days and you already like this silhouette.
`;

export function readySourceFactsJson(): string {
  const facts = emptyProductFacts("Winter Jacket XT-200", "https://example.com/jacket", "MANUAL");
  facts.description = READY_PUBLICATION_BODY;
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = [
    "Insulated core for ordinary winter days",
    "Machine-washable outer shell",
    "Standard front zipper and pockets",
  ];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  return JSON.stringify(facts);
}

export function readyPublicationInput(overrides: Partial<CampaignInput> = {}): CampaignInput {
  return {
    name: "Publication fixture",
    slug: "publication-fixture",
    headline: "Winter Jacket XT-200 Review: Does It Actually Keep You Warm?",
    body: READY_PUBLICATION_BODY,
    ctaLabel: "Check current price",
    affiliateUrl: "https://example.com/hop",
    headScript: null,
    adHeadline: null,
    sourceFactsJson: readySourceFactsJson(),
    ...overrides,
  };
}
