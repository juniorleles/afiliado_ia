import type { ReactNode } from "react";
import Link from "next/link";
import { editorialLead, type EditorialBlock } from "@/lib/product-showcase/editorial";
import type { ProductFormatKind } from "@/lib/product-showcase/adaptive-plan";
import type { ProductShowcaseModel } from "@/lib/product-showcase/model";
import { DEFAULT_SECTION_ORDER, type ShowcaseSectionKey } from "@/lib/product-showcase/presentation-order";
import "@/app/product-showcase-v3.css";

/**
 * Premium V3 — adaptive showcase renderer.
 *
 * Every component reads only the editorial document and the adaptive plan. Nothing here knows a
 * product, a slug or a campaign. A section without proven content is not rendered, and no component
 * produces a claim, a rating, a testimonial or a packaging picture.
 */

export type PremiumV3Props = {
  model: ProductShowcaseModel;
  labHref: string;
  showLabBar: boolean;
  ctaSlot: ReactNode;
  ctaPreview: boolean;
};

type Palette = "forest" | "teal" | "clay" | "slate";

/** Palette follows the proven product format only. It carries no claim. */
const PALETTE_BY_FORMAT: Record<ProductFormatKind, Palette> = {
  capsule: "forest",
  drops: "teal",
  powder: "clay",
  other: "slate",
  unknown: "forest",
};

type View = ReturnType<typeof deriveView>;

function editorialBlock(model: ProductShowcaseModel, id: EditorialBlock["id"]): EditorialBlock | null {
  const block = model.editorial?.blocks.find((item) => item.id === id) ?? null;
  if (!block || (block.paragraphs.length === 0 && block.items.length === 0)) return null;
  return block;
}

function splitIngredient(line: string): { name: string; note: string | null } {
  const [name, note] = line.split(" — ");
  return { name: name?.trim() || line, note: note?.trim() || null };
}

const OPERATIONAL_LABEL: Record<string, { label: string; icon: IconName }> = {
  manufacturer: { label: "Manufacturer", icon: "factory" },
  shippingInformation: { label: "Shipping", icon: "truck" },
  returnsInformation: { label: "Returns", icon: "return" },
};

type Row = { label: string; text: string; icon: IconName };

function operationalRows(...blocks: Array<EditorialBlock | null>): Row[] {
  return blocks.flatMap((block) =>
    (block?.trace ?? []).map((item) => {
      const known = OPERATIONAL_LABEL[item.field];
      return { label: known?.label ?? "Details", icon: known?.icon ?? "info", text: item.text } satisfies Row;
    }),
  );
}

function deriveView(model: ProductShowcaseModel) {
  const plan = model.adaptivePlan!;
  const intro = editorialBlock(model, "introduction");
  const format = editorialBlock(model, "format");
  const ingredients = editorialBlock(model, "ingredients");
  const guarantee = editorialBlock(model, "guarantee");
  const price = editorialBlock(model, "price");
  const usage = editorialBlock(model, "usage");
  const characteristics = editorialBlock(model, "characteristics");
  const important = editorialBlock(model, "important");
  const disclosure = editorialBlock(model, "disclosure");
  const image = plan.hero === "image" && model.image && (model.mode === "demo" || !/demo-assets/i.test(model.image.src)) ? model.image : null;
  const { lead, summary } = editorialLead(intro);
  const title = intro?.heading || model.productName;
  const returns = guarantee ? guarantee.trace.filter((item) => item.field === "returnsInformation").map((item) => item.text) : [];
  const origin = guarantee ? guarantee.paragraphs.slice(1).filter((paragraph) => !returns.includes(paragraph)) : [];
  const details = operationalRows(editorialBlock(model, "provenance"), editorialBlock(model, "fulfillment"));
  const offers = plan.price?.layout === "comparison" ? plan.price.offers : [];
  const facts: Array<{ key: "format" | "count"; label: string; text: string }> = [
    ...(format?.paragraphs[0] ? [{ key: "format" as const, label: format.heading, text: format.paragraphs[0] }] : []),
    ...(ingredients && plan.ingredientCount > 0 ? [{ key: "count" as const, label: ingredients.wording?.countLabel ?? "Ingredients", text: String(plan.ingredientCount) }] : []),
  ];
  const order = (model.presentation?.order ?? DEFAULT_SECTION_ORDER).filter((key, index, all) => all.indexOf(key) === index);
  const present: Record<ShowcaseSectionKey, boolean> = {
    composition: Boolean(ingredients),
    details: Boolean(characteristics),
    usage: Boolean(usage),
    offers: Boolean(price || guarantee),
  };
  return {
    plan, intro, format, ingredients, guarantee, price, usage, characteristics, important, disclosure,
    image, lead, summary, title, returns, origin, details, offers, facts, order, present,
    palette: PALETTE_BY_FORMAT[plan.format] ?? "forest",
    cta: model.editorial?.cta ?? null,
  };
}

/* ---------- Icons: decorative only ---------- */

type IconName = "truck" | "return" | "factory" | "shield" | "info" | "alert";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    truck: (<><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>),
    return: (<><path d="M9 7 4 12l5 5" /><path d="M4 12h10a6 6 0 0 1 0 12" transform="translate(0 -6)" /></>),
    factory: (<><path d="M3 20V9l6 4V9l6 4V5h6v15z" /><path d="M8 20v-3M13 20v-3M18 20v-3" /></>),
    shield: (<><path d="M12 3 5 6v6c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6z" /><path d="m9 12 2.2 2.2L15.5 10" /></>),
    info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
    alert: (<><path d="M12 3 2.5 20h19z" /><path d="M12 10v5M12 17.5h.01" /></>),
  };
  return (
    <svg className="psp3-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

/* ---------- Components ---------- */

function SiteBar({ view, hasAbout }: { view: View; hasAbout: boolean }) {
  const labels: Array<{ href: string; label: string }> = [];
  const add = (condition: boolean, href: string, label: string) => { if (condition) labels.push({ href, label }); };
  add(Boolean(view.ingredients), "#psp-ingredients", view.ingredients?.wording?.kicker ?? "Ingredients");
  add(Boolean(view.format), "#psp-format", "Format");
  for (const key of view.order) {
    if (key === "usage") add(Boolean(view.usage), "#psp-usage", "Use");
    if (key === "offers") {
      add(Boolean(view.price), "#psp-price", "Price");
      add(Boolean(view.guarantee), "#psp-guarantee", "Guarantee");
    }
  }
  return (
    <header className="psp3-bar">
      <div className="psp3-wrap psp3-bar-inner">
        <a className="psp-mark" href="#psp-top">{view.title}</a>
        <nav className="psp-nav" aria-label="On this page">
          {hasAbout ? <Link href="/about">About</Link> : null}
          {labels.map((item) => <a key={item.label} href={item.href}>{item.label}</a>)}
        </nav>
      </div>
    </header>
  );
}

/** Graphic mark. It is decorative geometry, never a package or a manufacturer logo. */
function Rings({ initial }: { initial: string }) {
  return (
    <div className="psp3-rings" aria-hidden="true">
      <svg viewBox="0 0 200 200" focusable="false">
        <circle cx="100" cy="100" r="92" />
        <circle cx="100" cy="100" r="72" />
        <circle cx="100" cy="100" r="52" />
        <path className="psp3-arc" d="M100 8a92 92 0 0 1 78 43" />
      </svg>
      <span>{initial}</span>
    </div>
  );
}

function ProductPanel({ view }: { view: View }) {
  const initial = view.title.trim().charAt(0).toUpperCase();
  return (
    <aside className="psp3-panel" aria-label="Product at a glance">
      <Rings initial={initial} />
      {view.facts.length > 0 ? (
        <dl className="psp3-facts">
          {view.facts.map((fact) => (
            <div className="psp3-fact" data-fact={fact.key} id={fact.key === "format" ? "psp-format" : undefined} key={fact.key}>
              <dt>{fact.label}</dt>
              <dd className={fact.key === "count" ? "psp3-count" : undefined}>{fact.text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="psp3-panel-note">Only details declared by the product source appear on this page.</p>
      )}
    </aside>
  );
}

function Hero({ view, ctaSlot, ctaPreview }: { view: View; ctaSlot: ReactNode; ctaPreview: boolean }) {
  const { cta, image } = view;
  return (
    <section className="psp3-top" id="psp-top">
      <div className={image ? "psp3-wrap psp3-hero psp3-hero-with-media" : "psp3-wrap psp3-hero psp-hero-editorial"} data-panel={image ? "image" : "graphic"}>
        <div className="psp3-hero-copy">
          <p className="psp3-eyebrow">Product overview</p>
          <h1 className="psp3-title">{view.title}</h1>
          {view.lead ? <p className="psp3-lead" data-role="lead">{view.lead}</p> : null}
          {view.summary.map((paragraph) => <p className="psp3-summary" data-role="summary" key={paragraph}>{paragraph}</p>)}
          {cta ? (
            <div className="psp3-actions" data-cta-state="authorized">
              {ctaSlot ?? <a className="psp-cta" href={cta.href}>{cta.label}</a>}
            </div>
          ) : ctaPreview ? (
            <div className="psp3-actions" data-cta-state="preview-disabled">
              <button type="button" className="psp3-cta-disabled" disabled aria-disabled="true" data-cta-placeholder>
                Offer link not connected
              </button>
              <p className="psp3-cta-caption">Preview only. The button goes live once an authorized offer link is set.</p>
            </div>
          ) : null}
          {view.disclosure?.paragraphs.map((paragraph) => <p className="psp3-disclosure" key={paragraph}>{paragraph}</p>)}
        </div>
        {image ? (
          <div className="psp-hero-media psp3-stage">
            <figure className="psp-hero-figure">
              <img src={image.src} alt={image.alt} />
            </figure>
          </div>
        ) : (
          <ProductPanel view={view} />
        )}
      </div>
    </section>
  );
}

/** With an approved image the proven facts sit in a floating rail under the hero. */
function FactRail({ view }: { view: View }) {
  if (!view.image || view.facts.length === 0) return null;
  return (
    <section className="psp3-wrap psp3-rail" aria-label="Product facts">
      {view.facts.map((fact) => (
        <div className="psp3-rail-item" data-fact={fact.key} id={fact.key === "format" ? "psp-format" : undefined} key={fact.key}>
          <p className="psp3-kicker">{fact.label}</p>
          <p className={fact.key === "count" ? "psp3-rail-value psp3-count" : "psp3-rail-value"}>{fact.text}</p>
        </div>
      ))}
    </section>
  );
}

function SectionHead({ kicker, title, id, note }: { kicker: string; title: string; id?: string; note?: string }) {
  return (
    <div className="psp3-head">
      <p className="psp3-kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
      {note ? <p className="psp3-note">{note}</p> : null}
    </div>
  );
}

function Composition({ view, model }: { view: View; model: ProductShowcaseModel }) {
  const { ingredients, plan } = view;
  if (!ingredients) return null;
  const photos = plan.ingredientPhotos;
  const depth = ingredients.items.some((item) => splitIngredient(item).note) ? "noted" : "names";
  return (
    <section className="psp3-section psp3-composition" aria-labelledby="psp-composition" id="psp-ingredients">
      <div className="psp3-wrap psp3-split">
        <SectionHead kicker={ingredients.wording?.kicker ?? "Ingredients"} title={ingredients.heading} id="psp-composition" note={ingredients.wording?.note ?? "Names as declared by the product source."} />
        <div
          className={photos ? "psp-names psp3-ingredients" : "psp-names psp-names-type psp3-ingredients"}
          role="list"
          data-layout={plan.ingredientLayout}
          data-count={plan.ingredientCount}
          data-depth={photos ? "photos" : depth}
        >
          {ingredients.items.map((item, index) => {
            const row = splitIngredient(item);
            const photo = photos ? model.ingredients.find((entry) => entry.name.toLowerCase() === row.name.toLowerCase())?.image : null;
            return (
              <div className="psp3-ingredient" role="listitem" key={item}>
                {photo ? <img className="psp3-swatch" src={photo.src} alt={photo.alt} /> : <span className="psp3-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
                <p className="psp3-ingredient-name">{row.name}</p>
                {row.note ? <p className="psp3-ingredient-note">{row.note}</p> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Details({ view }: { view: View }) {
  const { characteristics } = view;
  if (!characteristics) return null;
  return (
    <section className="psp3-section psp3-details" aria-labelledby="psp-characteristics">
      <div className="psp3-wrap psp3-split">
        <SectionHead kicker="Product details" title={characteristics.heading} id="psp-characteristics" />
        <ul className="psp3-points">
          {characteristics.items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
    </section>
  );
}

function Usage({ view }: { view: View }) {
  const { usage } = view;
  if (!usage) return null;
  const notes = usage.paragraphs.slice(1);
  return (
    <section className="psp3-section psp3-usage" id="psp-usage" aria-labelledby="psp-usage-title">
      <div className="psp3-wrap psp3-split" data-notes={notes.length > 0 ? "1" : "0"}>
        <SectionHead kicker={usage.heading} title={usage.paragraphs[0] ?? usage.heading} id="psp-usage-title" />
        {notes.length > 0 ? (
          <ul className="psp3-points psp3-points-soft">
            {notes.map((paragraph) => <li key={paragraph}>{paragraph}</li>)}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function Offers({ view }: { view: View }) {
  const { price, guarantee, offers, plan } = view;
  if (!price && !guarantee) return null;
  const showUnit = offers.some((offer) => offer.unitLabel);
  return (
    <>
      {price ? (
        <section className="psp3-section psp3-offers" id="psp-price" aria-labelledby="psp-price-title">
          <div className="psp3-wrap">
            <SectionHead kicker="Price" title={offers.length >= 2 ? "Purchase options" : price.paragraphs[0] ?? price.heading} id="psp-price-title" />
            {offers.length >= 2 ? (
              <ul className="psp3-offer-grid" data-count={offers.length} data-units={showUnit ? "1" : "0"}>
                {offers.map((offer) => (
                  <li className="psp3-offer" key={`${offer.quantityLabel}-${offer.totalLabel}`}>
                    <p className="psp3-offer-qty">{offer.quantityLabel}</p>
                    <p className="psp3-offer-total">{offer.totalLabel}</p>
                    {showUnit && offer.unitLabel ? (
                      <p className="psp3-offer-unit"><span>Per unit</span> {offer.unitLabel}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="psp3-source-note" data-density={plan.commercialDensity}>Price as declared by the product source.</p>
          </div>
        </section>
      ) : null}
      {guarantee ? (
        <section className="psp3-assurance" id="psp-guarantee" aria-labelledby="psp-guarantee-title">
          <div className="psp3-wrap psp3-assurance-inner">
            <span className="psp3-assurance-icon"><Icon name="shield" /></span>
            <div className="psp3-assurance-copy">
              <p className="psp3-kicker">{guarantee.heading}</p>
              <h2 id="psp-guarantee-title">{guarantee.paragraphs[0]?.replace(/-/g, "\u2011")}</h2>
              {view.origin.map((paragraph) => <p className="psp3-origin" key={paragraph}>{paragraph}</p>)}
            </div>
            {view.returns.length > 0 ? (
              <div className="psp3-assurance-returns" data-role="returns">
                <p className="psp3-kicker">Returns</p>
                {view.returns.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Terms({ view }: { view: View }) {
  if (view.details.length === 0) return null;
  return (
    <section className="psp3-section psp3-terms" aria-labelledby="psp-order-details" data-role="order-details">
      <div className="psp3-wrap">
        <p className="psp3-kicker">Terms and provenance</p>
        <h2 id="psp-order-details" className="psp3-terms-title">Order details</h2>
        <dl className="psp3-terms-list" data-count={view.details.length}>
          {view.details.map((row) => (
            <div className="psp3-term" key={`${row.label}-${row.text}`}>
              <Icon name={row.icon} />
              <dt>{row.label}</dt>
              <dd>{row.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Notices({ view, model }: { view: View; model: ProductShowcaseModel }) {
  const { important } = view;
  if (!important && !model.review) return null;
  return (
    <section className="psp3-section psp3-notices" aria-labelledby="psp-important">
      <div className="psp3-wrap psp3-notice-grid" data-solo={important ? "0" : "1"}>
        {important ? (
          <div className="psp3-important">
            <h2 id="psp-important"><Icon name="alert" />{important.heading}</h2>
            <ul>
              {important.paragraphs.map((paragraph) => <li key={paragraph}>{paragraph}</li>)}
            </ul>
          </div>
        ) : null}
        {model.review ? (
          <div className="psp3-review">
            <h3 id={important ? undefined : "psp-important"}>{model.review.heading}</h3>
            {model.review.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SiteFooter({ view, model }: { view: View; model: ProductShowcaseModel }) {
  return (
    <footer className="psp-footer psp3-footer">
      <div className="psp3-wrap psp3-footer-inner">
        <p>{view.title} · {model.siteName}</p>
        <nav aria-label="Site">
          {model.footerLinks.map((link) => (
            <Link key={link.href} href={link.href}>{link.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function PremiumV3({ model, labHref, showLabBar, ctaSlot, ctaPreview, fontClassName }: PremiumV3Props & { fontClassName: string }) {
  const view = deriveView(model);
  const { plan } = view;
  const movable: Record<ShowcaseSectionKey, ReactNode> = {
    composition: <Composition key="composition" view={view} model={model} />,
    details: <Details key="details" view={view} />,
    usage: <Usage key="usage" view={view} />,
    offers: <Offers key="offers" view={view} />,
  };
  return (
    <article
      className={`${fontClassName} psp`}
      data-template={model.template}
      data-mode={model.mode}
      data-design="premium-v3"
      data-palette={view.palette}
      data-editorial="1"
      data-hero={view.image ? "image" : "editorial"}
      data-hero-composition={plan.heroComposition}
      data-lead={view.lead ? "1" : "0"}
      data-cta={view.cta ? "authorized" : ctaPreview ? "preview-disabled" : "none"}
      data-order={view.order.filter((key) => view.present[key]).join(">")}
      data-volume={plan.contentVolume}
      data-warnings={plan.warningVolume}
      data-format={plan.format}
      data-photos={plan.ingredientPhotos ? "1" : "0"}
      data-has-image={view.image ? "1" : "0"}
    >
      <style>{`nextjs-portal,[data-next-badge-root]{display:none!important;}`}</style>
      {showLabBar ? (
        <p className="psp-lab">
          <span>Laboratório visual · não publicado</span>
          <span>{model.template}</span>
          <Link href={labHref}>Preview atual</Link>
        </p>
      ) : null}
      <SiteBar view={view} hasAbout />
      <Hero view={view} ctaSlot={ctaSlot} ctaPreview={ctaPreview} />
      <FactRail view={view} />
      {view.order.map((key) => movable[key])}
      <Terms view={view} />
      <Notices view={view} model={model} />
      {plan.contentVolume === "thin" ? (
        <p className="psp3-wrap psp3-limited" data-role="limited-note">This page shows only the details declared by the product source.</p>
      ) : null}
      <SiteFooter view={view} model={model} />
    </article>
  );
}
