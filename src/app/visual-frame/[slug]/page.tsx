import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignBySlug } from "@/lib/campaigns";
import { withResolvedCampaign } from "@/lib/manual-overrides";
import { applyLandingDocument } from "@/lib/landing-composer/apply";
import { readStoredLandingDocument } from "@/lib/landing-composer/store";
import { withBuilderContent } from "@/lib/lp-content-render";
import { withBuilderMedia } from "@/lib/lp-media-render";
import { CampaignTemplate } from "@/components/campaign-template";
import { ShowcaseLanding } from "@/components/presell/showcase-landing";
import { presentationUsesShowcase } from "@/lib/product-showcase/adapt";
import { PublicFooter } from "@/components/public-footer";
import { PresellThemeRoot } from "@/components/presell/presell-theme";

/**
 * Chrome-free rendered presell for Visual QA (Phase 7).
 * Drafts are allowed, same as admin preview. Not a public URL.
 * Never records PAGE_VIEW, never fires the pixel, never tracks CTA clicks.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Visual QA frame",
};

export default async function VisualFramePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stored = getCampaignBySlug(slug);
  if (!stored) notFound();
  const document = readStoredLandingDocument(stored.id);
  const prepared = withBuilderMedia(withBuilderContent(applyLandingDocument(withResolvedCampaign(stored), document)));
  const campaign = prepared.campaign;

  return presentationUsesShowcase(stored.presentationTemplate) && document ? (
    <div data-visual-qa-frame="1">
      <style>{`nextjs-portal,[data-next-badge-root]{display:none!important;}`}</style>
      <ShowcaseLanding campaign={campaign} document={document} disableAffiliateNavigation />
    </div>
  ) : (
    <PresellThemeRoot campaign={campaign}>
      <div data-visual-qa-frame="1">
        <style>{`nextjs-portal,[data-next-badge-root]{display:none!important;}`}</style>
        <CampaignTemplate
          campaign={campaign}
          document={document}
          renderPixel={false}
          trackClicks={false}
          disableAffiliateNavigation
          renderAssets={prepared.assets}
        />
        {document ? null : <PublicFooter />}
      </div>
    </PresellThemeRoot>
  );
}
