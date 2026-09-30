import { listPublishedCampaigns, type Campaign } from "@/lib/campaigns";
import { isReleasePublication } from "@/lib/publication";
import { presellMetaDescription } from "@/lib/presell-meta";
import { parsePresellPage } from "@/lib/presell-page";
import { resolvePresellRenderAssets } from "@/lib/presell-render-assets-server";
import { applyProductionCandidate } from "@/lib/production-candidate-view";
import { loadResolvedProductFacts } from "@/lib/manual-overrides";

/** Server-only. Cards restate the published page's own approved hero copy; nothing is scored or ranked. */
export type ReviewCard = {
  slug: string;
  href: string;
  title: string;
  summary: string;
  productName: string;
  image: { src: string; alt: string; width?: number; height?: number } | null;
  publishedAt: string;
};

function productNameFromFacts(campaign: Campaign): string {
  return loadResolvedProductFacts(campaign)?.productName?.trim() || "";
}

function sameText(a: string, b: string): boolean {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

export function reviewCardFor(stored: Campaign): ReviewCard {
  const campaign = applyProductionCandidate(stored);
  const page = parsePresellPage(campaign.pageComposition);
  const title = (page?.hero.headline || campaign.headline).trim();
  const summary =
    [page?.hero.subheadline, page?.hero.summary, campaign.subheadline, presellMetaDescription(campaign.headline, campaign.body)]
      .map((value) => value?.trim() ?? "")
      .find((value) => value && !sameText(value, title)) ?? "";
  const productName = productNameFromFacts(campaign) || title;

  const shot = resolvePresellRenderAssets(campaign).productVisuals.heroPrimary;
  const pageImage = page?.hero.image.src && page.hero.image.provenance !== "PLACEHOLDER" ? page.hero.image.src : null;
  const storedImage = campaign.productImageSrc && campaign.productImageProvenance !== "PLACEHOLDER" ? campaign.productImageSrc : null;
  const image = shot
    ? { src: shot.src, alt: productName, width: shot.width, height: shot.height }
    : pageImage || storedImage
      ? { src: (pageImage || storedImage) as string, alt: productName }
      : null;

  return {
    slug: campaign.slug,
    href: `/p/${campaign.slug}`,
    title,
    summary,
    productName,
    image,
    publishedAt: campaign.publishedAt ?? campaign.updatedAt,
  };
}

/** Currently published campaigns only, newest publication first. */
export function publishedReviewCards(): ReviewCard[] {
  return listPublishedCampaigns()
    .filter(isReleasePublication)
    .slice()
    .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt))
    .map(reviewCardFor);
}
