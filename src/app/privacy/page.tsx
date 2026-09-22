import type { Metadata } from "next";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicContactEmail, getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/privacy",
  "Privacy Policy",
  "How this review website handles cookies, advertising measurement, affiliate tracking, and contact.",
);

export default function PrivacyPage() {
  const site = getPublicSiteName();
  const email = getPublicContactEmail();

  return (
    <PublicLegalLayout title="Privacy Policy">
      <p>
        This page describes, in general terms, how {site} handles information
        when you visit public pages. It is not a claim of GDPR, CCPA, or other
        regulatory certification. Those frameworks have specific obligations
        that this site has not implemented or verified.
      </p>

      <LegalSection title="What this site stores">
        <p>
          Campaign content is stored by the site operator in a local database
          used to publish review pages. That database is not a consumer
          account system: this site does not offer user registration, logins,
          or a personal data dashboard.
        </p>
        <p className="mt-3">
          Public review pages also store first-party measurement events:
          a visit record and, if you click a call-to-action, a click record.
          Those rows include a random session identifier and optional
          advertising parameters that arrived on the URL (utm_source,
          utm_medium, utm_campaign, utm_content, utm_term, gclid, fbclid,
          msclkid). They do not include a browser fingerprint, canvas
          fingerprint, or IP address collected by this application.
          Visits and sessions do not necessarily represent individual humans.
        </p>
      </LegalSection>

      <LegalSection title="Advertising measurement">
        <p>
          Individual review pages may include tracking snippets placed by the
          site operator (for example a Meta Pixel or Google Ads tag). Those
          scripts, when present, run only on the public review URL. They are
          not executed on internal preview screens. Third-party advertising
          platforms may collect device and interaction data under their own
          policies.
        </p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          Public review URLs may set a first-party session cookie named{" "}
          <code className="rounded bg-zinc-800 px-1">aia_sid</code>. It holds a
          random opaque identifier (not derived from your IP address or a
          device fingerprint) for about 30 days so repeat page views in the
          same browser can be grouped as one session. Internal admin preview
          screens do not record that measurement. Third-party pixels, if a
          campaign includes them, may set their own cookies. This page is not
          a claim of GDPR, CCPA, or other regulatory certification.
        </p>
      </LegalSection>

      <LegalSection title="Affiliate tracking">
        <p>
          Affiliate links on review pages go to third-party merchants or
          affiliate networks. Those destinations may record that the visit
          came from this site so a commission can be attributed if you buy.
        </p>
        <p className="mt-3">
          When the destination is a ClickBank HopLink, this site may append
          ClickBank&apos;s documented tracking parameter{" "}
          <code className="rounded bg-zinc-800 px-1">extclid</code> containing
          a random click identifier generated for that outbound click. That
          identifier is not your name, email, or payment details.
        </p>
        <p className="mt-3">
          If a purchase later occurs, ClickBank may send this site an
          encrypted Instant Notification (server-to-server) so the operator
          can record affiliate commission and, when the tracking value
          matches, which review-page click it came from. This application
          stores transaction identifiers, type, time, commission amount, and
          the tracking value. It does not persist buyer name, email, phone,
          or street address from those notifications.
        </p>
      </LegalSection>

      <LegalSection title="UTM parameters and click IDs">
        <p>
          If you arrive with advertising parameters such as <code className="rounded bg-zinc-800 px-1">utm_*</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">gclid</code>,{" "}
          <code className="rounded bg-zinc-800 px-1">fbclid</code>, or{" "}
          <code className="rounded bg-zinc-800 px-1">msclkid</code>, the public
          review page may copy those values onto the affiliate link when you
          click a call-to-action. That is how ad click measurement can continue
          to the merchant. Those parameters may also appear in server logs of
          this site or of third parties.
        </p>
      </LegalSection>

      <LegalSection title="Third-party websites">
        <p>
          Links leave this site. Linked merchants, networks, and ad platforms
          have their own privacy policies. This page does not control what they
          collect after you click away.
        </p>
      </LegalSection>

      <LegalSection title="Data retention">
        <p>
          Published review content is kept for as long as the operator leaves
          the campaign online. Server and hosting logs, if any, follow the
          host’s default retention. There is no separate consumer profile store
          on this application.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Privacy questions:{" "}
          <a href={`mailto:${email}`} className="text-emerald-400 hover:underline">
            {email}
          </a>
          .
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
