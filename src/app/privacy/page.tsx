import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicContactEmail, getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/privacy",
  "Privacy Policy",
  "What this review site records when you visit a review page, the cookie it sets, how affiliate and advertising identifiers are used, and what is not collected.",
);

export default function PrivacyPage() {
  const site = getPublicSiteName();
  const email = getPublicContactEmail();

  return (
    <PublicLegalLayout title="Privacy Policy" path="/privacy" kicker="Policies">
      <p>
        This page describes what {site} records when you visit, and why. It is a plain description of how the
        site works. It is not a claim of GDPR, CCPA, or other regulatory certification; those frameworks carry
        specific obligations this site has not verified.
      </p>

      <LegalSection title="No accounts">
        <p>
          The site has no user registration, logins, newsletters, or comment forms. We do not ask for your name,
          email address, or payment details.
        </p>
      </LegalSection>

      <LegalSection title="Pages that record nothing">
        <p>
          The home page, the review catalog, and the policy pages do not set cookies and do not record
          measurement events.
        </p>
      </LegalSection>

      <LegalSection title="What review pages record">
        <p>
          Individual review pages (addresses starting with <code>/p/</code>) record first-party measurement so the
          operator can see how many visits and clicks a page receives:
        </p>
        <ul>
          <li>
            <strong>Visit record:</strong> a random session identifier, the time, the page, the referring page
            address your browser reports (shortened), and advertising parameters that arrived on the URL
            (<code>utm_source</code>, <code>utm_medium</code>, <code>utm_campaign</code>, <code>utm_content</code>,{" "}
            <code>utm_term</code>, <code>gclid</code>, <code>fbclid</code>, <code>msclkid</code>).
          </li>
          <li>
            <strong>Click record:</strong> when you click a call-to-action, a random click identifier, which button
            was used, the session identifier, the time, and the same advertising parameters.
          </li>
        </ul>
        <p>
          These records do not include a browser fingerprint or an IP address collected by this application.
          Visits and sessions do not necessarily represent individual humans. Internal preview screens used by the
          operator do not record measurement.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Review pages set one first-party cookie, <code>aia_sid</code>. It holds a random identifier, not derived
          from your IP address or device, so repeat views in the same browser can be grouped as one session. It
          lasts about 30 days, is not readable by page scripts (HttpOnly), and is not used on other websites.
        </p>
        <p>
          A review page may also include an advertising tag placed by the operator, such as a Google Ads tag or a
          Meta Pixel. When present, it runs only on that public review page, and the advertising platform may set
          its own cookies and collect device and interaction data under its own policy.
        </p>
      </LegalSection>

      <LegalSection title="Affiliate links and click identifiers">
        <p>
          Affiliate links send you to third-party sellers or affiliate networks, which may record that your visit
          came from this site so a commission can be attributed.
        </p>
        <p>
          When the destination is a ClickBank link, the site adds ClickBank&apos;s documented tracking parameter{" "}
          <code>extclid</code>, containing the random click identifier generated for that click. If you arrived
          with the advertising parameters listed above, they are copied onto the affiliate link so ad measurement
          can continue to the seller. None of these values contain your name, email, or payment details.
        </p>
        <p>
          If a purchase follows, ClickBank may send the site an encrypted server-to-server notification so the
          operator can record the commission and, when the tracking value matches, which click it came from. The
          site stores the transaction identifiers, type, time, currency, commission amount, and tracking value. It
          does not persist buyer name, email, phone number, or street address from those notifications.
        </p>
      </LegalSection>

      <LegalSection title="Sharing">
        <p>
          The measurement and transaction records described here are used by the operator to run the site. This
          application does not sell them or send them to third parties. Advertising tags and affiliate
          destinations, when you encounter them, collect data directly under their own policies.
        </p>
      </LegalSection>

      <LegalSection title="Hosting logs">
        <p>
          Like most websites, the servers that deliver these pages may keep technical logs (for example IP address,
          browser type, and requested address) as part of normal operation and security. Those logs follow the
          hosting provider&apos;s retention.
        </p>
      </LegalSection>

      <LegalSection title="Retention">
        <p>
          Measurement and transaction records are kept for as long as the operator needs them for reporting. There
          is currently no automatic expiry. Because session and click identifiers are random, we generally cannot
          link a record to a specific person.
        </p>
      </LegalSection>

      <LegalSection title="Third-party websites">
        <p>
          Sellers, affiliate networks, and advertising platforms have their own privacy policies. This policy does
          not cover what they collect after you leave this site.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        {email ? (
          <p>
            Privacy questions: <a href={`mailto:${email}`}>{email}</a>.
          </p>
        ) : (
          <p>
            See the <Link href="/contact">Contact</Link> page.
          </p>
        )}
      </LegalSection>
    </PublicLegalLayout>
  );
}
