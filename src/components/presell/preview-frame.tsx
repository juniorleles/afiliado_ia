import type { Campaign } from "@/lib/campaigns";
import { CampaignTemplate } from "@/components/campaign-template";
import { withBuilderMedia } from "@/lib/lp-media-render";
import { resolvePresellRenderAssets } from "@/lib/presell-render-assets-server";

/** Server component (admin preview). */
export function PreviewFrame({ campaign }: { campaign: Campaign }) {
  const presented = withBuilderMedia(campaign, resolvePresellRenderAssets(campaign));
  return <CampaignTemplate campaign={presented.campaign} disableAffiliateNavigation renderAssets={presented.assets} />;
}
