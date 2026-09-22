import "@/app/presell-design.css";
import type { Campaign } from "@/lib/campaigns";
import { parseDesignPlan, type DesignPlan, type VisualTheme } from "@/lib/design/plan";
import { createDesignPlan } from "@/lib/design/planner";
import { parsePresellPage } from "@/lib/presell-page";
import { parseCreativeCompositionPlan } from "@/lib/creative/plan";
import type { CreativeCompositionPlan } from "@/lib/creative/types";

export function designPlanForCampaign(campaign: Campaign): DesignPlan | null {
  const page = parsePresellPage(campaign.pageComposition);
  if (!page) return parseDesignPlan(campaign.designPlanJson);
  const saved = parseDesignPlan(campaign.designPlanJson);
  if (saved) return saved;
  const theme = (campaign.visualTheme as VisualTheme | undefined) || undefined;
  return createDesignPlan({ page, theme });
}

export function PresellThemeRoot({
  campaign,
  children,
  creative,
}: {
  campaign: Campaign;
  children: React.ReactNode;
  creative?: CreativeCompositionPlan | null;
}) {
  const plan = designPlanForCampaign(campaign);
  const theme = plan?.visualTheme || "PREMIUM";
  const composition = creative ?? parseCreativeCompositionPlan(campaign.creativeCompositionJson);
  return (
    <div
      className="presell-canvas relative min-h-screen"
      data-visual-theme={theme}
      data-width={plan?.contentWidth || "wide"}
      data-hero={plan?.heroVariant || "MAGAZINE_PRODUCT"}
      data-hero-scale={plan?.tokens.heroScale || "editorial"}
      data-display-scale={plan?.tokens.displayScale || "expressive"}
      data-spacing={plan?.tokens.sectionSpacing || "balanced"}
      data-depth={plan?.tokens.surfaceDepth || "layered"}
      data-corners={plan?.tokens.cornerLanguage || "soft"}
      data-shadow={plan?.tokens.shadowLanguage || "soft"}
      data-asset={plan?.productAssetStatus || "NEEDS_ASSET"}
      data-creative={composition ? "v1" : "none"}
    >
      {children}
    </div>
  );
}
