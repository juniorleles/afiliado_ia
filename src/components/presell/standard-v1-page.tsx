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
import { AnnouncementBar, ShippingOrAccess } from "@/components/presell";
import { experimentalEvidenceChips, experimentalSectionTitle, presentVisitorCopy, premiumSlotsFromModel } from "@/lib/presell-quality/premium-slots";
import {
  CONTROLLED_IMPROVEMENT_EXECUTION_ID,
  PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID,
  PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID,
  PREMIUM_STRUCTURAL_COMPOSITION_ID,
  usesPremiumProducerContent,
  usesPremiumProducerContentV2,
  usesPremiumStructuralComposition,
} from "@/lib/presell-quality/renderer-candidate";
import { readCommercialReuse, type CommercialReuseManifest } from "@/lib/presell-quality/commercial-reuse";
import { mapPresellStandardV1 } from "@/lib/presell-template";
import { PRESELL_STANDARD_ID } from "@/lib/presell-template/standard-v1";
import type { PresellStandardSectionId } from "@/lib/presell-template/standard-v1";
import type { SectionType } from "@/lib/conversion-strategy/types";

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

function SellerStatedOffers({
  manifest,
  finalized,
}: {
  manifest: CommercialReuseManifest;
  finalized?: boolean;
}) {
  if (!manifest.approvedPackages.length) return null;
  return (
    <DsSection tone="soft" className={cx("v4-band", finalized && "premium-producer-offers")} id="seller-stated-packages">
      <DsContainer>
        <DsKicker>Seller-stated offer</DsKicker>
        <h2 className="ds-h2">Packages shown on the seller&apos;s order page</h2>
        <p className="ds-body">{manifest.attribution}</p>
        <div
          className="premium-grid premium-producer-packages"
          data-premium="packages"
          data-seller-stated-offers="1"
          data-package-layout={finalized ? "below-hero" : "legacy"}
        >
          {manifest.approvedPackages.map((item) => (
            <article key={item.id} className="premium-card" data-seller-package={item.id}>
              <p className="ds-kicker">{item.label}</p>
              <h3 className="ds-h3">
                {item.quantity}
                {item.duration ? ` · ${item.duration}` : ""}
              </h3>
              <p className="ds-display ds-display--package">{item.unitPrice}</p>
              <p className="ds-meta">per bottle, seller-stated</p>
              <p className="ds-body">
                Current total {item.currentTotal}
                {item.comparedTotal ? ` (listed comparison ${item.comparedTotal})` : ""}
              </p>
              {item.bonuses.length ? <p className="ds-body">{item.bonuses.join(" · ")}</p> : null}
              <p className="ds-meta">{item.shippingTerm}</p>
            </article>
          ))}
        </div>
      </DsContainer>
    </DsSection>
  );
}

function StructuralHero({
  model,
  announcementMessage,
  showAffiliateNote,
  showPackageLink,
  commercialSummary,
}: {
  model: V4Model;
  announcementMessage?: string | null;
  showAffiliateNote?: boolean;
  showPackageLink?: boolean;
  commercialSummary?: string | null;
}) {
  const image = model.commercialImage;
  const name = model.contract.identity.productName;
  const kind = model.contract.identity.productKind;
  const headline = model.copy.headline.text;
  const subheadline = model.copy.subheadline?.text;
  const value = model.copy.valueProposition?.text;
  const introduction = model.copy.introduction.text;
  const slots = premiumSlotsFromModel(model);
  return (
    <section
      className="ds-hero-band presell-standard-hero premium-structural-hero"
      id="hero"
      data-v4-section="hero"
      data-structural-hero="v2"
      data-hero-mode={v4HeroMode(image)}
    >
      <DsContainer>
        <div className="premium-structural-hero__grid">
          <div className="premium-structural-hero__copy">
            {kind ? <DsKicker>{kind}</DsKicker> : null}
            {distinctText(headline, name) ? <p className="v4-identity">{name}</p> : null}
            <h1 className="ds-display">{distinctText(headline, name) ? headline : name}</h1>
            {distinctText(subheadline, headline, name, kind) ? <p className="ds-lead">{subheadline}</p> : null}
            {distinctText(value, headline, subheadline, name) ? <p className="ds-lead">{value}</p> : null}
            {distinctText(introduction, headline, subheadline, value, name) ? (
              <p className="ds-body">{presentVisitorCopy(introduction)}</p>
            ) : null}
            <EvidenceChips items={experimentalEvidenceChips(slots.evidenceChips, announcementMessage).slice(0, 3)} />
          </div>
          {image ? (
            <div className="premium-structural-hero__product">
              <div className="ds-hero__stage">
                <div className="ds-hero__frame">
                  <img src={image.src} alt={image.alt} width={1200} height={1200} data-v4-image="commercial" decoding="async" />
                </div>
              </div>
            </div>
          ) : null}
          <aside className="premium-structural-hero__facts" aria-label="Approved product facts">
            <HeroLogisticsRail items={slots.fulfillment} factMode="compact" />
          </aside>
          <div className="premium-structural-hero__actions">
            {model.hopSlot === "hero" ? <Hop model={model} slot="hero" /> : <PremiumCta slot="hero" />}
            {model.hopSlot === "offers" ? (
              <a className="ds-btn ds-btn--ghost" href="#offers" data-v4-cta="inpage">
                See packages
              </a>
            ) : null}
            {commercialSummary ? (
              <p className="ds-body" data-commercial-summary="1">
                {commercialSummary}
              </p>
            ) : null}
            {showPackageLink ? (
              <a className="ds-btn ds-btn--ghost" href="#seller-stated-packages" data-v4-cta="inpage">
                See seller-stated packages
              </a>
            ) : null}
            {showAffiliateNote ? (
              <p className="ds-meta">
                This page is an informational presentation. I may earn a commission if you purchase through the seller.
              </p>
            ) : null}
          </div>
        </div>
      </DsContainer>
    </section>
  );
}

function Hero({ model, announcementMessage }: { model: V4Model; announcementMessage?: string | null }) {
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
        "presell-standard-hero",
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
            <EvidenceChips items={experimentalEvidenceChips(premiumSlotsFromModel(model).evidenceChips, announcementMessage).slice(0, 3)} />
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
              <HeroLogisticsRail items={premiumSlotsFromModel(model).fulfillment} factMode="authorized" />
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
  const trustCards = slots.fulfillment.filter((item) => item.kind === "PAYMENT" || item.kind === "RETURNS");
  const covered = slots.fulfillment.map((item) => item.body.toLowerCase()).join("\n");
  const leftover = items
    .map((item) => publicItemText(item.text.text))
    .filter((text) => {
      const value = text.trim();
      return value.length > 0 && !covered.includes(value.toLowerCase());
    });
  return (
    <>
      <FulfillmentCardGrid items={trustCards} />
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

function templateBlueprintType(id: PresellStandardSectionId): SectionType | null {
  if (id === "PREMIUM_HERO") return "hero";
  if (id === "TRUST_INFORMATION") return "trust";
  if (id === "PRODUCT_OVERVIEW") return "differentiators";
  if (id === "HOW_IT_WORKS") return "how_it_works";
  if (id === "INGREDIENTS_OR_MODULES") return "specifications";
  if (id === "GUARANTEE") return "guarantee";
  if (id === "PREMIUM_FAQ") return "faq";
  if (id === "LEGAL_FOOTER") return "legal";
  return null;
}

export function StandardV1Page({
  model,
  executionId,
  campaignId,
}: {
  model: V4Model;
  executionId?: string | null;
  campaignId?: number;
}) {
  const template = mapPresellStandardV1(model);
  const taggedExecution = executionId?.trim() || CONTROLLED_IMPROVEMENT_EXECUTION_ID;
  const structural = usesPremiumStructuralComposition(taggedExecution);
  const producer = usesPremiumProducerContent(taggedExecution);
  const producerV2 = usesPremiumProducerContentV2(taggedExecution);
  const commercial = producer && campaignId != null ? readCommercialReuse(campaignId) : null;
  const commercialSummary =
    producerV2 && commercial?.approvedPackages.length
      ? `Seller-stated packages: ${commercial.approvedPackages.map((item) => `${item.quantity} at ${item.unitPrice}`).join(", ")} per bottle.`
      : null;
  const presentIds = new Set(template.sections.filter((item) => item.present).map((item) => item.id));
  const byType = new Map(model.blueprint.sections.map((section) => [section.sectionType, section]));
  const order: BlueprintSection[] = [];
  const seen = new Set<string>();
  for (const section of template.sections) {
    if (!section.present) continue;
    if (section.id === "SHIPPING_OR_ACCESS" || section.id === "ANNOUNCEMENT_BAR" || section.id === "COMMERCIAL_CTA" || section.id === "VERIFIED_TESTIMONIALS") {
      continue;
    }
    const type = templateBlueprintType(section.id);
    const match =
      type === "differentiators"
        ? byType.get("differentiators") ?? byType.get("benefits")
        : type
          ? byType.get(type)
          : undefined;
    if (!match || seen.has(match.sectionId) || !visible(model, match.sectionType)) continue;
    seen.add(match.sectionId);
    order.push(match);
  }
  for (const section of model.blueprint.sections) {
    if (seen.has(section.sectionId) || !visible(model, section.sectionType)) continue;
    if (section.sectionType === "offers" || section.sectionType === "demonstration" || section.sectionType === "cta_final") continue;
    order.push(section);
  }
  const patch = model.qualityPatch;
  const heroMode = v4HeroMode(model.commercialImage);
  const gallery = galleryPresentationOf({
    heroMode,
    galleryImages: model.galleryImages,
  });
  const shippingCards = presentIds.has("SHIPPING_OR_ACCESS")
    ? premiumSlotsFromModel(model).fulfillment.filter((item) => item.kind === "DISPATCH" || item.kind === "DELIVERY")
    : [];
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
      data-presell-standard={PRESELL_STANDARD_ID}
      data-presell-candidate={PRESELL_STANDARD_ID}
      data-presell-execution={taggedExecution}
      data-presell-composition={
        producerV2
          ? PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID
          : producer
            ? PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID
            : structural
              ? PREMIUM_STRUCTURAL_COMPOSITION_ID
              : undefined
      }
    >
      {template.announcement ? <AnnouncementBar message={template.announcement.message} /> : null}
      {order.map((section) => {
        if (section.sectionType === "hero") {
          return (
            <div key={section.sectionId}>
              {structural ? (
                <StructuralHero
                  model={model}
                  announcementMessage={template.announcement?.message ?? null}
                  showAffiliateNote={producer}
                  showPackageLink={Boolean(commercial?.approvedPackages.length)}
                  commercialSummary={commercialSummary}
                />
              ) : (
                <Hero model={model} announcementMessage={template.announcement?.message ?? null} />
              )}
              {producer && commercial?.approvedPackages.length ? (
                <SellerStatedOffers manifest={commercial} finalized={producerV2} />
              ) : null}
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
        const shippingAfterThis =
          shippingCards.length > 0 &&
          (section.sectionType === "guarantee" ||
            (!order.some((item) => item.sectionType === "guarantee") && section.sectionType === "faq"));
        return (
          <React.Fragment key={section.sectionId}>
            <DsSection
              id={section.sectionType === "offers" ? "offers" : section.sectionId}
              tone={toneFor(section.sectionType)}
              className="v4-band"
              tight={model.density === "thin" || editorialHeroMode(Boolean(model.commercialImage)) === "EDITORIAL_NO_IMAGE"}
            >
              <DsContainer width={section.sectionType === "offers" || section.sectionType === "differentiators" ? "wide" : "content"}>
                <div data-v4-section={section.sectionType} data-v4-purpose={section.commercialPurpose}>
                  <h2 className="ds-h2">
                    {experimentalSectionTitle({
                      sectionType: section.sectionType,
                      headline: section.headline.text,
                      productName: model.contract.identity.productName,
                      productKind: model.contract.identity.productKind,
                      ingredientCount: premiumSlotsFromModel(model).ingredients.length,
                      usageCount: premiumSlotsFromModel(model).usage.length,
                      guaranteeDays: premiumSlotsFromModel(model).guarantee.days,
                      productFormat: template.productFormat,
                      titles: patch?.titles,
                    })}
                  </h2>
                  {inner}
                  {section.sectionType === "guarantee" && model.hopSlot === "none" ? <PremiumCta slot="mid" /> : null}
                </div>
              </DsContainer>
            </DsSection>
            {shippingAfterThis ? (
              <DsSection id="shipping-or-access" tone="alt" className="v4-band">
                <DsContainer width="content">
                  <div data-v4-section="trust" data-presell-section="SHIPPING_OR_ACCESS">
                    <h2 className="ds-h2">{template.productFormat === "DIGITAL" ? "Access" : "Shipping"}</h2>
                    <ShippingOrAccess items={shippingCards} />
                  </div>
                </DsContainer>
              </DsSection>
            ) : null}
          </React.Fragment>
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
