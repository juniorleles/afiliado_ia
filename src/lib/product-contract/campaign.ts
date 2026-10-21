import type { Campaign } from "@/lib/campaigns";
import { isPublishedStatus } from "@/lib/publication";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  getPublicSiteName,
  getPublicSiteUrl,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";
import type { ProductFacts } from "@/lib/product-facts";
import { resolveCampaignProductAssets } from "@/lib/product-assets/campaign";
import { buildProductContract } from "@/lib/product-contract/build";
import type { BuildResult } from "@/lib/product-contract/types";
import { buildAdaptivePlan } from "@/lib/product-showcase/adaptive-plan";
import { buildEditorialDocument, editorialLead } from "@/lib/product-showcase/editorial";

/**
 * Server adapter: a stored campaign in, a ProductContract out.
 *
 * Read-only. It does not write the database, migrate a campaign, change a link or publish. The
 * campaign supplies exactly what it supplies to the legacy renderers today (stored facts, the
 * approved assets contract, the authorized link and label); nothing is added for any one campaign.
 */

function storedFacts(campaign: Campaign): ProductFacts | null {
  if (!campaign.sourceFactsJson) return null;
  try {
    const parsed = JSON.parse(campaign.sourceFactsJson) as ProductFacts;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function buildCampaignContract(campaign: Campaign, options: { previewOnly?: boolean } = {}): BuildResult {
  const facts = storedFacts(campaign);
  // The lead is the editorial lead of the introduction block: a line traced as the proposition.
  const plan = buildAdaptivePlan({ facts });
  const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
  const introduction = editorial.blocks.find((block) => block.id === "introduction");
  const { lead, summary } = editorialLead(introduction);

  return buildProductContract({
    facts,
    slug: campaign.slug,
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    assets: resolveCampaignProductAssets(campaign).contract,
    cta: { href: campaign.affiliateUrl, label: campaign.ctaLabel, previewOnly: options.previewOnly },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      // The site-wide switch is kept: on means every page shows the disclaimer, as the current renderers do.
      healthDisclaimerPolicy: isHealthDisclaimerEnabled() ? "ALWAYS" : "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
    valueProposition: { headline: lead, supporting: summary },
    published: isPublishedStatus(campaign.publicationStatus),
  });
}
