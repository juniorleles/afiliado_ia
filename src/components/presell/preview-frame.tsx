import type { Campaign } from "@/lib/campaigns";
import type { LandingDocument } from "@/lib/landing-composer/types";
import { CampaignTemplate } from "@/components/campaign-template";
import { withBuilderMedia } from "@/lib/lp-media-render";
import { resolvePresellRenderAssets } from "@/lib/presell-render-assets-server";

/** Server component (admin preview). */
export function PreviewFrame({ campaign, document = null }: { campaign: Campaign; document?: LandingDocument | null }) {
  const presented = withBuilderMedia(campaign, resolvePresellRenderAssets(campaign));
  return <CampaignTemplate campaign={presented.campaign} document={document} disableAffiliateNavigation renderAssets={presented.assets} />;
}
