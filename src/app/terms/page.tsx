import type { Metadata } from "next";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicContactEmail, getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/terms",
  "Terms",
  "Terms of use for this product-review website.",
);

export default function TermsPage() {
  const site = getPublicSiteName();
  const email = getPublicContactEmail();

  return (
    <PublicLegalLayout title="Terms of Use">
      <p>
        These terms describe how you may use {site}. They are a practical
        website notice, not legal advice, and they do not create warranties
        beyond what the law already requires.
      </p>

      <LegalSection title="Informational purpose">
        <p>
          Review pages are for general information. They are not personalized
          advice, a diagnosis, a professional recommendation, or a promise that
          a product will work for you.
        </p>
      </LegalSection>

      <LegalSection title="Third-party products">
        <p>
          Products described here are sold by other companies. Names, prices,
          availability, shipping, warranties, and return policies belong to
          those companies and can change without notice on this site.
        </p>
      </LegalSection>

      <LegalSection title="External links">
        <p>
          Call-to-action buttons and other links may send you to merchant or
          affiliate-network websites. We are not responsible for the content,
          security, or practices of those destinations.
        </p>
      </LegalSection>

      <LegalSection title="No guarantee of availability or pricing">
        <p>
          A price, stock status, or offer mentioned in a review may be outdated
          by the time you visit the merchant. Confirm details on the
          destination site before you buy.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          Text published on this site is owned by the operator unless a page
          says otherwise. You may not copy it for commercial reuse without
          permission. Product names and logos belong to their respective
          owners.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of responsibility">
        <p>
          To the extent permitted by law, the operator is not liable for
          losses that result from relying on a review, from a third-party
          purchase, or from downtime. If you do not agree with these terms, do
          not use the site.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Questions:{" "}
          <a href={`mailto:${email}`} className="text-emerald-400 hover:underline">
            {email}
          </a>
          .
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
