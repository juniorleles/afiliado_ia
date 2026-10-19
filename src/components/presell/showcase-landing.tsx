import Script from "next/script";
import type { Campaign } from "@/lib/campaigns";
import type { LandingDocument } from "@/lib/landing-composer/types";
import { buildAffiliateHref } from "@/lib/affiliate-url";
import { builderEditorState } from "@/lib/lp-content-render";
import { adaptLandingToShowcase } from "@/lib/product-showcase/adapt";
import { ProductShowcasePremiumV1 } from "@/components/product-showcase/product-showcase-premium-v1";
import { outboundCta, PresellCta } from "@/components/presell/presell-cta";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  TRUST_EDITORIAL,
  getPublicSiteName,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";

export function ShowcaseLanding({
  campaign,
  document,
  incomingQuery = "",
  renderPixel = false,
  trackClicks = false,
  disableAffiliateNavigation = false,
}: {
  campaign: Campaign;
  document: LandingDocument;
  incomingQuery?: string;
  renderPixel?: boolean;
  trackClicks?: boolean;
  disableAffiliateNavigation?: boolean;
}) {
  const { fields } = builderEditorState(campaign);
  const model = adaptLandingToShowcase(campaign, document, {
    fields,
    channel: "presell",
    siteName: getPublicSiteName(),
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: isHealthDisclaimerEnabled() ? HEALTH_DISCLAIMER_TEXT : null,
    review: TRUST_EDITORIAL,
    footerLinks: [...PUBLIC_FOOTER_LINKS],
  });
  const action = model.cta ? outboundCta(buildAffiliateHref(model.cta.href, new URLSearchParams(incomingQuery)), trackClicks) : null;

  return (
    <>
      {renderPixel && campaign.headScript ? (
        <Script id="presell-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: campaign.headScript }} />
      ) : null}
      <ProductShowcasePremiumV1
        model={model}
        labHref={`/admin/preview/${campaign.slug}`}
        showLabBar={false}
        ctaSlot={action && model.cta ? (
          <PresellCta
            href={action.href}
            label={model.cta.label}
            position="hero"
            campaignId={campaign.id}
            trackClicks={trackClicks}
            clickId={action.clickId}
            disableAffiliateNavigation={disableAffiliateNavigation}
            layout="inline"
          />
        ) : null}
      />
    </>
  );
}
