import type { Metadata } from "next";
import Link from "next/link";
import { PortalShell } from "@/components/portal/portal-shell";
import { ReviewGrid } from "@/components/portal/review-card";
import { publishedReviewCards } from "@/lib/portal/reviews";
import { getPublicSiteName, publicAbsoluteUrl } from "@/lib/public-site";

/** The catalog is the current published set; it must never be a build-time snapshot. */
export const dynamic = "force-dynamic";

const DESCRIPTION = "Every product review currently published on this site, newest first. No scores or rankings.";

export function generateMetadata(): Metadata {
  const site = getPublicSiteName();
  return {
    title: `Reviews · ${site}`,
    description: DESCRIPTION,
    alternates: { canonical: publicAbsoluteUrl("/reviews") },
    robots: { index: true, follow: true },
    openGraph: { title: `Reviews · ${site}`, description: DESCRIPTION, url: publicAbsoluteUrl("/reviews"), siteName: site, type: "website" },
  };
}

export default function ReviewsPage() {
  const cards = publishedReviewCards();

  return (
    <PortalShell current="/reviews">
      <header className="pt-page-head">
        <div className="pt-wrap">
          <p className="pt-kicker">Catalog</p>
          <h1 className="pt-display">Reviews</h1>
          <p className="pt-lede">
            Every review currently published, newest first. Reviews are not ranked or scored; each one restates its
            sources as described in our <Link href="/editorial-policy">Editorial Policy</Link>.
          </p>
        </div>
      </header>
      <section className="pt-section" aria-label="Published reviews">
        <div className="pt-wrap">
          <ReviewGrid cards={cards} headingLevel={2} />
        </div>
      </section>
    </PortalShell>
  );
}
