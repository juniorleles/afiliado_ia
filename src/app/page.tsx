import type { Metadata } from "next";
import Link from "next/link";
import { PortalShell } from "@/components/portal/portal-shell";
import { ReviewGrid } from "@/components/portal/review-card";
import { publishedReviewCards } from "@/lib/portal/reviews";
import { getPublicSiteName, publicAbsoluteUrl } from "@/lib/public-site";

/** Lists the currently published reviews. */
export const dynamic = "force-dynamic";

const HOME_LATEST_LIMIT = 6;
const HOME_DESCRIPTION =
  "Independent product reviews that explain what a product is, what its seller says, and what the public information does and does not show.";

export function generateMetadata(): Metadata {
  const site = getPublicSiteName();
  return {
    title: `${site} · Independent product reviews`,
    description: HOME_DESCRIPTION,
    alternates: { canonical: publicAbsoluteUrl("/") },
    robots: { index: true, follow: true },
    openGraph: { title: site, description: HOME_DESCRIPTION, url: publicAbsoluteUrl("/"), siteName: site, type: "website" },
  };
}

const METHOD = [
  {
    title: "Start from the sources",
    text: "Each review begins with the product's public listing and related public sources, recorded with where every statement came from.",
  },
  {
    title: "Say who is speaking",
    text: "A seller's claim is reported as the seller's claim. It is not presented as an independently verified fact.",
  },
  {
    title: "Check every claim",
    text: "Automated checks remove statements the sources do not support and block prohibited health or results claims.",
  },
  {
    title: "A person decides",
    text: "Nothing goes live automatically. A person decides whether a page is ready to publish.",
  },
] as const;

export default function HomePage() {
  const site = getPublicSiteName();
  const cards = publishedReviewCards();
  const latest = cards.slice(0, HOME_LATEST_LIMIT);

  return (
    <PortalShell current="/">
      <section className="pt-hero" aria-labelledby="home-title">
        <div className="pt-wrap">
          <p className="pt-kicker">Independent product reviews</p>
          <h1 id="home-title" className="pt-display">
            Clear, sourced reviews of the products you are considering.
          </h1>
          <p className="pt-lede">
            {site} explains what a product is, what its seller says about it, and what the available public
            information does and does not show, so you can decide with the facts in front of you.
          </p>
          <div className="pt-actions">
            <Link href="/reviews" className="pt-button">
              Browse reviews
            </Link>
            <Link href="/editorial-policy" className="pt-textlink">
              How we review →
            </Link>
          </div>
        </div>
      </section>

      <section className="pt-section" aria-labelledby="latest-title">
        <div className="pt-wrap">
          <div className="pt-section-head">
            <div>
              <h2 id="latest-title" className="pt-h2">
                Latest reviews
              </h2>
              <p className="pt-intro">Every review currently published on {site}, newest first.</p>
            </div>
            {cards.length > latest.length ? (
              <Link href="/reviews" className="pt-textlink">
                All reviews →
              </Link>
            ) : null}
          </div>
          <ReviewGrid cards={latest} />
        </div>
      </section>

      <section className="pt-section" aria-labelledby="method-title">
        <div className="pt-wrap">
          <div className="pt-section-head">
            <div>
              <h2 id="method-title" className="pt-h2">
                How reviews are made
              </h2>
              <p className="pt-intro">The same four steps apply to every page, whatever the product.</p>
            </div>
            <Link href="/editorial-policy" className="pt-textlink">
              Read the editorial policy →
            </Link>
          </div>
          <ol className="pt-steps">
            {METHOD.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="pt-section" aria-labelledby="transparency-title">
        <div className="pt-wrap pt-panel">
          <div>
            <h2 id="transparency-title" className="pt-h2">
              What our reviews are not
            </h2>
            <p className="pt-intro">Knowing the limits of a page is part of reading it well.</p>
            <ul className="pt-list">
              <li>Not hands-on tests. We do not use or test the products ourselves.</li>
              <li>Not laboratory, clinical, or scientific evaluations.</li>
              <li>Not medical advice. Talk to a qualified professional about your health.</li>
              <li>Not ratings. We do not assign scores, stars, or &ldquo;best&rdquo; labels.</li>
            </ul>
          </div>
          <aside className="pt-note" aria-labelledby="disclosure-title">
            <h3 id="disclosure-title">How this site is funded</h3>
            <p>
              Review pages contain affiliate links. If you buy through one, the seller or affiliate network may pay
              us a commission. It does not add to your price, and it does not change what a page is allowed to say.
            </p>
            <p>
              We are not the manufacturer or seller of any product we review.{" "}
              <Link href="/affiliate-disclosure">Read the affiliate disclosure</Link>.
            </p>
          </aside>
        </div>
      </section>
    </PortalShell>
  );
}
