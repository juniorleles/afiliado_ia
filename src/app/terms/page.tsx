import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/terms",
  "Terms of Use",
  "Terms of use for this independent product-review website.",
);

export default function TermsPage() {
  const site = getPublicSiteName();

  return (
    <PublicLegalLayout title="Terms of Use" path="/terms" kicker="Policies">
      <p>
        These terms describe how you may use {site}. They are a practical website notice, not legal advice, and
        they do not create warranties beyond what the law already requires.
      </p>

      <LegalSection title="Informational purpose">
        <p>
          Review pages are for general informational purposes. They are not personalized advice, a diagnosis, a
          professional recommendation, or a promise that a product will work for you.
        </p>
      </LegalSection>

      <LegalSection title="Health information">
        <p>
          Some reviews describe supplements or wellness products. That information restates what sellers and public
          sources say. It is not medical advice and is not a substitute for a qualified professional. Consult one
          before starting a supplement, especially if you are pregnant, nursing, taking medication, or managing a
          health condition.
        </p>
      </LegalSection>

      <LegalSection title="Accuracy">
        <p>
          We work to restate sources accurately, as described in our{" "}
          <Link href="/editorial-policy">Editorial Policy</Link>. Sellers can change their products, claims, prices,
          and policies at any time, so a page may become outdated. Confirm details on the seller&apos;s website
          before you buy.
        </p>
      </LegalSection>

      <LegalSection title="Third-party products and websites">
        <p>
          Products described here are sold by other companies. Prices, availability, shipping, warranties,
          subscriptions, and return policies belong to those companies. Links may take you to seller or
          affiliate-network websites; we are not responsible for their content, security, or practices.
        </p>
      </LegalSection>

      <LegalSection title="Affiliate links">
        <p>
          Some links are affiliate links and may earn the site a commission. See the{" "}
          <Link href="/affiliate-disclosure">Affiliate Disclosure</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          Text published on this site belongs to its operator unless a page says otherwise. You may not copy it for
          commercial reuse without permission. Product names, logos, and trademarks belong to their respective
          owners and are used only to identify the products discussed.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of responsibility">
        <p>
          To the extent permitted by law, the operator is not liable for losses that result from relying on a
          review, from a third-party purchase, or from the site being unavailable.
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          These terms may be updated. The date at the top of this page shows the latest revision. If you do not
          agree with these terms, please do not use the site.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions about these terms: see the <Link href="/contact">Contact</Link> page.
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
