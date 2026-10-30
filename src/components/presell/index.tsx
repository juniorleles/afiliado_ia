import React from "react";
import {
  FulfillmentCardGrid,
  GuaranteeBand,
  IngredientCardGrid,
  PremiumCta,
  PremiumFaq,
  UsageSteps,
} from "@/components/design-system/premium-blocks";
import type { FaqView, FulfillmentCardModel, GuaranteeView, IngredientCardModel } from "@/lib/presell-quality/premium-slots";

export function AnnouncementBar({ message }: { message: string }) {
  if (!message.trim()) return null;
  return (
    <div className="presell-announce" data-presell-section="ANNOUNCEMENT_BAR" data-premium="announcement">
      <p>{message}</p>
    </div>
  );
}

export function ProductImageStage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="ds-hero__stage" data-presell-section="PRODUCT_IMAGE_STAGE">
      <div className="ds-hero__frame">
        <img src={src} alt={alt} width={1200} height={1200} data-v4-image="commercial" decoding="async" />
      </div>
    </div>
  );
}

export function TrustInformation({ items }: { items: FulfillmentCardModel[] }) {
  if (!items.length) return null;
  return (
    <div data-presell-section="TRUST_INFORMATION">
      <FulfillmentCardGrid items={items} />
    </div>
  );
}

export function ProductOverview({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  return (
    <div className="v4-points" data-presell-section="PRODUCT_OVERVIEW">
      {lines.map((line) => (
        <p className="v4-point" key={line}>
          {line}
        </p>
      ))}
    </div>
  );
}

export function HowItWorks({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div data-presell-section="HOW_IT_WORKS">
      <UsageSteps items={items} />
    </div>
  );
}

export function IngredientsOrModules({ items }: { items: IngredientCardModel[] }) {
  if (!items.length) return null;
  return (
    <div data-presell-section="INGREDIENTS_OR_MODULES">
      <IngredientCardGrid items={items} />
    </div>
  );
}

export function GuaranteeSection({ view }: { view: GuaranteeView }) {
  if (!view.statements.length) return null;
  return (
    <div data-presell-section="GUARANTEE">
      <GuaranteeBand view={view} />
    </div>
  );
}

export function CommercialCTA({ slot }: { slot: "hero" | "mid" | "sticky" }) {
  return (
    <div data-presell-section="COMMERCIAL_CTA">
      <PremiumCta slot={slot} />
    </div>
  );
}

export function ShippingOrAccess({ items }: { items: FulfillmentCardModel[] }) {
  if (!items.length) return null;
  return (
    <div data-presell-section="SHIPPING_OR_ACCESS">
      <FulfillmentCardGrid items={items} />
    </div>
  );
}

export function VerifiedTestimonials() {
  return null;
}

export function PremiumFAQ({ items }: { items: FaqView[] }) {
  if (!items.length) return null;
  return (
    <div data-presell-section="PREMIUM_FAQ">
      <PremiumFaq items={items} />
    </div>
  );
}

export function AffiliateDisclosure({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <p className="ds-caption" data-presell-section="AFFILIATE_DISCLOSURE">
      {text}
    </p>
  );
}

export function LegalFooter({
  lines,
  links,
}: {
  lines: string[];
  links: Array<{ href: string; label: string }>;
}) {
  return (
    <footer className="ds-footer" data-presell-section="LEGAL_FOOTER" data-v4-section="legal">
      {lines.map((line) => (
        <p className="ds-caption" key={line}>
          {line}
        </p>
      ))}
      <nav aria-label="Legal">
        {links.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}
