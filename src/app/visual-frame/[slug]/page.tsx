import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignBySlug } from "@/lib/campaigns";
import { CampaignTemplate } from "@/components/campaign-template";
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
  const campaign = getCampaignBySlug(slug);
  if (!campaign) notFound();

  return (
    <PresellThemeRoot campaign={campaign}>
      <div data-visual-qa-frame="1">
        <style>{`nextjs-portal,[data-next-badge-root]{display:none!important;}`}</style>
        <CampaignTemplate campaign={campaign} renderPixel={false} trackClicks={false} disableAffiliateNavigation />
        <PublicFooter />
      </div>
    </PresellThemeRoot>
  );
}
