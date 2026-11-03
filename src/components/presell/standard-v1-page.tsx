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
  PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID,
  PREMIUM_CONVERSION_OPTIMIZATION_COMPOSITION_ID,
  PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID,
  PREMIUM_FINAL_VISUAL_COMPOSITION_ID,
  usesPremiumProducerContent,
  usesPremiumProducerContentV2,
  usesPremiumStructuralComposition,
  usesPremiumVisualOptimization,
  usesPremiumConversionOptimization,
  usesPremiumEditorialCorrection,
  usesPremiumFinalVisual,
} from "@/lib/presell-quality/renderer-candidate";
import { readCommercialReuse, type CommercialReuseManifest } from "@/lib/presell-quality/commercial-reuse";
import {
  buildEditorialCopy,
  buildSeedCommercialCopy,
  compositionDataAttributes,
  complianceLines,
  conversionSectionTitle,
  defaultVisualComposition,
  heroIntroduction,
  presentCommercialHeroCopy,
  presentPackageShipping,
  readCommercialCopy,
  readVisualComposition,
  inventoryFromPage,
  type CommercialCopyState,
  type VisualComposition,
} from "@/lib/presell-quality/visual-optimization-agent";
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
  composition,
}: {
  manifest: CommercialReuseManifest;
  finalized?: boolean;
  composition?: VisualComposition | null;
}) {
  if (!manifest.approvedPackages.length) return null;
  const optimized = Boolean(composition);
  const highlight = composition?.packages.highlight ?? "none";
  const compare = Boolean(composition?.conversion.offerCompare);
  const lowestUnit = manifest.approvedPackages.reduce((best, item) => {
    const amount = Number(item.unitPrice.replace(/[^\d.]/g, ""));
    return Number.isFinite(amount) && amount < best.amount ? { amount, id: item.id } : best;
  }, { amount: Number.POSITIVE_INFINITY, id: "" });
  return (
    <DsSection tone="soft" className={cx("v4-band", (finalized || optimized) && "premium-producer-offers")} id="seller-stated-packages">
      <DsContainer>
        <DsKicker>{optimized ? "Available packages" : "Seller-stated offer"}</DsKicker>
        <h2 className="ds-h2">{optimized ? "Choose a bottle count" : "Packages shown on the seller's order page"}</h2>
        {compare ? (
          <p className="ds-body" data-offer-compare="1">
            {manifest.approvedPackages.map((item) => `${item.quantity}: ${item.unitPrice} each · ${item.currentTotal}`).join("  ·  ")}
          </p>
        ) : null}
        {optimized ? null : <p className="ds-body">{manifest.attribution}</p>}
        <div
          className="premium-grid premium-producer-packages"
          data-premium="packages"
          data-seller-stated-offers="1"
          data-package-layout={optimized ? "optimized" : finalized ? "below-hero" : "legacy"}
        >
          {manifest.approvedPackages.map((item, index) => {
            const featured =
              (highlight === "middle" && index === 1) ||
              (highlight === "best-value" && (item.id === lowestUnit.id || /best value/i.test(item.label)));
            return (
              <article
                key={item.id}
                className={cx("premium-card", featured && "premium-card--featured")}
                data-seller-package={item.id}
                data-package-featured={featured ? "1" : undefined}
              >
                <p className="ds-kicker">{item.label}</p>
                <h3 className="ds-h3">
                  {item.quantity}
                  {item.duration ? ` · ${item.duration}` : ""}
                </h3>
                <p className="ds-display ds-display--package">{item.unitPrice}</p>
                <p className="ds-meta">{optimized ? "per bottle" : "per bottle, seller-stated"}</p>
                <p className="ds-body">
                  {optimized ? `Total ${item.currentTotal}` : `Current total ${item.currentTotal}`}
                  {item.comparedTotal ? ` (listed comparison ${item.comparedTotal})` : ""}
                </p>
                {item.bonuses.length ? (
                  <p className="ds-body">
                    {optimized
                      ? item.bonuses.map((bonus) => bonus.replace(/^Seller-stated extras:\s*/i, "Includes ")).join(" · ")
                      : item.bonuses.join(" · ")}
                  </p>
                ) : null}
                <p className="ds-meta">{optimized ? presentPackageShipping(item.shippingTerm) : item.shippingTerm}</p>
              </article>
            );
          })}
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
  composition,
  commercialCopy,
  conversion,
}: {
  model: V4Model;
  announcementMessage?: string | null;
  showAffiliateNote?: boolean;
  showPackageLink?: boolean;
  commercialSummary?: string | null;
  composition?: VisualComposition | null;
  commercialCopy?: CommercialCopyState | null;
  conversion?: boolean;
}) {
  const image = model.commercialImage;
  const name = model.contract.identity.productName;
  const kind = model.contract.identity.productKind;
  const headline = commercialCopy?.headline.text || model.copy.headline.text;
  const subheadline = commercialCopy?.subheadline.text || model.copy.subheadline?.text;
  const value = conversion ? null : model.copy.valueProposition?.text;
  const introduction = commercialCopy?.heroBody.text || model.copy.introduction.text;
  const slots = premiumSlotsFromModel(model);
  const hideChips = Boolean(conversion && composition?.conversion.hideHeroChips);
  const ctaLabel = commercialCopy?.ctaLabel || (composition ? "See packages" : "See seller-stated packages");
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
            {value && distinctText(value, headline, subheadline, name) ? <p className="ds-lead">{value}</p> : null}
            {distinctText(introduction, headline, subheadline, value || "", name) ? (
              <p className="ds-body">{composition ? heroIntroduction(introduction, composition) : presentVisitorCopy(introduction)}</p>
            ) : null}
            {hideChips ? null : <EvidenceChips items={experimentalEvidenceChips(slots.evidenceChips, announcementMessage).slice(0, 3)} />}
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
          {hideChips ? null : (
            <aside className="premium-structural-hero__facts" aria-label="Approved product facts">
              <HeroLogisticsRail items={slots.fulfillment} factMode="compact" />
            </aside>
          )}
          <div className="premium-structural-hero__actions">
            {conversion && showPackageLink ? (
              <a className="ds-btn ds-btn--cta" href="#seller-stated-packages" data-v4-cta="inpage">
                {ctaLabel}
              </a>
            ) : model.hopSlot === "hero" ? (
              <Hop model={model} slot="hero" />
            ) : (
              <PremiumCta slot="hero" />
            )}
            {!conversion && model.hopSlot === "offers" ? (
              <a className="ds-btn ds-btn--ghost" href="#offers" data-v4-cta="inpage">
                See packages
              </a>
            ) : null}
            {commercialSummary ? (
              <p className="ds-body" data-commercial-summary="1">
                {commercialSummary}
              </p>
            ) : null}
            {!conversion && showPackageLink ? (
              <a className="ds-btn ds-btn--ghost" href="#seller-stated-packages" data-v4-cta="inpage">
                {ctaLabel}
              </a>
            ) : null}
            {showAffiliateNote && composition?.copy.compliancePlacement !== "aside" ? (
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

function SpecSection({
  section,
  ingredientLayout = "plain",
}: {
  section: BlueprintSection;
  ingredientLayout?: "plain" | "distinct";
}) {
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
      {notes.length ? (
        <IngredientCardGrid items={notes.map((note) => ({ name: note, detail: null }))} layout={ingredientLayout} />
      ) : null}
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

function FaqSection({
  section,
  model,
  openFirst = false,
}: {
  section: BlueprintSection;
  model: V4Model;
  openFirst?: boolean;
}) {
  const slots = premiumSlotsFromModel(model);
  if (slots.faq.length) return <PremiumFaq items={slots.faq} openFirst={openFirst} />;
  const entries = section.items
    .map((item) => ({
      question: item.title?.text ?? item.text.text,
      answer: item.title ? item.text.text : "",
    }))
    .filter((item) => item.question.trim() && item.answer.trim());
  return <PremiumFaq items={entries} openFirst={openFirst} />;
}

function TrustSection({
  section,
  model,
  merged = false,
}: {
  section: BlueprintSection;
  model: V4Model;
  merged?: boolean;
}) {
  const slots = premiumSlotsFromModel(model);
  const items = section.items.length ? section.items : section.body.map((item) => ({ text: item }));
  const mergedTitles = {
    DISPATCH: "Shipping",
    DELIVERY: "Delivery",
    RETURNS: "Returns",
    PAYMENT: "Payment",
  } as const;
  const trustCards = merged
    ? slots.fulfillment.map((item) => ({ ...item, title: mergedTitles[item.kind] }))
    : slots.fulfillment.filter((item) => item.kind === "PAYMENT" || item.kind === "RETURNS");
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
  const visualOpt = usesPremiumVisualOptimization(taggedExecution);
  const conversion = usesPremiumConversionOptimization(taggedExecution);
  const editorial = usesPremiumEditorialCorrection(taggedExecution);
  const finalVisual = usesPremiumFinalVisual(taggedExecution);
  const storedComposition = campaignId != null ? readVisualComposition(campaignId) : null;
  const composition = visualOpt
    ? storedComposition &&
      (storedComposition.executionId === taggedExecution ||
        (finalVisual && storedComposition.executionId === CONTROLLED_IMPROVEMENT_EXECUTION_ID))
      ? storedComposition
      : defaultVisualComposition(finalVisual ? "54BU" : editorial ? "54BR" : conversion ? "54BQ" : "54BP")
    : null;
  const commercial = producer && campaignId != null ? readCommercialReuse(campaignId) : null;
  const slots = premiumSlotsFromModel(model);
  const copyInventory = inventoryFromPage({
    productName: model.contract.identity.productName,
    productKind: model.contract.identity.productKind ?? null,
    ingredients: slots.ingredients.map((item) => item.name),
    description: model.copy.introduction.text,
    usage: slots.usage.join(" "),
    guarantee: slots.guarantee.statements.join(" "),
    guaranteeDays: slots.guarantee.days,
    packages: commercial?.approvedPackages ?? [],
  });
  const storedCopy = campaignId != null ? readCommercialCopy(campaignId) : null;
  const commercialCopy =
    conversion
      ? storedCopy &&
        (storedCopy.executionId === taggedExecution ||
          (finalVisual && storedCopy.executionId === CONTROLLED_IMPROVEMENT_EXECUTION_ID))
        ? storedCopy
        : editorial
          ? buildEditorialCopy({ ...copyInventory, executionId: finalVisual ? "54BU" : "54BR" })
          : buildSeedCommercialCopy({ ...copyInventory, executionId: "54BQ" })
      : null;
  const commercialSummary =
    (conversion || visualOpt) && commercial?.approvedPackages.length
      ? commercial.approvedPackages.map((item) => `${item.quantity} at ${item.unitPrice} per bottle`).join("; ")
      : producerV2 && commercial?.approvedPackages.length
        ? `Seller-stated packages: ${commercial.approvedPackages.map((item) => `${item.quantity} at ${item.unitPrice}`).join(", ")} per bottle.`
        : null;
  const compositionAttrs = composition ? compositionDataAttributes(composition) : {};
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
    if (
      conversion &&
      composition?.conversion.hideHeroChips &&
      (match.sectionType === "differentiators" || match.sectionType === "benefits")
    ) {
      seen.add(match.sectionId);
      continue;
    }
    seen.add(match.sectionId);
    order.push(match);
  }
  for (const section of model.blueprint.sections) {
    if (seen.has(section.sectionId) || !visible(model, section.sectionType)) continue;
    if (section.sectionType === "offers" || section.sectionType === "demonstration" || section.sectionType === "cta_final") continue;
    if (
      conversion &&
      composition?.conversion.hideHeroChips &&
      (section.sectionType === "differentiators" || section.sectionType === "benefits")
    ) {
      continue;
    }
    order.push(section);
  }
  if (conversion && composition?.conversion.sectionJourney === "packages-first") {
    const rank = ["hero", "specifications", "how_it_works", "guarantee", "trust", "faq", "legal"];
    order.sort((left, right) => {
      const a = rank.indexOf(left.sectionType);
      const b = rank.indexOf(right.sectionType);
      return (a < 0 ? 99 : a) - (b < 0 ? 99 : b);
    });
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
      data-final-visual={finalVisual ? "1" : undefined}
      data-presell-composition={
        finalVisual
          ? PREMIUM_FINAL_VISUAL_COMPOSITION_ID
          : editorial
          ? PREMIUM_EDITORIAL_CORRECTION_COMPOSITION_ID
          : conversion
            ? PREMIUM_CONVERSION_OPTIMIZATION_COMPOSITION_ID
            : visualOpt
              ? PREMIUM_VISUAL_OPTIMIZATION_COMPOSITION_ID
              : producerV2
                ? PREMIUM_PRODUCER_CONTENT_V2_COMPOSITION_ID
                : producer
                  ? PREMIUM_PRODUCER_CONTENT_COMPOSITION_ID
                  : structural
                    ? PREMIUM_STRUCTURAL_COMPOSITION_ID
                    : undefined
      }
      {...compositionAttrs}
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
                  composition={composition}
                  commercialCopy={commercialCopy}
                  conversion={conversion}
                />
              ) : (
                <Hero model={model} announcementMessage={template.announcement?.message ?? null} />
              )}
              {producer && commercial?.approvedPackages.length ? (
                <SellerStatedOffers manifest={commercial} finalized={producerV2} composition={composition} />
              ) : null}
              {conversion && composition?.conversion.productPresentation === "editorial" && model.commercialImage ? (
                <DsSection tone="alt" className="v4-band" id="product-presentation">
                  <DsContainer>
                    <div data-product-presentation="editorial" data-v4-section="demonstration">
                      <h2 className="ds-h2">The product</h2>
                      <div className="premium-editorial-product">
                        <div className="ds-hero__stage">
                          <div className="ds-hero__frame">
                            <img
                              src={model.commercialImage.src}
                              alt={model.commercialImage.alt}
                              width={1200}
                              height={1200}
                              data-v4-image="commercial"
                            />
                          </div>
                        </div>
                        <p className="ds-body">{presentCommercialHeroCopy(model.copy.introduction.text)}</p>
                      </div>
                    </div>
                  </DsContainer>
                </DsSection>
              ) : null}
              {composition?.copy.compliancePlacement === "aside" ? (
                <aside className="premium-compliance-band" data-compliance-band="1">
                  <DsContainer>
                    {complianceLines({
                      attribution: commercial?.attribution,
                      affiliate: producer,
                      sandboxPlacement: composition.conversion.sandboxPlacement,
                    }).map((line) => (
                      <p className="ds-meta" key={line}>
                        {line}
                      </p>
                    ))}
                  </DsContainer>
                </aside>
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
            <SpecSection section={section} ingredientLayout={composition?.conversion.ingredientLayout} />
          ) : section.sectionType === "offers" ? (
            <OfferSection model={model} section={section} />
          ) : section.sectionType === "faq" ? (
            <FaqSection model={model} section={section} openFirst={composition?.conversion.faqMode === "interactive"} />
          ) : section.sectionType === "how_it_works" ? (
            premiumSlotsFromModel(model).usage.length ? (
              <UsageSteps items={premiumSlotsFromModel(model).usage} />
            ) : (
              <FeatureSection section={section} numbered />
            )
          ) : section.sectionType === "trust" ? (
            <TrustSection section={section} model={model} merged={composition?.conversion.mergeFulfillment} />
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
          !(composition?.conversion.mergeFulfillment && order.some((item) => item.sectionType === "trust")) &&
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
                    {conversion
                      ? conversionSectionTitle({
                          sectionType: section.sectionType,
                          fallback: experimentalSectionTitle({
                            sectionType: section.sectionType,
                            headline: section.headline.text,
                            productName: model.contract.identity.productName,
                            productKind: model.contract.identity.productKind ?? null,
                            ingredientCount: slots.ingredients.length,
                            usageCount: slots.usage.length,
                            guaranteeDays: slots.guarantee.days,
                            productFormat: template.productFormat,
                            titles: patch?.titles,
                          }),
                          ingredientCount: slots.ingredients.length,
                          productFormat: template.productFormat,
                        })
                      : experimentalSectionTitle({
                          sectionType: section.sectionType,
                          headline: section.headline.text,
                          productName: model.contract.identity.productName,
                          productKind: model.contract.identity.productKind ?? null,
                          ingredientCount: premiumSlotsFromModel(model).ingredients.length,
                          usageCount: premiumSlotsFromModel(model).usage.length,
                          guaranteeDays: premiumSlotsFromModel(model).guarantee.days,
                          productFormat: template.productFormat,
                          titles: patch?.titles,
                        })}
                  </h2>
                  {inner}
                  {section.sectionType === "guarantee" && model.hopSlot === "none" ? (
                    conversion && commercial?.approvedPackages.length ? (
                      <a className="ds-btn ds-btn--cta" href="#seller-stated-packages" data-v4-cta="inpage">
                        {commercialCopy?.ctaLabel || "See packages"}
                      </a>
                    ) : (
                      <PremiumCta slot="mid" />
                    )
                  ) : null}
                </div>
              </DsContainer>
            </DsSection>
            {shippingAfterThis ? (
              <DsSection id="shipping-or-access" tone="alt" className="v4-band">
                <DsContainer width="content">
                  <div data-v4-section="trust" data-presell-section="SHIPPING_OR_ACCESS">
                    <h2 className="ds-h2">
                      {conversion
                        ? template.productFormat === "DIGITAL"
                          ? "Access and payment"
                          : "Delivery and payment"
                        : template.productFormat === "DIGITAL"
                          ? "Access"
                          : "Shipping"}
                    </h2>
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
