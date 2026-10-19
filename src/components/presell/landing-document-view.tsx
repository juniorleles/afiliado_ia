import "@/app/presell-design.css";
import Script from "next/script";
import Link from "next/link";
import type { Campaign } from "@/lib/campaigns";
import { buildAffiliateHref } from "@/lib/affiliate-url";
import { isHttpUrl } from "@/lib/editor-layers";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  TRUST_EDITORIAL,
  getPublicSiteName,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";
import { isPendingHealthClaim, presentLandingDocument, restoredDescription, type PresentedSection } from "@/lib/landing-composer/present";
import type { LandingDocument } from "@/lib/landing-composer/types";
import { isCopyEligibleImageProvenance } from "@/lib/product-facts";
import { FAQAccordion } from "@/components/presell/faq-accordion";
import { ProductImage } from "@/components/presell/product-image";
import { outboundCta, PresellCta } from "@/components/presell/presell-cta";

function Cards({ items, className }: { items: string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <ul className={className ? `ps-doc-grid ${className}` : "ps-doc-grid"}>
      {items.map((item) => (
        <li key={item} className="ps-doc-card">{item}</li>
      ))}
    </ul>
  );
}

function SectionBlock({ section }: { section: PresentedSection }) {
  if (section.kind === "overview") {
    return (
      <section className="ps-doc-section" aria-labelledby="lp-overview">
        <h2 id="lp-overview">Product overview</h2>
        <Cards items={section.items} />
      </section>
    );
  }
  if (section.kind === "ingredients") {
    return (
      <section className="ps-doc-section" aria-labelledby="lp-ingredients">
        <h2 id="lp-ingredients">Ingredients</h2>
        <Cards items={section.names} className="ps-doc-ingredients" />
      </section>
    );
  }
  if (section.kind === "details") {
    return (
      <section className="ps-doc-section" aria-labelledby="lp-details">
        <h2 id="lp-details">Product details</h2>
        <Cards items={section.items} />
      </section>
    );
  }
  if (section.kind === "guarantee") {
    return (
      <section className="ps-doc-section" aria-labelledby="lp-guarantee">
        <h2 id="lp-guarantee">Guarantee</h2>
        <p className="ps-doc-guarantee">{section.text}</p>
      </section>
    );
  }
  if (section.kind === "important") {
    return (
      <section className="ps-doc-section" aria-labelledby="lp-important">
        <h2 id="lp-important">Important information</h2>
        <Cards items={section.items} />
      </section>
    );
  }
  return (
    <section className="ps-doc-section" aria-labelledby="lp-questions">
      <h2 id="lp-questions">Questions</h2>
      <FAQAccordion items={section.items} />
    </section>
  );
}

export function LandingDocumentView({
  campaign,
  document,
  incomingQuery = "",
  renderPixel = false,
  trackClicks = false,
  disableAffiliateNavigation = false,
  showImagePlaceholder = false,
}: {
  campaign: Campaign;
  document: LandingDocument;
  incomingQuery?: string;
  renderPixel?: boolean;
  trackClicks?: boolean;
  disableAffiliateNavigation?: boolean;
  showImagePlaceholder?: boolean;
}) {
  const hero = document.sections.find((section) => section.sectionId === "hero");
  const clipped = typeof hero?.content.subheadline === "string" ? hero.content.subheadline : "";
  const presented = presentLandingDocument(document, { description: restoredDescription(campaign.sourceFactsJson, clipped) });
  const productName = campaign.headline.trim() || presented.productName;
  const override = campaign.subheadline?.trim() ?? "";
  const description = override && !override.includes("…") && !override.endsWith("...") && !isPendingHealthClaim(override)
    ? override
    : presented.description;
  const label = campaign.ctaLabel.trim() || presented.ctaLabel || "";
  const destination = campaign.affiliateUrl.trim();
  const canAct = label.length > 0 && isHttpUrl(destination) && !/^javascript:/i.test(destination) && !/^data:/i.test(destination);
  const href = canAct ? buildAffiliateHref(destination, new URLSearchParams(incomingQuery)) : "";
  const action = canAct ? outboundCta(href, trackClicks) : null;
  const official = campaign.productImageSrc?.trim() && isCopyEligibleImageProvenance(campaign.productImageProvenance ?? undefined)
    ? {
        src: campaign.productImageSrc.trim(),
        alt: `${productName} product image`,
        provenance: campaign.productImageProvenance === "MANUAL" ? "MANUAL" as const : "DIRECT_SOURCE" as const,
      }
    : null;

  return (
    <article className="ps-doc" data-landing-presentation="document">
      {renderPixel && campaign.headScript ? (
        <Script id="presell-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: campaign.headScript }} />
      ) : null}
      <div className="ps-shell ps-doc-shell">
        <header className="ps-doc-hero">
          <div>
            <h1 className="ps-doc-title">{productName}</h1>
            {description ? <p className="ps-doc-lead">{description}</p> : null}
            <p className="ps-doc-disclosure">{AFFILIATE_DISCLOSURE_TEXT}</p>
            {action ? (
              <PresellCta
                href={action.href}
                label={label}
                position="hero"
                campaignId={campaign.id}
                trackClicks={trackClicks}
                clickId={action.clickId}
                disableAffiliateNavigation={disableAffiliateNavigation}
                appearance="theme"
              />
            ) : null}
          </div>
          {official ? <ProductImage image={official} size="hero" /> : null}
          {!official && showImagePlaceholder ? (
            <div className="ps-doc-placeholder" role="img" aria-label={`${productName} product image`}>
              <p>{productName}</p>
              <p>Product image not available</p>
            </div>
          ) : null}
        </header>

        {presented.sections.map((section) => (
          <SectionBlock key={section.kind} section={section} />
        ))}

        <section className="ps-doc-trust ps-doc-secondary" aria-labelledby="how-we-review-heading">
          <h2 id="how-we-review-heading">{TRUST_EDITORIAL.heading}</h2>
          {TRUST_EDITORIAL.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
        {isHealthDisclaimerEnabled() ? <p className="ps-doc-health">{HEALTH_DISCLAIMER_TEXT}</p> : null}

        {action ? (
          <PresellCta
            href={action.href}
            label={label}
            position="final"
            campaignId={campaign.id}
            trackClicks={trackClicks}
            clickId={action.clickId}
            disableAffiliateNavigation={disableAffiliateNavigation}
            appearance="theme"
          />
        ) : null}

        <footer className="ps-doc-footer">
          {presented.footerName ? <p>{presented.footerName}</p> : null}
          <p>{getPublicSiteName()}</p>
          <nav aria-label="Site">
            {PUBLIC_FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href}>{link.label}</Link>
            ))}
          </nav>
        </footer>
      </div>
    </article>
  );
}
