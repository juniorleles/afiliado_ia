import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaignBySlug } from "@/lib/campaigns";
import { PreviewFrame } from "@/components/presell/preview-frame";
import { PublicFooter } from "@/components/public-footer";
import { DesignStudioPanel } from "@/components/admin/design-studio-panel";
import { getLatestVisualQaReport } from "@/lib/visual-qa/store";
import { snapshotContentGate } from "@/lib/visual-qa/run";
import { designPlanForCampaign } from "@/components/presell/presell-theme";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const campaign = getCampaignBySlug(slug);

  if (!campaign) {
    notFound();
  }

  const unpublished = campaign.publicationStatus !== "published";
  const plan = designPlanForCampaign(campaign);

  return (
    <div data-preview-wide>
      <div className="border-b border-amber-500/50 bg-amber-950/70 px-6 py-3 text-center text-sm text-amber-100">
        {unpublished ? (
          <p className="text-base font-semibold tracking-wide">PREVIEW — NOT PUBLISHED</p>
        ) : (
          <p className="text-base font-semibold tracking-wide">PREVIEW</p>
        )}
        <p className="mt-1 text-zinc-300">
          This is not the public URL (that&apos;s /p/{slug}
          {unpublished ? ", which returns 404 until you publish" : ""}). CTA
          clicks stay on this preview — they do not hop to the affiliate URL.{" "}
          <Link href="/admin" className="text-emerald-400 hover:underline">
            Back to admin
          </Link>
        </p>
      </div>
      <DesignStudioPanel
        slug={slug}
        template={campaign.pageTemplate || "REVIEW"}
        contentGate={snapshotContentGate(campaign)}
        initialTheme={plan?.visualTheme || "PREMIUM"}
        initialHero={plan?.heroVariant || "MAGAZINE_PRODUCT"}
        initialReport={getLatestVisualQaReport(campaign.id)}
        productAssetStatus={plan?.productAssetStatus || campaign.productAssetStatus || "NEEDS_ASSET"}
        productAssetProvenance={plan?.productAssetProvenance || campaign.productImageProvenance || "NOT_FOUND"}
      />
      {/* renderPixel fica false (padrão) de propósito — preview nunca
          dispara pixel de conversão/visualização real. */}
      <PreviewFrame campaign={campaign} />
      <PublicFooter />
    </div>
  );
}
