import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCampaignBySlug } from "@/lib/campaigns";
import { CampaignTemplate } from "@/components/campaign-template";
import { PublicFooter } from "@/components/public-footer";
import { PresellThemeRoot } from "@/components/presell/presell-theme";
import "@/app/web-anatomy-lab.css";

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
  const campaign = getCampaignBySlug(slug);
  if (!campaign) notFound();
  const experimentB = exp === "b";

  return (
    <PresellThemeRoot campaign={campaign}>
      <div data-visual-qa-frame="1" data-wa-lab="v1" {...(experimentB ? { "data-wa-exp": "b" } : {})}>
        <style>{`nextjs-portal,[data-next-badge-root]{display:none!important;}`}</style>
        <CampaignTemplate campaign={campaign} renderPixel={false} trackClicks={false} disableAffiliateNavigation />
        <PublicFooter />
      </div>
    </PresellThemeRoot>
  );
}
