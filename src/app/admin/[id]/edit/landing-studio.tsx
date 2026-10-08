import PreviewPage from "@/app/admin/preview/[slug]/page";
import { StudioFrame } from "@/app/admin/[id]/edit/studio-frame";
import LayoutBuilderPage from "@/app/admin/lp-layout/[campaignId]/page";
import MediaManagerPage from "@/app/admin/lp-media/[campaignId]/page";
import VersionHistoryPage from "@/app/admin/lp-versions/[campaignId]/page";
import LandingPageBuilderPage from "@/app/admin/lp-builder/[campaignId]/page";
import VisualEditorPage from "@/app/admin/lp-visual/[campaignId]/page";
import type { Campaign } from "@/lib/campaigns";
import { listPageVersions } from "@/lib/lp-builder/version-store";

const TOOLS = ["builder", "visual", "layout", "media", "versoes", "preview"] as const;
export type LandingTool = (typeof TOOLS)[number];

function formatUpdated(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function href(id: number, ferramenta: LandingTool) {
  return `/admin/${id}/edit?aba=landing&ferramenta=${ferramenta}`;
}

export function LandingStudio({
  campaign,
  product,
  brand,
  published,
  score,
  gateLabel,
  adsConnected,
  ferramenta,
  params,
}: {
  campaign: Campaign;
  product: string;
  brand: string;
  published: boolean;
  score: number;
  gateLabel: string;
  adsConnected: boolean;
  ferramenta: LandingTool;
  params: Promise<{ campaignId: string; id: string }>;
}) {
  let lastSaved = formatUpdated(campaign.updatedAt);
  try {
    const latest = listPageVersions(campaign.id)[0];
    if (latest) lastSaved = formatUpdated(latest.createdAt);
  } catch {
    lastSaved = formatUpdated(campaign.updatedAt);
  }

  const toolHrefs: Record<string, string> = {
    builder: href(campaign.id, "builder"),
    visual: href(campaign.id, "visual"),
    layout: href(campaign.id, "layout"),
    media: href(campaign.id, "media"),
    versoes: href(campaign.id, "versoes"),
    preview: href(campaign.id, "preview"),
  };
  const studioQuery = Promise.resolve({ embedded: "studio" });

  return (
    <StudioFrame
      current={ferramenta}
      tabs={[
        { id: "builder", href: toolHrefs.builder, label: "Builder" },
        { id: "visual", href: toolHrefs.visual, label: "Visual" },
        { id: "layout", href: toolHrefs.layout, label: "Layout" },
        { id: "media", href: toolHrefs.media, label: "Mídia" },
        { id: "versoes", href: toolHrefs.versoes, label: "Versões" },
        { id: "preview", href: toolHrefs.preview, label: "Prévia" },
      ]}
      toolHrefs={toolHrefs}
      name={campaign.name}
      product={product}
      brand={brand}
      publication={published ? "Publicada" : "Rascunho"}
      lastSaved={lastSaved}
      completion={score}
      policy={gateLabel}
      seo="Sem auditoria gravada"
      googleAds={adsConnected ? "Conectado" : "Google Ads não conectado"}
      publishHref={`/admin/${campaign.id}/edit?aba=publicacao`}
    >
      <div className="overflow-x-auto rounded-ds-md bg-zinc-950 p-ds-16 text-zinc-100">
        {ferramenta === "builder" ? <LandingPageBuilderPage params={params} searchParams={studioQuery} /> : null}
        {ferramenta === "visual" ? <VisualEditorPage params={params} searchParams={studioQuery} /> : null}
        {ferramenta === "layout" ? <LayoutBuilderPage params={params} searchParams={studioQuery} /> : null}
        {ferramenta === "media" ? <MediaManagerPage params={params} searchParams={studioQuery} /> : null}
        {ferramenta === "versoes" ? <VersionHistoryPage params={params} searchParams={studioQuery} /> : null}
        {ferramenta === "preview" ? (
          <PreviewPage params={Promise.resolve({ slug: campaign.slug })} searchParams={Promise.resolve({ embedded: "studio" })} />
        ) : null}
      </div>
    </StudioFrame>
  );
}
