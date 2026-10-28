import React from "react";
import {
  PREMIUM_CTA_CAPTION,
  PREMIUM_CTA_LABEL,
} from "@/lib/presell-quality/premium-design";
import type {
  FaqView,
  FulfillmentCardModel,
  GuaranteeView,
  IngredientCardModel,
  PremiumIconName,
} from "@/lib/presell-quality/premium-slots";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function PremiumIcon({ name }: { name: PremiumIconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  return (
    <svg className="premium-icon" {...common}>
      {name === "leaf" ? <path d="M5 19c8-1 12-8 14-14-6 2-13 6-14 14Zm0 0c2-4 6-7 11-8" /> : null}
      {name === "truck" ? (
        <>
          <path d="M3 7h11v8H3z" />
          <path d="M14 10h4l3 3v2h-7" />
          <circle cx="7" cy="18" r="1.4" />
          <circle cx="17" cy="18" r="1.4" />
        </>
      ) : null}
      {name === "clock" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v5l3 2" />
        </>
      ) : null}
      {name === "shield" ? <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z" /> : null}
      {name === "card" ? (
        <>
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <path d="M3 10h18" />
        </>
      ) : null}
      {name === "help" ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8" />
          <path d="M12 17h.01" />
        </>
      ) : null}
      {name === "package" ? (
        <>
          <path d="M12 3 20 7.5v9L12 21 4 16.5v-9L12 3Z" />
          <path d="M12 12 20 7.5M12 12v9M12 12 4 7.5" />
        </>
      ) : null}
    </svg>
  );
}

export function PremiumCta({
  label = PREMIUM_CTA_LABEL,
  caption = PREMIUM_CTA_CAPTION,
  slot,
}: {
  label?: string;
  caption?: string;
  slot: "hero" | "mid" | "sticky";
}) {
  return (
    <div className="premium-cta" data-premium-cta={slot}>
      <span className="ds-btn ds-btn--cta ds-btn--preview" aria-disabled="true" data-v4-cta="preview-disabled">
        {label}
      </span>
      <p className="ds-caption premium-cta__caption">{caption}</p>
    </div>
  );
}

export function IngredientCardGrid({ items }: { items: IngredientCardModel[] }) {
  if (!items.length) return null;
  return (
    <div className="premium-grid" data-premium="ingredients" data-count={String(Math.min(items.length, 4))}>
      {items.map((item) => (
        <article className="premium-card" key={item.name} data-premium-card="ingredient">
          <span className="premium-card__icon">
            <PremiumIcon name="leaf" />
          </span>
          <h3 className="ds-h3">{item.name}</h3>
          {item.detail ? <p className="ds-body">{item.detail}</p> : null}
        </article>
      ))}
    </div>
  );
}

export function FulfillmentCardGrid({ items }: { items: FulfillmentCardModel[] }) {
  if (!items.length) return null;
  return (
    <div className="premium-grid" data-premium="fulfillment" data-count={String(Math.min(items.length, 3))}>
      {items.map((item) => (
        <article className="premium-card" key={`${item.kind}-${item.body.slice(0, 24)}`} data-premium-card={item.kind.toLowerCase()}>
          <span className="premium-card__icon">
            <PremiumIcon name={item.icon} />
          </span>
          <p className="ds-kicker">{item.title}</p>
          <p className="ds-body">{item.body}</p>
        </article>
      ))}
    </div>
  );
}

export function GuaranteeBand({ view }: { view: GuaranteeView }) {
  if (!view.statements.length) return null;
  return (
    <div className="premium-guarantee" data-premium="guarantee">
      <span className="premium-guarantee__icon">
        <PremiumIcon name="shield" />
      </span>
      {view.days ? (
        <p className="premium-guarantee__days">
          <strong>{view.days}</strong>
          <span>days</span>
        </p>
      ) : null}
      <div className="premium-guarantee__copy">
        <p className="ds-caption" data-v4-attribution="seller">
          Seller-stated. Not independently verified.
        </p>
        {view.statements.map((line) => (
          <p className="ds-body" key={line}>
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

export function PremiumFaq({ items }: { items: FaqView[] }) {
  if (!items.length) return null;
  return (
    <div className="ds-faq premium-faq" data-premium="faq">
      {items.map((item) => (
        <details className="ds-faq__item premium-faq__item" key={item.question}>
          <summary>
            <PremiumIcon name="help" />
            <span>{item.question}</span>
          </summary>
          <p className="ds-body">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function EvidenceChips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="ds-hero-chips" data-premium="chips">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export { cx };
