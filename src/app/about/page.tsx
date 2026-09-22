import type { Metadata } from "next";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/about",
  "About",
  "Who publishes these product reviews and how this site is meant to be used.",
);

export default function AboutPage() {
  const site = getPublicSiteName();

  return (
    <PublicLegalLayout title="About">
      <p>
        {site} publishes independent product reviews, educational buying
        information, and comparison-style write-ups. The goal is to help
        readers understand what a product claims to do, what to look for, and
        where to go next if they decide to buy.
      </p>

      <LegalSection title="What you will find here">
        <p>
          Review pages summarize publicly available product information, typical
          use cases, and practical caveats. They are written so a page can stand
          on its own as reading material, not only as a doorway to a checkout
          link.
        </p>
      </LegalSection>

      <LegalSection title="What we do not claim">
        <p>
          We do not claim certifications, laboratory testing, medical
          qualifications, brand partnerships, or “expert” status unless a
          specific page states evidence for that claim. If a page does not
          document a test, study, or credential, assume it is not there.
        </p>
      </LegalSection>

      <LegalSection title="Affiliate links">
        <p>
          Some pages include affiliate links. If you buy through those links,
          the site may receive a commission. That relationship is described on
          the Affiliate Disclosure page and again on each review.
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
