import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPublishedCampaignBySlug } from "@/lib/campaigns";
import { CampaignTemplate } from "@/components/campaign-template";
import { PublicFooter } from "@/components/public-footer";
import { PresellThemeRoot } from "@/components/presell/presell-theme";
import { presellMetaDescription } from "@/lib/presell-meta";
import { publicAbsoluteUrl } from "@/lib/public-site";
import { parsePresellPage } from "@/lib/presell-page";
import {
  ANALYTICS_SKIP_HEADER,
  ANALYTICS_SKIP_VALUE,
  canRecordAnalytics,
  isValidSessionId,
  parseAttribution,
  SESSION_COOKIE,
  SESSION_HEADER,
} from "@/lib/analytics";
import { recordVisitSafe } from "@/lib/analytics-store";

/**
 * Rota PÚBLICA — a URL de verdade que vai pro anúncio do Google/Meta.
 * De propósito, esta rota fica FORA de /admin (não importa
 * src/app/admin/layout.tsx nem nada de dentro de admin/) — sem cabeçalho
 * "Afiliado IA · Admin", sem barra de "Preview mode". É a página que o
 * revisor de anúncio e o visitante real veem, sem chrome nenhum de painel
 * interno.
 *
 * Reaproveita CampaignTemplate (mesmo componente do preview da Fase 3) —
 * de propósito, pra /p/[slug] e /admin/preview/[slug] nunca divergirem
 * silenciosamente com o tempo. O footer do site (About, Privacy, …) é
 * chrome público e só entra aqui, não no preview do admin.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageParams = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Omit<PageParams, "searchParams">): Promise<Metadata> {
  const { slug } = await params;
  const campaign = getPublishedCampaignBySlug(slug);

  if (!campaign) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  const page = parsePresellPage(campaign.pageComposition);
  const description = page?.hero.summary || presellMetaDescription(campaign.headline, campaign.body);
  const image = page?.hero.image.src && page.hero.image.provenance !== "PLACEHOLDER" ? page.hero.image.src : undefined;

  return {
    title: campaign.headline,
    description,
    alternates: { canonical: publicAbsoluteUrl(`/p/${slug}`) },
    robots: { index: true, follow: true },
    openGraph: {
      title: campaign.headline,
      description,
      url: publicAbsoluteUrl(`/p/${slug}`),
      ...(image ? { images: [{ url: image.startsWith("http") ? image : publicAbsoluteUrl(image) }] } : {}),
    },
  };
}

function toUrlSearchParams(
  raw: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value) && value[0]) {
      params.set(key, value[0]);
    }
  }
  return params;
}

export default async function PublicPresellPage({ params, searchParams }: PageParams) {
  const { slug } = await params;
  const campaign = getPublishedCampaignBySlug(slug);

  if (!campaign) {
    notFound();
  }

  const incomingParams = toUrlSearchParams(await searchParams);

  try {
    const hdrs = await headers();
    const skipHeader = hdrs.get(ANALYTICS_SKIP_HEADER) === ANALYTICS_SKIP_VALUE;
    if (
      canRecordAnalytics({
        published: true,
        isPreview: false,
        skipHeader,
      })
    ) {
      const cookieStore = await cookies();
      const sessionId = cookieStore.get(SESSION_COOKIE)?.value ?? hdrs.get(SESSION_HEADER);
      if (isValidSessionId(sessionId)) {
        recordVisitSafe({
          campaignId: campaign.id,
          sessionId,
          attribution: parseAttribution(incomingParams),
          referrer: hdrs.get("referer"),
        });
      }
    }
  } catch {
    console.error("[analytics] visit recording failed");
  }

  // renderPixel=true SÓ aqui, na rota pública de verdade — nunca no
  // preview do admin, pra não disparar tracking de conversão/visualização
  // enquanto alguém só está editando a campanha internamente.
  return (
    <PresellThemeRoot campaign={campaign}>
      <div className="flex min-h-screen flex-col">
        <div className="flex-1">
          <CampaignTemplate
            campaign={campaign}
            incomingQuery={incomingParams.toString()}
            renderPixel
            trackClicks
          />
        </div>
        <PublicFooter />
      </div>
    </PresellThemeRoot>
  );
}
