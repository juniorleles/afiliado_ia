import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/about",
  "About",
  "Who publishes these independent product reviews, what the site covers, and what it does not claim.",
);

export default function AboutPage() {
  const site = getPublicSiteName();

  return (
    <PublicLegalLayout title={`About ${site}`} path="/about" kicker="About" showUpdated={false}>
      <p>
        {site} publishes independent product reviews: plain-language pages that explain what a product is, what
        its seller says about it, and what the available public information does and does not show.
      </p>

      <LegalSection title="Who we are">
        <p>
          {site} is run by an independent publisher. We are not the manufacturer, brand owner, or seller of any
          product we write about, and we do not process orders. When you decide to buy, you buy from the seller on
          the seller&apos;s own website.
        </p>
      </LegalSection>

      <LegalSection title="What you will find here">
        <p>
          Each review page summarizes publicly available product information: what the product is, the features
          and ingredients or components the seller lists, how the seller says to use it, and operational details
          such as the published return policy. Pages are written to stand on their own as reading material, not
          only as a doorway to a checkout link.
        </p>
        <p>
          Browse every current review on the <Link href="/reviews">Reviews</Link> page.
        </p>
      </LegalSection>

      <LegalSection title="How pages are made">
        <p>
          Reviews are built from recorded source material, checked automatically for unsupported or prohibited
          claims, and published only when a person decides a page is ready. The full process is described in
          our <Link href="/editorial-policy">Editorial Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection title="What we do not claim">
        <ul>
          <li>We do not test products hands-on or in a laboratory.</li>
          <li>We do not provide medical, nutritional, or other professional advice.</li>
          <li>We do not hold brand partnerships, certifications, or awards, and we do not score or rank products.</li>
          <li>
            A seller&apos;s statement is presented as the seller&apos;s statement. It is not independently verified
            unless a page says what verification was done.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Affiliate links">
        <p>
          Review pages include affiliate links. If you buy through one, the site may receive a commission. See
          the <Link href="/affiliate-disclosure">Affiliate Disclosure</Link> for how that works. The same notice
          appears at the top of every review.
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
