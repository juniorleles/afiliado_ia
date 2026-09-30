import "@/app/visual-master-v1.css";
import { Newsreader, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import type { PresellPage, PresellSection } from "@/lib/presell-page";
import type { IntegratedVisualAssets, VisualAssetBinding } from "@/lib/visual-concept/asset-binding";
import type { RenderedProductShot, RenderedProductVisuals } from "@/lib/product-visual/types";
import {
  AFFILIATE_DISCLOSURE_TEXT,
  HEALTH_DISCLAIMER_TEXT,
  PUBLIC_FOOTER_LINKS,
  TRUST_EDITORIAL,
  getPublicSiteName,
  isHealthDisclaimerEnabled,
} from "@/lib/public-site";
import { consumerFacingFaqQuestion, returnSectionLabel } from "@/lib/presell-section-labels";
import { renderedBuilderContent } from "@/lib/builder-content";
import { structuredSplit } from "@/lib/presell-structured-display";
import { composeAdaptivePresentation } from "@/lib/premium/adaptive-composition";
import { composeComponents, followsPresentationPlan, type ComponentDirection } from "@/lib/premium/component-composers";
import type { PresentationPlan } from "@/lib/presentation-plan";
import { DecorativeMark } from "@/components/presell/decorative-marks";
import { ingredientFactKey } from "@/lib/assets/ingredient-visual-association";

const serif = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--vm-serif",
  display: "swap",
});

const sans = Outfit({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--vm-sans",
  display: "swap",
});

function visibleSection(page: PresellPage, id: PresellSection["id"]): PresellSection | undefined {
  return page.sections.find((section) => section.id === id && section.visible);
}

/** Sections with a dedicated place in this layout. Everything else still has to reach the reader. */
const PLACED_SECTIONS: ReadonlyArray<PresellSection["id"]> = ["overview", "features", "usage", "guarantee", "faq"];

function hasContent(section: PresellSection): boolean {
  return section.paragraphs.length > 0 || section.bullets.length > 0 || section.cards.length > 0;
}

/**
 * Sparse content must not be stretched into a tall page of empty decoration.
 * Below this much running copy the layout tightens: decorative-only bands
 * shrink, type and product presence grow, and the remaining sections group.
 * The number is the point where the copy stops filling a desktop column.
 */
const COMPACT_CONTENT_CHARS = 1600;

/** A section this short is one statement: it sits as type, not inside a padded card. */
const SHORT_STATEMENT_CHARS = 220;

function sectionVolume(section: PresellSection): number {
  return [
    ...section.paragraphs,
    ...section.bullets,
    ...section.cards.flatMap((card) => [card.title, card.body]),
    ...section.faq.flatMap((item) => [item.question, item.answer]),
  ].join(" ").trim().length;
}

function contentVolume(page: PresellPage): number {
  const sections = page.sections.filter((section) => section.visible).reduce((sum, section) => sum + sectionVolume(section), 0);
  return sections + page.hero.summary.trim().length + page.hero.subheadline.trim().length;
}

function textBlocks(section: PresellSection | undefined): string[] {
  if (!section) return [];
  return [
    ...section.paragraphs,
    ...section.bullets,
    ...section.cards.flatMap((card) => [card.title, card.body]),
  ]
    .map((line) => line.trim())
    .filter(Boolean);
}

function Photo({
  name,
  role,
  src,
  className = "",
  collapseWhenMissing = false,
}: {
  name: string;
  role: VisualAssetBinding;
  src?: string;
  className?: string;
  /** Inline column slots leave a hole when empty. Full-bleed slots fall back to their painted ground. */
  collapseWhenMissing?: boolean;
}) {
  if (!src) {
    if (collapseWhenMissing) return null;
    return <div className={`vm-photo ${className}`.trim()} data-missing-asset={name} data-visual-role={role} aria-hidden="true" />;
  }
  return (
    <div className={`vm-photo-frame ${className}`.trim()} data-visual-role={role} data-asset-slot={name}>
      <img className="vm-photo vm-photo-bound" src={src} alt="" />
    </div>
  );
}

function ProductShot({ shot, className, alt }: { shot: RenderedProductShot; className: string; alt: string }) {
  return (
    <img
      className={`vm-product ${className}`}
      src={shot.src}
      alt={alt}
      width={shot.width}
      height={shot.height}
      data-product-role={shot.roles[0]}
      data-product-roles={shot.roles.join(" ")}
    />
  );
}

export function VisualMasterView({
  page,
  heroCta,
  navCta,
  finalCta,
  visualAssets = {},
  productVisuals = {},
  structuredLists = [],
  productName = "",
  offerCount = 0,
  presentationPlan,
  offers = [],
  ingredientImages = {},
}: {
  page: PresellPage;
  heroCta: ReactNode;
  navCta: ReactNode;
  finalCta: ReactNode;
  visualAssets?: IntegratedVisualAssets;
  productVisuals?: RenderedProductVisuals;
  /** Ordered values the copy was composed from, used only to lay a run-on line out as rows. */
  structuredLists?: ReadonlyArray<ReadonlyArray<string>>;
  /** Product identity from the campaign facts; names the product images for assistive tech. */
  productName?: string;
  /** Authorized offer cards. Zero means the offer band is absent and must not reserve space. */
  offerCount?: number;
  /** Layout decisions. Absent keeps the existing composition. */
  presentationPlan?: PresentationPlan;
  /** Authorized offer lines. The pricing variant decides whether they appear. */
  offers?: ReadonlyArray<{ name: string; price: string; totalPrice?: string }>;
  /** Imported ingredient images, keyed by the ingredient fact. Missing keys use the icon. */
  ingredientImages?: Readonly<Record<string, string>>;
}) {
  const overview = visibleSection(page, "overview");
  const features = visibleSection(page, "features");
  const usage = visibleSection(page, "usage");
  const returns = visibleSection(page, "guarantee");
  const faq = visibleSection(page, "faq");
  const additional = page.sections.filter(
    (section) => section.visible && !PLACED_SECTIONS.includes(section.id) && hasContent(section),
  );
  const headline = page.hero.headline.trim();
  const adaptive = composeAdaptivePresentation({
    productName,
    headline,
    subheadline: page.hero.subheadline,
    summary: page.hero.summary,
    sections: page.sections,
    structuredLists,
    offerCount,
  });
  const legacyDensity = contentVolume(page) < COMPACT_CONTENT_CHARS ? "compact" : "standard";
  const direction: ComponentDirection | null = presentationPlan
    ? composeComponents({
        plan: presentationPlan,
        identity: productName,
        headline,
        subheadline: page.hero.subheadline,
        summary: page.hero.summary,
        description: textBlocks(overview).join(" "),
        featureUnits: adaptive.featureUnits,
        legacyContentDensity: legacyDensity,
      })
    : null;
  const followPlan = Boolean(direction && presentationPlan && followsPresentationPlan(presentationPlan, adaptive.mode));
  const support = followPlan && direction ? direction.heroSupport : adaptive.heroSupport;
  const heroHeadline = followPlan && direction ? direction.heroHeadline : adaptive.heroHeadline;
  const heroChips = followPlan && direction ? direction.heroChips : adaptive.heroChips;
  const closingLine = followPlan && direction ? direction.closing : adaptive.closing;
  const featurePresentation =
    followPlan && direction?.featureVariant
      ? direction.featureVariant === "HIGHLIGHT"
        ? "highlight"
        : direction.featureVariant === "LIST"
          ? "list"
          : direction.featureVariant === "CARDS"
            ? "cards"
            : direction.featureVariant === "MOSAIC"
              ? "mosaic"
              : "chips"
      : adaptive.featurePresentation;
  const featurePlacement =
    followPlan && direction?.featureVariant === "CHIPS"
      ? "hero"
      : followPlan && direction?.featureVariant
        ? "section"
        : adaptive.featurePlacement;
  const ingredientPresentation =
    followPlan && direction?.ingredientVariant
      ? direction.ingredientVariant === "EDITORIAL"
        ? "editorial"
        : direction.ingredientVariant === "GRID"
          ? "grid"
          : direction.ingredientVariant === "COMPACT"
            ? "compact"
            : "dense"
      : adaptive.ingredientPresentation;
  const pageDensity = followPlan && direction ? direction.pageDensity : adaptive.mode;
  const density = followPlan && direction ? direction.contentDensity : adaptive.mode === "rich" ? "standard" : adaptive.mode === "low" ? "compact" : legacyDensity;
  const omitDecorativePause = followPlan && direction ? direction.omitDecorativePause : adaptive.omitDecorativePause;
  const omitSectionMoment = followPlan && direction ? direction.pageDensity === "low" : adaptive.omitSectionMoment;
  const brand = adaptive.replacedFeatureHeadline || (followPlan && heroHeadline === productName.trim() && heroHeadline !== headline) ? adaptive.identity || heroHeadline : headline;
  const packshot = page.hero.image.src && page.hero.image.provenance !== "PLACEHOLDER" ? page.hero.image : null;
  const placedIngredients = ingredientPresentation !== "notes";
  const residual = additional.filter((section) => !(placedIngredients && section.id === "ingredients"));
  /** Sparse pages read better as one grouped core than as a chain of thin bands. */
  const core = pageDensity !== "low" && (residual.length > 0 || (density === "compact" && Boolean(usage)));
  const coreMaterial: { src?: string; role: VisualAssetBinding } = visualAssets.usageVisual
    ? { src: visualAssets.usageVisual, role: "usageVisual" }
    : { src: overview || features ? undefined : visualAssets.editorialMaterial, role: "editorialMaterial" };
  const content = renderedBuilderContent(page);
  const nav = [
    overview ? { href: "#overview", label: content?.navLabels?.["#overview"] || overview.title } : null,
    features ? { href: "#features", label: content?.navLabels?.["#features"] || features.title } : null,
    usage ? { href: "#usage", label: content?.navLabels?.["#usage"] || usage.title } : null,
    faq ? { href: "#faq", label: content?.navLabels?.["#faq"] || faq.title } : null,
  ].filter((item): item is { href: string; label: string } => Boolean(item?.label.trim()));
  const productAlt = productName.trim();
  const usageShort = textBlocks(usage).join(" ").length <= SHORT_STATEMENT_CHARS;
  const returnLabel = returns ? returnSectionLabel(returns.title, textBlocks(returns)) : "";

  return (
    <div
      className={`${serif.variable} ${sans.variable} vm-page`}
      data-visual-system="visual-master-v1"
      data-content-density={density}
      data-page-density={pageDensity}
      data-hero-strategy={followPlan && direction ? direction.heroStrategy.toLowerCase() : adaptive.heroStrategy}
      data-spacing={followPlan && direction ? direction.spacingProfile.toLowerCase() : undefined}
      data-rhythm={followPlan && direction ? direction.rhythmProfile.toLowerCase() : undefined}
    >
      {/* Precedes every affiliate link on the page, including the header CTA. */}
      <p className="vm-disclosure-bar" data-affiliate-disclosure="page-top">
        {content?.disclosure || AFFILIATE_DISCLOSURE_TEXT}
      </p>
      <header className="vm-nav">
        <a className="vm-brand" href="#top">
          {brand}
        </a>
        {nav.length > 0 ? (
          <nav className="vm-nav-links" aria-label="Page">
            {nav.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        ) : null}
        <span className="vm-cta vm-cta-nav">{navCta}</span>
      </header>

      <section className="vm-hero" id="top">
        <Photo name="hero-photography" role="heroAtmosphere" src={visualAssets.heroAtmosphere} className="vm-photo-hero" />
        <div className="vm-hero-copy">
          {/* With no support line the badge is the only framing the hero has. */}
          {!support && page.hero.badge.trim() ? <p className="vm-eyebrow">{page.hero.badge.trim()}</p> : null}
          <h1 className="vm-display">{heroHeadline}</h1>
          {support ? <p className="ps-hero-summary vm-lede">{support}</p> : null}
          {content?.heroDisclaimer ? <p className="ps-hero-summary">{content.heroDisclaimer}</p> : null}
          {heroChips.length > 0 ? (
            <div className="vm-hero-features" id="features" data-section-id="features">
              {features ? <p className="vm-kicker">{features.title}</p> : null}
              <ul className="vm-feature-chips" data-feature-presentation="chips">
                {heroChips.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <span className="vm-cta">{heroCta}</span>
        </div>
        <div className="vm-hero-stage">
          {productVisuals.heroPrimary ? (
            <ProductShot shot={productVisuals.heroPrimary} className="vm-product-hero" alt={productAlt} />
          ) : packshot ? (
            <img
              className="vm-pack"
              src={packshot.src}
              alt={packshot.alt || page.hero.headline}
              width={800}
              height={800}
            />
          ) : null}
        </div>
      </section>

      {overview ? (
        <section
          className={visualAssets.editorialMaterial ? "vm-split vm-overview" : "vm-split vm-overview vm-split-solo"}
          id="overview"
          data-section-id="overview"
        >
          <div>
            <p className="vm-kicker">{overview.title}</p>
            <div className="vm-overview-copy">
              {textBlocks(overview).map((line) => (
                <p key={line} className="vm-overview-line">
                  {line}
                </p>
              ))}
            </div>
          </div>
          <Photo
            name="overview-material"
            role="editorialMaterial"
            src={visualAssets.editorialMaterial}
            className="vm-photo-overview"
            collapseWhenMissing
          />
        </section>
      ) : null}

      {features && featurePlacement === "section" && featurePresentation === "paragraphs" ? (
        <section
          className={visualAssets.featureVisual ? "vm-split vm-features" : "vm-split vm-features vm-split-solo"}
          id="features"
          data-section-id="features"
          data-feature-presentation="paragraphs"
        >
          <Photo
            name="feature-material"
            role="featureVisual"
            src={visualAssets.featureVisual}
            className="vm-photo-feature"
            collapseWhenMissing
          />
          <div className="ps-feature-copy">
            <p className="vm-kicker">{features.title}</p>
            {textBlocks(features).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>
      ) : null}

      {features && featurePlacement === "section" && featurePresentation !== "paragraphs" && featurePresentation !== "highlight" && pageDensity !== "low" ? (
        <section
          className={visualAssets.featureVisual ? "vm-split vm-features" : "vm-split vm-features vm-split-solo"}
          id="features"
          data-section-id="features"
          data-feature-presentation={featurePresentation}
          data-emphasis={followPlan && direction?.emphasis.includes("features") ? "primary" : undefined}
        >
          <Photo
            name="feature-material"
            role="featureVisual"
            src={visualAssets.featureVisual}
            className="vm-photo-feature"
            collapseWhenMissing
          />
          <div className="ps-feature-copy">
            <p className="vm-kicker">{features.title}</p>
            <ul className="vm-feature-units">
              {adaptive.featureUnits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {features && featurePlacement === "section" && featurePresentation !== "paragraphs" && (featurePresentation === "highlight" || pageDensity === "low") ? (
        <section className="vm-feature-band" id="features" data-section-id="features" data-feature-presentation={featurePresentation}>
          <p className="vm-kicker">{features.title}</p>
          <ul className="vm-feature-units">
            {adaptive.featureUnits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {placedIngredients ? (
        <section
          className="vm-ingredients"
          id="ingredients"
          data-section-id="ingredients"
          data-ingredient-presentation={ingredientPresentation}
          data-emphasis={followPlan && direction?.emphasis.includes("ingredients") ? "primary" : undefined}
        >
          <p className="vm-kicker">{visibleSection(page, "ingredients")?.title}</p>
          <ul className="vm-ingredient-units">
            {(visibleSection(page, "ingredients")?.cards.length
              ? visibleSection(page, "ingredients")!.cards.map((card) => ({ title: card.title, body: card.body }))
              : adaptive.ingredientUnits.map((title) => ({ title, body: "" }))
            ).map((card, index) => {
              const imageSrc = ingredientImages[ingredientFactKey(card.title)];
              return (
                <li key={card.title}>
                  {followPlan && direction?.ingredientVariant ? (
                    <span className="vm-ingredient-mark" data-ingredient-visual={imageSrc ? "source" : "icon"} aria-hidden="true">
                      {imageSrc ? <img src={imageSrc} alt="" /> : <DecorativeMark role="ingredient" index={index} />}
                    </span>
                  ) : null}
                  <span>{card.title}</span>
                  {card.body.trim() ? <small>{card.body}</small> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {followPlan && direction && direction.pricingVariant !== "NONE" && offers.length > 0 ? (
        <section
          className="vm-pricing"
          id="pricing"
          data-section-id="pricing"
          data-pricing-variant={direction.pricingVariant.toLowerCase()}
          data-emphasis={direction.emphasis.includes("pricing") ? "primary" : undefined}
        >
          {content?.pricingTitle ? <p className="vm-kicker">{content.pricingTitle}</p> : null}
          <ul className="vm-offer-units">
            {offers.map((offer, index) => {
              const plan = content?.pricing?.[index];
              const name = plan?.title ?? offer.name;
              return (
              <li key={`${offer.name}${offer.price}`}>
                {name ? <span>{name}</span> : null}
                <b>{offer.price}</b>
                {plan?.description ? <small>{plan.description}</small> : null}
                {!plan?.description && offer.totalPrice && offer.totalPrice !== offer.price ? <small>{offer.totalPrice}</small> : null}
              </li>
              );
            })}
          </ul>
          {content?.pricingCta ? <p className="vm-kicker">{content.pricingCta}</p> : null}
        </section>
      ) : content?.pricing ? (
        <section className="vm-pricing" id="pricing" data-section-id="pricing">
          {content.pricingTitle ? <p className="vm-kicker">{content.pricingTitle}</p> : null}
          <ul className="vm-offer-units">
            {content.pricing.map((plan) => (
              <li key={plan.title}>
                {plan.title ? <span>{plan.title}</span> : null}
                {plan.description ? <small>{plan.description}</small> : null}
              </li>
            ))}
          </ul>
          {content.pricingCta ? <p className="vm-kicker">{content.pricingCta}</p> : null}
        </section>
      ) : null}

      {productVisuals.sectionMoment && !omitSectionMoment ? (
        <section className="vm-product-moment" data-product-moment="true">
          <ProductShot shot={productVisuals.sectionMoment} className="vm-product-bundle" alt={productAlt} />
        </section>
      ) : null}

      {/* A decorative-only band is a transition, never a destination. Low pages omit it. */}
      {omitDecorativePause ? null : (
        <section className={density === "compact" ? "vm-pause vm-pause-strip" : "vm-pause"} aria-hidden="true">
          <Photo name="editorial-pause" role="photographicPause" src={visualAssets.photographicPause} className="vm-photo-pause" />
        </section>
      )}

      {usage && !core ? (
        <section
          className={visualAssets.usageVisual ? "vm-split vm-usage" : "vm-split vm-usage vm-split-solo"}
          id="usage"
          data-section-id="usage"
          data-statement={usageShort ? "short" : undefined}
          data-usage-variant={followPlan && direction?.usageVariant ? direction.usageVariant.toLowerCase() : undefined}
        >
          <Photo
            name="usage-material"
            role="usageVisual"
            src={visualAssets.usageVisual}
            className="vm-photo-usage"
            collapseWhenMissing
          />
          <div className="ps-usage-card">
            <p className="vm-kicker">{usage.title}</p>
            {textBlocks(usage).map((line) => (
              <p key={line} className="ps-body-lg">
                {line}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {core ? (
        <section className="vm-core" id="details" data-core-columns={residual.length}>
          {usage ? (
            <div className="vm-core-lead" id="usage" data-section-id="usage">
              <p className="vm-kicker">{usage.title}</p>
              {textBlocks(usage).map((line) => (
                <p key={line} className="ps-body-lg vm-core-statement">
                  {line}
                </p>
              ))}
            </div>
          ) : null}
          {residual.length > 0 || coreMaterial.src ? (
            <div className="vm-core-grid">
              {/* Material only reaches the page here when no placed section consumed it. */}
              <Photo
                name="core-material"
                role={coreMaterial.role}
                src={coreMaterial.src}
                className="vm-photo-core"
                collapseWhenMissing
              />
              {residual.map((section) => (
                <div key={section.id} className="vm-note" data-section-id={section.id}>
                  <p className="vm-kicker">{section.title}</p>
                  {section.paragraphs.map((line) => {
                    const rows = structuredSplit(line, structuredLists);
                    if (!rows) return <p key={line}>{line}</p>;
                    return (
                      <ul key={line} className="vm-note-list" data-structured-source="product-facts">
                        {rows.map((row) => (
                          <li key={row}>{row}</li>
                        ))}
                      </ul>
                    );
                  })}
                  {section.bullets.length > 0 ? (
                    <ul className="vm-note-list">
                      {section.bullets.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : null}
                  {section.cards.map((card) => (
                    <p key={`${card.title}${card.body}`}>
                      <b>{card.title}</b> {card.body}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {pageDensity === "low" && residual.length > 0 ? (
        <div className="vm-residual">
          {residual.map((section) => (
            <section key={section.id} className="vm-note" data-section-id={section.id}>
              <p className="vm-kicker">{section.title}</p>
              {textBlocks(section).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </section>
          ))}
        </div>
      ) : null}

      {returns ? (
        <section
          className={visualAssets.returnPolicyVisual ? "vm-return" : "vm-return vm-return-plain"}
          id="return"
          data-section-id="guarantee"
          data-return-treatment={visualAssets.returnPolicyVisual ? "source" : "material"}
          data-guarantee-variant={followPlan && direction?.guaranteeVariant ? direction.guaranteeVariant.toLowerCase() : undefined}
          data-emphasis={followPlan && direction?.emphasis.includes("guarantee") ? "primary" : undefined}
        >
          <div>
            <p className="vm-kicker">{returnLabel}</p>
            {textBlocks(returns).map((line) => (
              <p key={line} className="ps-guarantee-copy">
                {line}
              </p>
            ))}
            {content?.returns ? <p className="ps-guarantee-copy">{content.returns}</p> : null}
          </div>
          {visualAssets.returnPolicyVisual ? (
            <Photo name="return-material" role="returnPolicyVisual" src={visualAssets.returnPolicyVisual} className="vm-photo-return" />
          ) : null}
        </section>
      ) : null}

      <section className="vm-close" id="decision" data-closing={followPlan && direction?.collapseClosing ? "collapsed" : undefined}>
        <Photo name="closing-photography" role="decisionBackground" src={visualAssets.decisionBackground} className="vm-photo-close" />
        <div className="vm-close-copy">
          {productVisuals.closingCue ? (
            <ProductShot shot={productVisuals.closingCue} className="vm-product-cue" alt={productAlt} />
          ) : null}
          <h2 className="vm-display vm-display-sm">{closingLine}</h2>
          <span className="vm-cta">{finalCta}</span>
        </div>
      </section>

      {faq && faq.faq.length > 0 ? (
        <section
          className="vm-faq ps-faq-band"
          id="faq"
          data-section-id="faq"
          data-faq-variant={followPlan && direction?.faqVariant ? direction.faqVariant.toLowerCase() : undefined}
        >
          <h2 className="vm-faq-title">{faq.title}</h2>
          {faq.faq.map((item) => (
            <details key={item.question}>
              <summary>{consumerFacingFaqQuestion(item.question)}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>
      ) : null}

      <footer className="vm-footer">
        <p className="vm-brand">{brand}</p>
        <nav aria-label="Page sections">
          {nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        {/* The page-top line is the affiliate disclosure; the footer carries the review method and the full disclosure page. */}
        <div className="vm-disclosure">
          <p className="vm-disclosure-heading">{TRUST_EDITORIAL.heading}</p>
          <p>{content?.footer || TRUST_EDITORIAL.paragraphs[0]}</p>
          {content?.manufacturer ? <p>{content.manufacturer}</p> : null}
          {content?.shipping ? <p>{content.shipping}</p> : null}
          {content?.warnings ? <p>{content.warnings}</p> : null}
          {isHealthDisclaimerEnabled() ? <p>{HEALTH_DISCLAIMER_TEXT}</p> : null}
          <nav className="vm-legal-links" aria-label="Site">
            {PUBLIC_FOOTER_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <p className="vm-site-name">{getPublicSiteName()}</p>
        </div>
      </footer>
    </div>
  );
}
