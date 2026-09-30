import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignBySlug } from "@/lib/campaigns";
import { withResolvedCampaign } from "@/lib/manual-overrides";
import { CampaignTemplate } from "@/components/campaign-template";
import { PublicFooter } from "@/components/public-footer";
import { PresellThemeRoot } from "@/components/presell/presell-theme";
import { resolvePresellRenderAssets } from "@/lib/presell-render-assets-server";
import { campaignForExperimentC } from "@/lib/web-anatomy-lab/experiment-c";
import { campaignForPremiumFinalCandidate } from "@/lib/web-anatomy-lab/premium-final-candidate-v1";
import "@/app/web-anatomy-lab.css";
import "@/app/premium-final-candidate.css";

/**
 * Isolated Web Anatomy Lab V1 frame. Not a public URL.
 * Premium Visual System V1 remains on /visual-frame/[slug].
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Web Anatomy Lab frame",
};

export default async function VisualFrameLabPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ exp?: string }>;
}) {
  const { slug } = await params;
  const { exp } = await searchParams;
  const stored = getCampaignBySlug(slug);
  if (!stored) notFound();
  const campaign = withResolvedCampaign(stored);
  const experiment = exp === "b" || exp === "c" || exp === "final" ? exp : null;
  const viewCampaign =
    experiment === "final"
      ? campaignForPremiumFinalCandidate(campaign)
      : experiment === "c"
        ? campaignForExperimentC(campaign)
        : campaign;

  return (
    <PresellThemeRoot campaign={viewCampaign}>
      <div
        data-visual-qa-frame="1"
        data-wa-lab="v1"
        {...(experiment ? { "data-wa-exp": experiment } : {})}
        {...(experiment === "c" || experiment === "final" ? { "data-wa-content": "v4" } : {})}
      >
        <style>{`nextjs-portal,[data-next-badge-root]{display:none!important;}`}</style>
        <CampaignTemplate
          campaign={viewCampaign}
          renderPixel={false}
          trackClicks={false}
          disableAffiliateNavigation
          renderAssets={resolvePresellRenderAssets(viewCampaign)}
        />
        <PublicFooter />
      </div>
    </PresellThemeRoot>
  );
}
