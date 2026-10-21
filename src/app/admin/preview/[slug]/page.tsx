import { notFound } from "next/navigation";
import Link from "next/link";
import { getCampaignBySlug } from "@/lib/campaigns";
import { withResolvedCampaign } from "@/lib/manual-overrides";
import { applyLandingDocument } from "@/lib/landing-composer/apply";
import { HEALTH_CLAIM_OMISSION, presentLandingDocument, restoredDescription } from "@/lib/landing-composer/present";
import { readStoredLandingDocument } from "@/lib/landing-composer/store";
import { LandingDocumentSchema } from "@/components/presell/landing-document-schema";
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
import { LpQualityPanel } from "@/components/admin/lp-quality-panel";
import { EditorialDepthPanel } from "@/components/admin/editorial-depth-panel";
import { PresentationTemplateForm } from "@/components/admin/presentation-template-form";
import { ShowcaseLanding } from "@/components/presell/showcase-landing";
import { presentationUsesShowcase } from "@/lib/product-showcase/adapt";
import { getLatestVisualQaReport } from "@/lib/visual-qa/store";
import { snapshotContentGate } from "@/lib/visual-qa/run";
import { designPlanForCampaign, PresellThemeRoot } from "@/components/presell/presell-theme";
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
  const document = readStoredLandingDocument(stored.id);
  const sourced = layer === "imported" ? prepared : withResolvedCampaign(prepared);
  const campaign = withBuilderMedia(withBuilderContent(applyLandingDocument(sourced, document))).campaign;
  const overlay = layer === "effective" ? listPresentationOverlay(stored.id) : null;
  const order = overlay?.order ?? defaultSectionOrder();
  const visibility = overlay?.visibility ?? defaultVisibility();
  const labels = overlay?.navigation ?? defaultNavLabels();
  const exploration = premiumDesignV3Presentation(design);
  const presentation = exploration ?? (hasProductionCandidate(stored) ? PRODUCTION_PRESENTATION_ID : undefined);

  const unpublished = stored.publicationStatus !== "published";
  const plan = designPlanForCampaign(stored);
  const heroSubheadline = document?.sections.find((item) => item.sectionId === "hero")?.content.subheadline;
  const clipped = typeof heroSubheadline === "string" ? heroSubheadline : "";
  const omitted = document ? presentLandingDocument(document, { description: restoredDescription(stored.sourceFactsJson, clipped) }).omitted : [];

  return (
    <div data-preview-wide>
      <div className="border-b border-amber-500/50 bg-amber-950/70 px-6 py-3 text-center text-sm text-amber-100">
        {unpublished ? (
          <p className="text-base font-semibold tracking-wide">PREVIEW — NOT PUBLISHED</p>
        ) : (
          <p className="text-base font-semibold tracking-wide">PREVIEW</p>
        )}
        {omitted.length > 0 ? (
          <p className="mt-1 text-amber-50">
            {omitted.length} alegações de saúde da fonte ficaram fora da página: {HEALTH_CLAIM_OMISSION} A publicação continua bloqueada.
          </p>
        ) : null}
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
          <Link href={`/visual-frame/${slug}`} className="text-emerald-400 hover:underline">
            Clean LP preview
          </Link>
          {" · "}
          <Link href="/admin" className="text-emerald-400 hover:underline">
            Back to admin
          </Link>
        </p>
        )}
        <PresentationTemplateForm campaignId={stored.id} selected={stored.presentationTemplate} />
      </div>
      <div className="px-6 py-4">
        <LpQualityPanel campaignId={stored.id} />
        <EditorialDepthPanel campaignId={stored.id} />
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
      <LandingDocumentSchema schema={document?.schema ?? null} />
      {presentationUsesShowcase(stored.presentationTemplate) && document ? (
        <div className="-mx-6">
          <ShowcaseLanding campaign={campaign} document={document} disableAffiliateNavigation />
        </div>
      ) : (
      <PresellThemeRoot campaign={campaign}>
        <div className="-mx-6" data-presell-presentation={presentation}>
          <LayoutFrame campaignId={stored.id}>
            <ThemeFrame campaignId={stored.id}>
              <PreviewFrame campaign={campaign} document={document} />
            </ThemeFrame>
          </LayoutFrame>
          {document ? null : <PublicFooter />}
        </div>
      </PresellThemeRoot>
      )}
    </div>
  );
}
