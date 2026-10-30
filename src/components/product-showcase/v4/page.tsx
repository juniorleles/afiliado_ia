import React from "react";
import { autoGridCount } from "@/lib/design-system/layout";
import type { BlueprintSection } from "@/lib/page-blueprint/types";
import { shouldRenderSection, type V4Model } from "@/lib/product-showcase/v4/model";
import {
  distinctText,
  editorialHeroMode,
  editorialIndexCards,
  galleryPresentationOf,
  publicItemText,
  publicLegalLines,
  publicSectionTitle,
  v4HeroMode,
} from "@/lib/product-showcase/v4/presentation";
import { DsAutoGrid, DsContainer, DsKicker, DsSection } from "@/components/design-system/primitives";
import {
  EvidenceChips,
  FulfillmentCardGrid,
  GuaranteeBand,
  HeroLogisticsRail,
  IngredientCardGrid,
  PremiumCta,
  PremiumFaq,
  UsageSteps,
} from "@/components/design-system/premium-blocks";
import { presentVisitorCopy, premiumSlotsFromModel } from "@/lib/presell-quality/premium-slots";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function Hop({ model, slot }: { model: V4Model; slot: "hero" | "offers" | "sticky" }) {
  if (!model.hopHref || !model.hopLabel) return null;
  const sandbox = Boolean(model.sandbox?.mode);
  const quiet = Boolean(model.qualityPatch?.sandboxQuiet);
  return (
    <a
      className={cx("ds-btn", quiet && "ds-btn--sandbox-quiet")}
      href={model.hopHref}
      rel="noopener noreferrer"
      data-v4-cta={slot}
      data-v4-track={sandbox ? "sandbox_offer_click" : "official_offer_click"}
      data-sandbox={sandbox ? "true" : undefined}
    >
      {sandbox ? (
        <span className={cx("v4-sandbox-badge", quiet && "v4-sandbox-badge--quiet")} data-sandbox-badge="">
          SANDBOX
        </span>
      ) : null}
      {model.hopLabel}
    </a>
  );
}

function visible(model: V4Model, type: BlueprintSection["sectionType"]): boolean {
  return shouldRenderSection({
    type,
    blueprint: model.blueprint,
    hopSlot: model.hopSlot,
    hasHeroImage: Boolean(model.commercialImage),
  });
}

function toneFor(type: BlueprintSection["sectionType"]): "plain" | "alt" | "soft" | "accent" {
  if (type === "offers") return "soft";
  if (type === "specifications" || type === "differentiators" || type === "trust") return "alt";
  return "plain";
}

function Hero({ model }: { model: V4Model }) {
  const image = model.commercialImage;
  const heroMode = v4HeroMode(image);
  const editorial = heroMode === "EDITORIAL_NO_IMAGE";
  const split = Boolean(image);
  const name = model.contract.identity.productName;
  const kind = model.contract.identity.productKind;
  const headline = model.copy.headline.text;
  const subheadline = model.copy.subheadline?.text;
  const value = model.copy.valueProposition?.text;
  const introduction = model.copy.introduction.text;
  const index = editorial
    ? editorialIndexCards({
        visible: model.blueprint.sections
          .filter((section) => visible(model, section.sectionType))
          .map((section) => ({ type: section.sectionType, id: section.sectionType === "offers" ? "offers" : section.sectionId })),
        titles: model.qualityPatch?.titles,
      })
    : [];
  return (
    <section
      className={cx(
        "ds-hero-band",
        editorial && "ds-hero-band--editorial-full",
        heroMode === "PRODUCT_IMAGE" && "ds-hero-band--product-image",
        model.qualityPatch?.tightenHero && editorial && "ds-hero-band--quality-tight",
      )}
      id="hero"
      data-v4-section="hero"
      data-hero-mode={heroMode}
      data-quality-hero={model.qualityPatch?.tightenHero ? "tight" : undefined}
    >
      <DsContainer>
        <div
          className={cx(
            "ds-hero",
            split ? "ds-hero--split" : editorial ? "ds-hero--editorial-full" : "ds-hero--editorial",
            heroMode === "PRODUCT_IMAGE" && "ds-hero--product-image",
          )}
        >
          <div className="v4-hero__copy">
            {kind ? <DsKicker>{kind}</DsKicker> : null}
            {distinctText(headline, name) ? <p className="v4-identity">{name}</p> : null}
            <h1 className="ds-display">{distinctText(headline, name) ? headline : name}</h1>
            {distinctText(subheadline, headline, name, kind) ? <p className="ds-lead">{subheadline}</p> : null}
            {distinctText(value, headline, subheadline, name) ? <p className="ds-lead">{value}</p> : null}
            {distinctText(introduction, headline, subheadline, value, name) ? (
              <p className="ds-body">{presentVisitorCopy(introduction)}</p>
            ) : null}
            <EvidenceChips items={premiumSlotsFromModel(model).evidenceChips} />
            <div className="ds-hero__actions">
              {model.hopSlot === "hero" ? <Hop model={model} slot="hero" /> : <PremiumCta slot="hero" />}
              {model.hopSlot === "offers" ? (
                <a className="ds-btn ds-btn--ghost" href="#offers" data-v4-cta="inpage">
                  See packages
                </a>
              ) : null}
            </div>
          </div>
          {split && image ? (
            <div className="ds-hero__media">
              <div className="ds-hero__stage">
                <div className="ds-hero__frame">
                  <img src={image.src} alt={image.alt} width={1200} height={1200} data-v4-image="commercial" decoding="async" />
                </div>
              </div>
              <HeroLogisticsRail items={premiumSlotsFromModel(model).fulfillment} />
            </div>
          ) : null}
          {editorial ? (
            <aside className="v4-hero-aside" aria-label="Approved sections">
              <div className="v4-hero-panel">
                <div className="v4-hero-aside__art" aria-hidden="true">
                  <span className="v4-hero-aside__orb" />
                  <span className="v4-hero-aside__band" />
                </div>
                {index.length ? (
                  <nav className="v4-hero-index">
                    {index.map((card) => (
                      <a className="v4-hero-index__card" href={`#${card.id}`} key={card.id}>
                        <span className="v4-hero-index__label">{card.label}</span>
                      </a>
                    ))}
                  </nav>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      </DsContainer>
    </section>
  );
}

function shortAttribute(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && text.trim().length <= 32;
}

function FeatureSection({ section, numbered = false }: { section: BlueprintSection; numbered?: boolean }) {
  const items = section.items.length ? section.items : section.body.map((item) => ({ text: item }));
  const compact = !numbered && items.length >= 3 && items.every((item) => shortAttribute(publicItemText(item.text.text)));
  if (compact) {
    return (
      <ul className="v4-feature-chips" data-v4-features="compact">
        {items.map((item, index) => (
          <li key={`${section.sectionId}-${index}`}>{publicItemText(item.text.text)}</li>
        ))}
      </ul>
    );
  }
  return (
    <DsAutoGrid count={autoGridCount(items.length)}>
      {items.map((item, index) => (
        <article className="ds-feature" key={`${section.sectionId}-${index}`}>
          <span className="ds-feature__n">{String(index + 1).padStart(2, "0")}</span>
          <p className="ds-body">{publicItemText(item.text.text)}</p>
        </article>
      ))}
    </DsAutoGrid>
  );
}

function BenefitSection({ section }: { section: BlueprintSection }) {
  const items = section.items.length ? section.items : section.body.map((item) => ({ text: item }));
  return (
    <div className="v4-points">
      {items.map((item, index) => (
        <p className="v4-point" key={`${section.sectionId}-${index}`}>
          {publicItemText(item.text.text)}
        </p>
      ))}
    </div>
  );
}

function SpecSection({ section }: { section: BlueprintSection }) {
  const rows = section.items.length ? section.items : section.body.map((item) => ({ text: item }));
  const labeled: Array<{ name: string; value: string }> = [];
  const notes: string[] = [];
  for (const item of rows) {
    const idx = item.text.text.indexOf(":");
    if (idx > 0 && idx <= 48) {
      labeled.push({ name: item.text.text.slice(0, idx).trim(), value: item.text.text.slice(idx + 1).trim() });
    } else {
      notes.push(item.text.text);
    }
  }
  return (
    <div className="v4-specs">
      {labeled.length >= 2 ? (
        <table className="ds-spec">
          <tbody>
            {labeled.map((row) => (
              <tr key={`${section.sectionId}-${row.name}`}>
                <th scope="row">{row.name}</th>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        labeled.map((row) => (
          <article className="ds-card ds-card--soft" key={`${section.sectionId}-${row.name}`}>
            <p className="ds-kicker">{row.name}</p>
            <p className="ds-body">{row.value}</p>
          </article>
        ))
      )}
      {notes.length ? <IngredientCardGrid items={notes.map((note) => ({ name: note, detail: null }))} /> : null}
    </div>
  );
}

function OfferSection({ model, section }: { model: V4Model; section: BlueprintSection }) {
  const packs = model.copy.offerMicrocopy;
  return (
    <>
      <DsAutoGrid count={autoGridCount(packs.length)}>
        {packs.map((pack) => (
          <article className="v4-offer" key={pack.label} data-v4-offer="1">
            <p className="v4-offer__qty">{pack.quantityText || pack.label}</p>
            {pack.quantityText && pack.quantityText !== pack.label ? <h3 className="ds-h3">{pack.label}</h3> : null}
            {pack.totalPrice ? <p className="v4-offer__price">{pack.totalPrice}</p> : pack.unitPrice ? <p className="v4-offer__price">{pack.unitPrice}</p> : null}
            {pack.unitPrice && pack.totalPrice && pack.unitPrice !== pack.totalPrice ? (
              <p className="ds-caption">{pack.unitPrice}</p>
            ) : null}
          </article>
        ))}
      </DsAutoGrid>
      {model.hopSlot === "offers" ? (
        <div className="v4-offer-cta">
          <Hop model={model} slot="offers" />
        </div>
      ) : null}
      {model.hopSlot === "none" && model.copy.cta.caption ? (
        <p className="ds-caption" data-v4-offer-note="informational">
          {model.copy.cta.caption.text}
        </p>
      ) : null}
      {section.body.map((item, index) => (
        <p className="ds-caption" key={`${section.sectionId}-b-${index}`}>
          {item.text}
        </p>
      ))}
    </>
  );
}

function FaqSection({ section, model }: { section: BlueprintSection; model: V4Model }) {
  const slots = premiumSlotsFromModel(model);
  if (slots.faq.length) return <PremiumFaq items={slots.faq} />;
  const entries = section.items
    .map((item) => ({
      question: item.title?.text ?? item.text.text,
      answer: item.title ? item.text.text : "",
    }))
    .filter((item) => item.question.trim() && item.answer.trim());
  return <PremiumFaq items={entries} />;
}

function TrustSection({ section, model }: { section: BlueprintSection; model: V4Model }) {
  const slots = premiumSlotsFromModel(model);
  const items = section.items.length ? section.items : section.body.map((item) => ({ text: item }));
  const covered = slots.fulfillment.map((item) => item.body.toLowerCase()).join("\n");
  const leftover = items
    .map((item) => publicItemText(item.text.text))
    .filter((text) => {
      const value = text.trim();
      return value.length > 0 && !covered.includes(value.toLowerCase());
    });
  return (
    <>
      <FulfillmentCardGrid items={slots.fulfillment} />
      {leftover.length ? (
        <ul className="ds-list">
          {leftover.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function GuaranteeSection({ model }: { model: V4Model; section: BlueprintSection; attributed?: boolean }) {
  return <GuaranteeBand view={premiumSlotsFromModel(model).guarantee} />;
}

function DemoSection({ model, section }: { model: V4Model; section: BlueprintSection }) {
  const image = model.commercialImage;
  if (!image) return null;
  return (
    <div className="ds-hero__stage" style={{ maxWidth: "28rem", marginInline: "auto" }}>
      <div className="ds-hero__frame">
        <img src={image.src} alt={image.alt} width={1200} height={1200} data-v4-image="commercial" />
      </div>
      {section.body.map((item, index) => (
        <p className="ds-caption" key={`${section.sectionId}-${index}`}>
          {item.text}
        </p>
      ))}
    </div>
  );
}

function LegalSection({ model, section }: { model: V4Model; section: BlueprintSection }) {
  const lines = publicLegalLines({
    hopSlot: model.hopSlot,
    body: section.body,
    caption: model.copy.cta.caption,
  });
  return (
    <footer className="ds-footer" id={section.sectionId} data-v4-section="legal">
      <DsContainer width="content">
        {lines.map((line, index) => (
          <p className="ds-caption" key={`${section.sectionId}-${index}`}>
            {line}
          </p>
        ))}
        <nav aria-label="Legal">
          {model.contract.legal.trustLinks.map((link) => (
            <a key={link.href} href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </DsContainer>
    </footer>
  );
}

export function V4Page({ model }: { model: V4Model }) {
  const order = model.blueprint.sections.filter((section) => visible(model, section.sectionType));
  const patch = model.qualityPatch;
  const heroMode = v4HeroMode(model.commercialImage);
  const gallery = galleryPresentationOf({
    heroMode,
    galleryImages: model.galleryImages,
  });
  return (
    <main
      data-v4="page"
      data-v4-composition={model.composition}
      data-v4-goal={model.blueprint.conversionGoal}
      data-v4-photo={model.commercialImage ? "commercial" : "none"}
      data-hero-mode={heroMode}
      data-v4-gallery-state={gallery.render ? "visible" : "suppressed"}
      data-quality-fixes={patch?.applied.join(" ") || undefined}
      data-premium-engine="1"
    >
      {order.map((section) => {
        if (section.sectionType === "hero") {
          return (
            <div key={section.sectionId}>
              <Hero model={model} />
              {gallery.render && model.galleryImages?.length ? (
                <DsSection tone="alt" className="v4-band" id="gallery">
                  <DsContainer width="wide">
                    <div data-v4-section="gallery">
                      <h2 className="ds-h2">{patch?.galleryLead ? "Additional images" : "More images"}</h2>
                      <div className={cx("v4-gallery", patch?.galleryLead && "v4-gallery--lead")} data-v4-gallery="">
                        {model.galleryImages.map((image) => (
                          <img key={image.src} src={image.src} alt={image.alt} data-v4-image="commercial" />
                        ))}
                      </div>
                    </div>
                  </DsContainer>
                </DsSection>
              ) : null}
            </div>
          );
        }
        if (section.sectionType === "legal") {
          return (
            <div key={section.sectionId}>
              {patch?.disclosureBand ? (
                <aside className="v4-disclosure-band" data-v4-disclosure="band">
                  <DsContainer width="content">
                    <p className="ds-body">
                      This page is an informational presentation. I may earn a commission if you purchase through links on
                      this page.
                    </p>
                  </DsContainer>
                </aside>
              ) : null}
              <LegalSection model={model} section={section} />
            </div>
          );
        }
        const inner =
          section.sectionType === "differentiators" ? (
            <FeatureSection section={section} />
          ) : section.sectionType === "benefits" ? (
            <BenefitSection section={section} />
          ) : section.sectionType === "specifications" ? (
            <SpecSection section={section} />
          ) : section.sectionType === "offers" ? (
            <OfferSection model={model} section={section} />
          ) : section.sectionType === "faq" ? (
            <FaqSection model={model} section={section} />
          ) : section.sectionType === "how_it_works" ? (
            premiumSlotsFromModel(model).usage.length ? (
              <UsageSteps items={premiumSlotsFromModel(model).usage} />
            ) : (
              <FeatureSection section={section} numbered />
            )
          ) : section.sectionType === "trust" ? (
            <TrustSection section={section} model={model} />
          ) : section.sectionType === "guarantee" ? (
            <GuaranteeSection model={model} section={section} attributed={Boolean(patch?.sellerAttribution)} />
          ) : section.sectionType === "demonstration" ? (
            <DemoSection model={model} section={section} />
          ) : (
            <div className="ds-stack">
              {section.body.map((item, i) => (
                <p className="ds-body" key={`${section.sectionId}-${i}`}>
                  {item.text}
                </p>
              ))}
              {section.items.map((item, i) => (
                <p className="ds-body" key={`${section.sectionId}-i-${i}`}>
                  {publicItemText(item.text.text)}
                </p>
              ))}
            </div>
          );
        return (
          <DsSection
            key={section.sectionId}
            id={section.sectionType === "offers" ? "offers" : section.sectionId}
            tone={toneFor(section.sectionType)}
            className="v4-band"
            tight={model.density === "thin" || editorialHeroMode(Boolean(model.commercialImage)) === "EDITORIAL_NO_IMAGE"}
          >
            <DsContainer width={section.sectionType === "offers" || section.sectionType === "differentiators" ? "wide" : "content"}>
              <div data-v4-section={section.sectionType} data-v4-purpose={section.commercialPurpose}>
                <h2 className="ds-h2">{publicSectionTitle(section.sectionType, section.headline.text, patch?.titles)}</h2>
                {inner}
                {section.sectionType === "guarantee" && model.hopSlot === "none" ? <PremiumCta slot="mid" /> : null}
              </div>
            </DsContainer>
          </DsSection>
        );
      })}
      {model.sticky && model.hopHref && model.hopLabel ? (
        <div className="ds-sticky-cta" data-ds-sticky="1">
          <Hop model={model} slot="sticky" />
        </div>
      ) : null}
    </main>
  );
}
