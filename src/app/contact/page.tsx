import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicContactEmail, getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/contact",
  "Contact",
  "How to reach the publisher of these product reviews, and which questions belong with the seller instead.",
);

export default function ContactPage() {
  const site = getPublicSiteName();
  const email = getPublicContactEmail();

  return (
    <PublicLegalLayout title="Contact" path="/contact" kicker="Contact" showUpdated={false}>
      {email ? (
        <p>
          For questions about {site}, a correction to a review, or a privacy request, email{" "}
          <a href={`mailto:${email}`}>{email}</a>. There is no contact form and no automated ticket system.
        </p>
      ) : (
        <p>
          A contact address for {site} has not been published yet. It will appear on this page once the site
          operator configures it.
        </p>
      )}

      <LegalSection title="What we can help with">
        <ul>
          <li>Corrections: include the page address and the statement you believe is wrong.</li>
          <li>
            Privacy questions about the measurement described in the <Link href="/privacy">Privacy Policy</Link>.
          </li>
          <li>General questions about how the site works.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Orders, shipping, and refunds">
        <p>
          We do not sell products or handle orders. For orders, shipping, subscriptions, warranties, or refunds,
          contact the seller or the payment processor named on your receipt.
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
