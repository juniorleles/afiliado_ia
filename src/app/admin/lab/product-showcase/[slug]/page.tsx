import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductShowcasePremiumV1 } from "@/components/product-showcase/product-showcase-premium-v1";
import { getCampaignBySlug } from "@/lib/campaigns";
import { readStoredLandingDocument } from "@/lib/landing-composer/store";
import { adaptLandingToShowcase } from "@/lib/product-showcase/adapt-campaign";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  TRUST_EDITORIAL,
  getPublicSiteName,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Product showcase lab",
  robots: { index: false, follow: false },
};

export default async function ProductShowcaseLabPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const campaign = getCampaignBySlug(slug);
  if (!campaign) notFound();
  const document = readStoredLandingDocument(campaign.id);
  if (!document) notFound();
  const model = adaptLandingToShowcase(campaign, document, {
    channel: "presell",
    siteName: getPublicSiteName(),
    affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
    healthDisclaimer: isHealthDisclaimerEnabled() ? HEALTH_DISCLAIMER_TEXT : null,
    review: TRUST_EDITORIAL,
    footerLinks: [...PUBLIC_FOOTER_LINKS],
  });
  if (!model.productName) notFound();

  return <ProductShowcasePremiumV1 model={model} labHref={`/admin/preview/${slug}`} showLabBar={false} ctaPreview />;
}
