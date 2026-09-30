import Link from "next/link";
import type { ReviewCard as ReviewCardData } from "@/lib/portal/reviews";

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function ReviewCard({ card, headingLevel = 3 }: { card: ReviewCardData; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const published = formatDate(card.publishedAt);
  return (
    <article className="pt-card">
      <div className="pt-card-media">
        {card.image ? (
          <img
            src={card.image.src}
            alt={card.image.alt}
            width={card.image.width}
            height={card.image.height}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span className="pt-card-media-empty" aria-hidden="true">
            {card.productName}
          </span>
        )}
      </div>
      <div className="pt-card-body">
        <p className="pt-card-label">Review</p>
        <Heading className="pt-card-title">
          <Link href={card.href}>{card.title}</Link>
        </Heading>
        {card.summary ? <p className="pt-card-summary">{card.summary}</p> : null}
        <p className="pt-card-meta">
          {published ? <>Published <time dateTime={card.publishedAt}>{published}</time> · </> : null}
          <span className="pt-card-cta" aria-hidden="true">
            Read the review →
          </span>
        </p>
      </div>
    </article>
  );
}

export function ReviewGrid({ cards, headingLevel = 3 }: { cards: ReviewCardData[]; headingLevel?: 2 | 3 }) {
  if (cards.length === 0) {
    return <p className="pt-empty">No reviews are published yet. New reviews appear here as soon as they go live.</p>;
  }
  return (
    <ul className="pt-cards">
      {cards.map((card) => (
        <li key={card.slug}>
          <ReviewCard card={card} headingLevel={headingLevel} />
        </li>
      ))}
    </ul>
  );
}
