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
    <PublicLegalLayout title="Affiliate Disclosure">
      <p>
        {site} participates in affiliate advertising programs. That means some
        links on review pages are affiliate links.
      </p>

      <LegalSection title="Commissions">
        <p>
          If you click an affiliate link and later buy the product (or a
          related offer), the site may receive a commission from the merchant
          or the affiliate network.
        </p>
      </LegalSection>

      <LegalSection title="Price">
        <p>
          Using an affiliate link should not increase the price you pay unless
          the merchant independently sets a different price. Any price
          difference would come from the merchant, not from a surcharge added
          by this site.
        </p>
      </LegalSection>

      <LegalSection title="Editorial independence">
        <p>
          Reviews on this site should not be read as bought opinions. A
          commission does not mean the product was tested in a lab, endorsed by
          a medical professional, or guaranteed to work. Readers should judge
          whether a product fits their own situation.
        </p>
      </LegalSection>

      <LegalSection title="Where this also appears">
        <p>
          Each public review includes a short disclosure near the top of the
          page. For privacy details about click IDs and tracking, see the{" "}
          <Link href="/privacy" className="text-emerald-400 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
