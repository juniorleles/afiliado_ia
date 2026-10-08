import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaignBySlug } from "@/lib/campaigns";
import { withResolvedCampaign } from "@/lib/manual-overrides";
import { withBuilderContent } from "@/lib/lp-content-render";
import { withBuilderMedia } from "@/lib/lp-media-render";
import { listPresentationOverlay } from "@/lib/presentation-overrides";
import { defaultNavLabels, defaultSectionOrder, defaultVisibility } from "@/lib/editor-layers";
import { PreviewOverlay } from "@/components/presell/preview-overlay";
import { PreviewFrame } from "@/components/presell/preview-frame";
import { ThemeFrame } from "@/components/presell/theme-frame";
import { LayoutFrame } from "@/components/presell/layout-frame";
import { PublicFooter } from "@/components/public-footer";
import { DesignStudioPanel } from "@/components/admin/design-studio-panel";
import { getLatestVisualQaReport } from "@/lib/visual-qa/store";
import { snapshotContentGate } from "@/lib/visual-qa/run";
import { designPlanForCampaign } from "@/components/presell/presell-theme";
import {
  applyProductionCandidate,
  hasProductionCandidate,
  PRODUCTION_PRESENTATION_ID,
} from "@/lib/production-candidate";
import { premiumDesignV3Presentation } from "@/lib/premium-design-v3";
import "@/app/premium-final-candidate-public.css";
import "@/app/premium-final-candidate-v2.css";
import "@/app/premium-design-v3-base.css";
import "@/app/premium-design-v3-a.css";
import "@/app/premium-design-v3-b.css";
import "@/app/premium-design-v3-c.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ design?: string | string[]; layer?: string | string[]; embedded?: string | string[] }>;
}) {
  const embeddedFlag = (await searchParams).embedded;
  const embedded = (Array.isArray(embeddedFlag) ? embeddedFlag[0] : embeddedFlag) === "studio";
  const { slug } = await params;
  const { design, layer: layerParam } = await searchParams;
  const stored = getCampaignBySlug(slug);

  if (!stored) {
    notFound();
  }

  const layer = layerParam === "imported" ? "imported" : "effective";
  const prepared = applyProductionCandidate(stored);
  const campaign = withBuilderMedia(withBuilderContent(layer === "imported" ? prepared : withResolvedCampaign(prepared))).campaign;
  const overlay = layer === "effective" ? listPresentationOverlay(stored.id) : null;
  const order = overlay?.order ?? defaultSectionOrder();
  const visibility = overlay?.visibility ?? defaultVisibility();
  const labels = overlay?.navigation ?? defaultNavLabels();
  const exploration = premiumDesignV3Presentation(design);
  const presentation = exploration ?? (hasProductionCandidate(stored) ? PRODUCTION_PRESENTATION_ID : undefined);

  const unpublished = stored.publicationStatus !== "published";
  const plan = designPlanForCampaign(stored);

  return (
    <div data-preview-wide>
      <div className="border-b border-amber-500/50 bg-amber-950/70 px-6 py-3 text-center text-sm text-amber-100">
        {unpublished ? (
          <p className="text-base font-semibold tracking-wide">PREVIEW — NOT PUBLISHED</p>
        ) : (
          <p className="text-base font-semibold tracking-wide">PREVIEW</p>
        )}
        {embedded ? null : (
        <p className="mt-1 text-zinc-300">
          Showing {layer === "imported" ? "imported" : "effective"} values.{" "}
          <Link href={`/admin/preview/${slug}?layer=imported`} className="text-emerald-400 hover:underline">
            Imported
          </Link>
          {" · "}
          <Link href={`/admin/preview/${slug}?layer=effective`} className="text-emerald-400 hover:underline">
            Effective
          </Link>
          {" · "}
          <Link href={`/admin/lp-builder/${stored.id}`} className="text-emerald-400 hover:underline">
            Landing Page Builder
          </Link>
          {" · "}
          <Link href={`/admin/lp-visual/${stored.id}`} className="text-emerald-400 hover:underline">
            Visual Editor
          </Link>
          {" · "}
          <Link href={`/admin/lp-media/${stored.id}`} className="text-emerald-400 hover:underline">
            Media Manager
          </Link>
          {" · "}
          <Link href={`/admin/lp-layout/${stored.id}`} className="text-emerald-400 hover:underline">
            Layout Builder
          </Link>
          {" · "}
          <Link href={`/admin/lp-versions/${stored.id}`} className="text-emerald-400 hover:underline">
            History
          </Link>
          {" · "}
          <Link href="/admin" className="text-emerald-400 hover:underline">
            Back to admin
          </Link>
        </p>
        )}
      </div>
      {overlay ? (
        <PreviewOverlay
          hidden={order.filter((id) => visibility[id] === false)}
          order={order}
          labels={labels}
          ctaColor={overlay.ctaColor}
        />
      ) : null}
      <DesignStudioPanel
        slug={slug}
        template={stored.pageTemplate || "REVIEW"}
        contentGate={snapshotContentGate(stored)}
        initialTheme={plan?.visualTheme || "PREMIUM"}
        initialHero={plan?.heroVariant || "MAGAZINE_PRODUCT"}
        initialReport={getLatestVisualQaReport(stored.id)}
        productAssetStatus={plan?.productAssetStatus || stored.productAssetStatus || "NEEDS_ASSET"}
        productAssetProvenance={plan?.productAssetProvenance || stored.productImageProvenance || "NOT_FOUND"}
      />
      {/* renderPixel fica false (padrão) de propósito — preview nunca
          dispara pixel de conversão/visualização real. */}
      <div className="-mx-6" data-presell-presentation={presentation}>
        <LayoutFrame campaignId={stored.id}>
          <ThemeFrame campaignId={stored.id}>
            <PreviewFrame campaign={campaign} />
          </ThemeFrame>
        </LayoutFrame>
        <PublicFooter />
      </div>
    </div>
  );
}
