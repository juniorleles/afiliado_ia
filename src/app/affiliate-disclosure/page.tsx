import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/affiliate-disclosure",
  "Affiliate Disclosure",
  "How affiliate links work on this review website and how commissions relate to price and editorial content.",
);

export default function AffiliateDisclosurePage() {
  const site = getPublicSiteName();

  return (
    <PublicLegalLayout title="Affiliate Disclosure" path="/affiliate-disclosure" kicker="Policies">
      <p>
        {site} earns money through affiliate programs. The call-to-action buttons on our review pages are
        affiliate links.
      </p>

      <LegalSection title="How it works">
        <p>
          If you click an affiliate link and then buy the product or a related offer, the seller or the affiliate
          network (for example ClickBank) may pay this site a commission. Clicking a link costs nothing, and you
          are never required to buy.
        </p>
      </LegalSection>

      <LegalSection title="Price">
        <p>
          The site does not add a surcharge. The price you pay is set by the seller. Using an affiliate link should
          not raise it; any price difference would come from the seller, not from this site.
        </p>
      </LegalSection>

      <LegalSection title="Editorial independence">
        <p>
          Reviews are not paid opinions. A commission does not mean a product was tested, endorsed by a
          professional, or guaranteed to work, and it does not change what a page is allowed to say. Every page is
          limited to what its sources support, as described in our{" "}
          <Link href="/editorial-policy">Editorial Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Not the seller">
        <p>
          We are not the manufacturer or seller of the products we review. Orders, shipping, subscriptions, and
          refunds are handled by the seller.
        </p>
      </LegalSection>

      <LegalSection title="Where this appears">
        <p>
          This notice appears at the top of every review page and across the site. For details about click
          identifiers and measurement, see the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
