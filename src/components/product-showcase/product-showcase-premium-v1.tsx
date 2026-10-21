import type { ReactNode } from "react";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import Link from "next/link";
import type { ProductShowcaseModel } from "@/lib/product-showcase/model";
import { PremiumV3 } from "@/components/product-showcase/product-showcase-premium-v3";
import "@/app/product-showcase.css";

const display = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--psp-display" });
const body = Source_Sans_3({ subsets: ["latin"], weight: ["400", "600"], variable: "--psp-body" });

function ChipIcon() {
  return (
    <span className="psp-chip-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="7" />
        <path d="M12 8v8M9 12h6" />
      </svg>
    </span>
  );
}

export function ProductShowcasePremiumV1({
  model,
  labHref,
  showLabBar = true,
  ctaSlot = null,
  ctaPreview = false,
}: {
  model: ProductShowcaseModel;
  labHref: string;
  showLabBar?: boolean;
  ctaSlot?: ReactNode;
  /** Preview/QA only: shows a disabled placeholder when no authorized offer link exists. Never set on public pages. */
  ctaPreview?: boolean;
}) {
  if (model.editorial && model.adaptivePlan) {
    // Adaptive path: Premium V3. The template id stays PRODUCT_SHOWCASE_PREMIUM_V1 so no persisted template changes.
    return <PremiumV3 model={model} labHref={labHref} showLabBar={showLabBar} ctaSlot={ctaSlot} ctaPreview={ctaPreview} fontClassName={`${display.variable} ${body.variable}`} />;
  }
  return <LegacyPremium model={model} labHref={labHref} showLabBar={showLabBar} ctaSlot={ctaSlot} />;
}

function LegacyPremium({
  model,
  labHref,
  showLabBar = true,
  ctaSlot = null,
}: {
  model: ProductShowcaseModel;
  labHref: string;
  showLabBar?: boolean;
  ctaSlot?: ReactNode;
}) {
  const photos = model.ingredientPhotos;
  const hasImage = Boolean(model.image);
  const formatText = model.format?.text?.trim() ?? "";
  const leadText = model.lead?.trim() ?? "";
  const formatDupesLead =
    Boolean(formatText) && Boolean(leadText) && formatText.toLowerCase() === leadText.toLowerCase();
  const showFormatInHero = Boolean(model.format) && !hasImage;
  const showLead = Boolean(leadText) && !(showFormatInHero && formatDupesLead);
  const highlights =
    !hasImage && model.ingredients.length > 0
      ? model.highlights.filter((item) => !/^\d+\s+declared ingredients$/i.test(item.trim()))
      : model.highlights;
  return (
    <article
      className={`${display.variable} ${body.variable} psp`}
      data-template={model.template}
      data-mode={model.mode}
      data-photos={photos ? "1" : "0"}
      data-has-image={hasImage ? "1" : "0"}
    >
      <style>{`nextjs-portal,[data-next-badge-root]{display:none!important;}`}</style>
      {showLabBar ? (
      <p className="psp-lab">
        <span>{model.mode === "demo" ? "DEMO · imagens fictícias · não é um produto real · não publicado" : "Laboratório visual · não publicado"}</span>
        <span>{model.template}</span>
        <Link href={labHref}>{model.mode === "demo" ? "Versão com fatos" : "Preview atual"}</Link>
      </p>
      ) : null}
      <header className="psp-bar">
        <a className="psp-mark" href="#psp-top">{model.productName}</a>
        <nav className="psp-nav" aria-label="On this page">
          <Link href="/about">About</Link>
          {model.ingredients.length > 0 ? <a href="#psp-composition">Ingredients</a> : null}
          {model.format ? <a href="#psp-details">Product details</a> : null}
          {model.guarantee ? <a href="#psp-guarantee">Guarantee</a> : null}
          {model.faq.length > 0 ? <a href="#psp-faq">FAQ</a> : null}
        </nav>
        {ctaSlot ?? (model.cta ? <a className="psp-cta" href={model.cta.href}>{model.cta.label}</a> : null)}
      </header>

      <div
        className={hasImage ? "psp-wrap psp-hero psp-hero-split" : "psp-wrap psp-hero psp-hero-editorial"}
        id="psp-top"
      >
        <div className={hasImage ? undefined : "psp-hero-copy"}>
          {model.eyebrow ? <p className="psp-kicker">{model.eyebrow}</p> : null}
          <h1 className="psp-title">{model.productName}</h1>
          {showFormatInHero && model.format ? (
            <p className="psp-format-line">
              <span className="psp-format-label">{model.format.label}</span>
              <span className="psp-format-text">{model.format.text}</span>
            </p>
          ) : null}
          {showLead ? <p className="psp-lead">{model.lead}</p> : null}
          {highlights.length > 0 ? (
            <ul className="psp-chips">
              {highlights.map((item) => (
                <li key={item}><ChipIcon />{item}</li>
              ))}
            </ul>
          ) : null}
          <p className="psp-disclosure">{model.affiliateDisclosure}</p>
        </div>
        {!hasImage && model.ingredients.length > 0 ? (
          <aside className="psp-hero-aside" aria-label="Declared composition summary">
            <p className="psp-kicker">Declared composition</p>
            <p className="psp-hero-aside-count">{model.ingredients.length}</p>
            <p className="psp-hero-aside-label">ingredients named by the product source</p>
            {model.guarantee ? (
              <p className="psp-hero-aside-fact">{model.guarantee.text.replace(/-/g, "\u2011")}</p>
            ) : null}
          </aside>
        ) : null}
        {model.image ? (
          <div className="psp-hero-media">
            <figure className="psp-hero-figure">
              <img src={model.image.src} alt={model.image.alt} />
            </figure>
            {model.gallery.length > 0 ? (
              <ul className="psp-gallery">
                {model.gallery.map((item) => (
                  <li key={item.src}><img src={item.src} alt={item.alt} /></li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {model.ingredients.length > 0 ? (
        <section className="psp-wrap psp-section" aria-labelledby="psp-composition">
          <div className={photos ? "psp-stage" : "psp-stage psp-stage-type"}>
            <div className="psp-composition-intro">
              <p className="psp-kicker">Declared composition</p>
              <h2 id="psp-composition">{model.ingredients.length} ingredients</h2>
              <p className="psp-note">Names as declared by the product source.</p>
            </div>
            <ul className={photos ? "psp-names" : "psp-names psp-names-type"} data-count={model.ingredients.length}>
              {model.ingredients.map((item) => (
                <li key={item.name}>
                  {photos && item.image ? <img className="psp-swatch" src={item.image.src} alt={item.image.alt} /> : null}
                  <p className={photos ? "psp-name" : "psp-type-name"}>{item.name}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {model.format || model.guarantee ? (
        <div className="psp-wrap psp-split psp-section">
          {model.format ? (
            <section className={model.formatImage ? "psp-card psp-card-media" : "psp-card"} id="psp-details" aria-labelledby="psp-format">
              <div>
                <p className="psp-kicker">Product format</p>
                <h2 id="psp-format">{model.format.text}</h2>
              </div>
              {model.formatImage ? <img src={model.formatImage.src} alt={model.formatImage.alt} /> : null}
            </section>
          ) : null}
          {model.guarantee ? (
            <section className="psp-card psp-guarantee" id="psp-guarantee" aria-labelledby="psp-guarantee-title">
              <p className="psp-origin">Declared by the product source</p>
              <h2 id="psp-guarantee-title">{model.guarantee.text.replace(/-/g, "\u2011")}</h2>
            </section>
          ) : null}
        </div>
      ) : null}

      <section className="psp-wrap psp-section" aria-labelledby="psp-important">
        <div className="psp-split psp-info">
          <div>
            <h2 id="psp-important">Important information</h2>
            {model.notices.length > 0 || model.healthDisclaimer ? (
              <ul className="psp-notices">
                {model.notices.map((notice) => <li key={notice}>{notice}</li>)}
                {model.healthDisclaimer ? <li>{model.healthDisclaimer}</li> : null}
              </ul>
            ) : null}
          </div>
          {model.review ? (
            <div className="psp-review">
              <h3>{model.review.heading}</h3>
              {model.review.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          ) : null}
        </div>
        {model.faq.length > 0 ? (
          <div id="psp-faq">
            <h2>Questions</h2>
            <ul className="psp-faq">
              {model.faq.map((item) => (
                <li key={item.question}><strong>{item.question}</strong><p>{item.answer}</p></li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <footer className="psp-footer">
        <div className="psp-wrap psp-footer-inner">
          <p>{model.productName} · {model.siteName}</p>
          <nav aria-label="Site">
            {model.footerLinks.map((link) => (
              <Link key={link.href} href={link.href}>{link.label}</Link>
            ))}
          </nav>
        </div>
      </footer>
    </article>
  );
}
