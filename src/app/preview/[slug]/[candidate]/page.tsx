import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CampaignTemplate } from "@/components/campaign-template";
import { PublicFooter } from "@/components/public-footer";
import { PresellThemeRoot } from "@/components/presell/presell-theme";
import { resolvePresellRenderAssets } from "@/lib/presell-render-assets-server";
import { candidateToSyntheticCampaign } from "@/lib/validation/candidate-campaign";
import { getValidationCandidate } from "@/lib/validation/store";
import { VALIDATION_ISOLATION } from "@/lib/validation/types";
import { slugify } from "@/lib/slug";
import type { ProductFacts } from "@/lib/product-facts";
import { sourceVisualForUrl } from "@/lib/visual-identity/persist";
import type { SourceVisual } from "@/lib/visual-identity/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Recommended LP preview",
};

export default async function RecommendedPreviewPage({
  params,
}: {
  params: Promise<{ slug: string; candidate: string }>;
}) {
  const { slug, candidate: candidateId } = await params;
  const candidate = getValidationCandidate(candidateId);
  if (!candidate) notFound();
  const expected = slugify(candidate.productName) || "product";
  if (slug !== expected) notFound();
  const campaign = candidateToSyntheticCampaign(candidate);
  let sourceVisual: SourceVisual | null = null;
  try {
    const facts = campaign.sourceFactsJson ? (JSON.parse(campaign.sourceFactsJson) as ProductFacts) : null;
    sourceVisual = sourceVisualForUrl(facts?.sourceUrl);
  } catch {
    sourceVisual = null;
  }

  return (
    <PresellThemeRoot campaign={campaign} sourceVisual={sourceVisual}>
      <div className="border-b border-amber-500/50 bg-amber-950/70 px-6 py-3 text-center text-sm text-amber-100">
        <p className="text-base font-semibold tracking-wide">RECOMMENDED LP PREVIEW — NOT PUBLISHED</p>
        <p className="mt-1 text-zinc-300">
          Strategy: {candidate.approach}. This is not the public /p/ route. No pixel, no PAGE_VIEW, no affiliate hop.
          {" "}
          <Link href="/admin/generate" className="text-emerald-400 hover:underline">
            Back to generate
          </Link>
        </p>
      </div>
      <div data-visual-qa-frame="1" data-recommended-preview="1">
        <CampaignTemplate
          campaign={campaign}
          renderPixel={VALIDATION_ISOLATION.renderPixel}
          trackClicks={VALIDATION_ISOLATION.trackClicks}
          disableAffiliateNavigation={VALIDATION_ISOLATION.disableAffiliateNavigation}
          renderAssets={resolvePresellRenderAssets(campaign)}
          sourceVisual={sourceVisual}
        />
        <PublicFooter />
      </div>
    </PresellThemeRoot>
  );
}
