import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection, PublicLegalLayout, publicPageMetadata } from "@/components/public-legal-page";
import { getPublicSiteName } from "@/lib/public-site";

export const metadata: Metadata = publicPageMetadata(
  "/editorial-policy",
  "Editorial Policy",
  "How reviews on this site are sourced, drafted, checked, and published, and what the reviews do not claim.",
);

export default function EditorialPolicyPage() {
  const site = getPublicSiteName();

  return (
    <PublicLegalLayout title="Editorial Policy" path="/editorial-policy" kicker="How we work">
      <p>
        This policy describes how {site} produces a review page, what the page can and cannot tell you, and how
        affiliate commissions relate to the content.
      </p>

      <LegalSection title="1. Sources">
        <p>
          Each review starts from the product&apos;s public listing (usually the seller&apos;s sales page) and
          related public sources about the product. The statements a page relies on are recorded together with
          where they came from, so each sentence on the page can be traced back to a source.
        </p>
        <p>
          When the source is the seller, the page says so. A seller&apos;s description of a product is reported as
          what the seller states. It is not treated as an independently verified fact.
        </p>
      </LegalSection>

      <LegalSection title="2. Drafting">
        <p>
          Drafts are prepared with the help of software, including AI language models. The software works from
          the recorded source material only. It is not allowed to add general knowledge, invented details, or
          claims the sources do not contain.
        </p>
      </LegalSection>

      <LegalSection title="3. Automated checks">
        <ul>
          <li>Every statement is checked against the recorded sources. Statements without support are removed or block the page.</li>
          <li>Information a source does not provide is left out; it is not guessed or filled in.</li>
          <li>
            Health-related wording is checked against content rules. Pages may not claim that a product diagnoses,
            treats, cures, or prevents a disease, and may not promise results.
          </li>
          <li>
            Operational details such as returns, shipping, formats, or fees are restated as the seller publishes them.
            They are never turned into a promise from {site}.
          </li>
        </ul>
        <p>
          A page with little source material may be short. We prefer a short, accurate page to a long one padded
          with filler.
        </p>
      </LegalSection>

      <LegalSection title="4. Human publication decision">
        <p>
          Nothing is published automatically. A person reviews the result and decides whether a page goes live.
          Pages can be updated or taken offline at any time.
        </p>
      </LegalSection>

      <LegalSection title="5. What our reviews are not">
        <ul>
          <li>They are not hands-on product tests. We do not currently use or test the products ourselves.</li>
          <li>They are not laboratory, clinical, or scientific evaluations.</li>
          <li>They are not medical advice. Talk to a qualified professional before starting a supplement or changing a treatment.</li>
          <li>They are not ratings or rankings. We do not assign scores, stars, or &ldquo;best&rdquo; labels.</li>
        </ul>
        <p>If any of this changes for a specific page, that page will say what was done.</p>
      </LegalSection>

      <LegalSection title="6. Which products we cover">
        <p>
          We review products that offer an affiliate program, so our coverage is not a complete survey of any
          market. A product appearing on this site is not an endorsement over products we have not covered.
        </p>
      </LegalSection>

      <LegalSection title="7. Affiliate relationships">
        <p>
          We may earn a commission when a reader buys through a link on a review. Commissions do not change what
          a page is allowed to say: the source and claim checks above apply regardless of any commission. Details
          are on the <Link href="/affiliate-disclosure">Affiliate Disclosure</Link> page.
        </p>
      </LegalSection>

      <LegalSection title="8. Corrections">
        <p>
          If you believe a page misstates its sources, please tell us through the{" "}
          <Link href="/contact">Contact</Link> page and include the page address. Confirmed errors are corrected
          or the page is taken offline.
        </p>
      </LegalSection>
    </PublicLegalLayout>
  );
}
