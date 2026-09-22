import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CampaignTemplate } from "@/components/campaign-template";
import { PublicFooter } from "@/components/public-footer";
import { PresellThemeRoot } from "@/components/presell/presell-theme";
import { candidateToSyntheticCampaign } from "@/lib/validation/candidate-campaign";
import { getValidationCandidate } from "@/lib/validation/store";
import { VALIDATION_ISOLATION } from "@/lib/validation/types";

/**
 * Internal validation-lab render. Draft only.
 * Never PAGE_VIEW, never pixel, never affiliate hop.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Validation lab frame",
};

export default async function ValidationFramePage({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  const { candidateId } = await params;
  const candidate = getValidationCandidate(candidateId);
  if (!candidate) notFound();
  const campaign = candidateToSyntheticCampaign(candidate);

  return (
    <PresellThemeRoot campaign={campaign}>
      <div data-visual-qa-frame="1" data-validation-lab="1">
        <CampaignTemplate
          campaign={campaign}
          renderPixel={VALIDATION_ISOLATION.renderPixel}
          trackClicks={VALIDATION_ISOLATION.trackClicks}
          disableAffiliateNavigation={VALIDATION_ISOLATION.disableAffiliateNavigation}
        />
        <PublicFooter />
      </div>
    </PresellThemeRoot>
  );
}
