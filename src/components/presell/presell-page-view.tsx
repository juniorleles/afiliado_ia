import Script from "next/script";
import type { Campaign } from "@/lib/campaigns";
import { buildAffiliateHref } from "@/lib/affiliate-url";
import type { CtaPosition } from "@/lib/analytics";
import { copyEligibleGuaranteeSentence, parsePresellPage, type PresellPage } from "@/lib/presell-page";
import type { ProductFacts } from "@/lib/product-facts";
import { outboundCta, PresellCta } from "@/components/presell/presell-cta";
import { VisualMasterView } from "@/components/presell/visual-master-view";
import { NO_PRESELL_RENDER_ASSETS, type PresellRenderAssets } from "@/lib/presell-render-assets";
import { PRODUCTION_PRESENTATION_ID } from "@/lib/production-candidate-view";
import { designPlanForCampaign, PresellThemeRoot } from "@/components/presell/presell-theme";
import type { SourceVisual } from "@/lib/visual-identity/types";
import { ProductStage } from "@/components/presell/product-stage";
import { EmptyAssetHero } from "@/components/presell/empty-asset-hero";
import { StickyCtaBar } from "@/components/presell/sticky-cta-bar";
import { CreativeScene, OverviewVisualBridge, ClosingProductScene } from "@/components/presell/scene-render";
import { SectionNav } from "@/components/presell/section-nav";
import { OfferComparison } from "@/components/presell/presentation-blocks";
import { copyEligibleScalar } from "@/lib/product-facts";
import { presentOffers, primaryConversionLabel } from "@/lib/presell-presentation";
import { AFFILIATE_DISCLOSURE_TEXT } from "@/lib/public-site";
import { renderedBuilderContent } from "@/lib/builder-content";
import { heroBenefitSplit } from "@/lib/premium/presentation-priority";
import { featureLines, planPremiumConversion } from "@/lib/premium/conversion-plan";
import { artPlanFor, directSectionArt } from "@/lib/premium/section-art-director";
import { ingredientFactKey } from "@/lib/assets/ingredient-visual-association";
import { discoverVisualAssets, planSectionAssets, sectionNavLinks, VISUAL_ASSET_SYSTEM_VERSION } from "@/lib/premium/visual-asset-system";
import { SceneGeometry } from "@/components/presell/scene-geometry";
import type { DesignPlan, HeroVariant } from "@/lib/design/plan";
import { packshotAvailable } from "@/lib/design/plan";
import { createDesignPlan } from "@/lib/design/planner";
import { structuredFactGroups } from "@/lib/presell-structured-display";
import { analyzeProductProfile } from "@/lib/product-profile";
import { planPresentation } from "@/lib/presentation-plan";
import { parseCreativeCompositionPlan } from "@/lib/creative/plan";
import { createCreativeCompositionPlan } from "@/lib/creative/planner";
import type { CreativeCompositionPlan } from "@/lib/creative/types";

function factsFromCampaign(campaign: Campaign): ProductFacts | null {
  if (!campaign.sourceFactsJson) return null;
  try {
    return JSON.parse(campaign.sourceFactsJson) as ProductFacts;
  } catch {
    return null;
  }
}

function productNameFromFacts(campaign: Campaign): string {
  return factsFromCampaign(campaign)?.productName?.trim() || "";
}

function authorizedCopy(page: PresellPage): string {
  return [
    page.hero.headline,
    page.hero.subheadline,
    page.hero.summary,
    ...page.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...section.bullets,
      ...section.cards.flatMap((card) => [card.title, card.body]),
      ...section.faq.flatMap((item) => [item.question, item.answer]),
    ]),
  ].join(" ");
}

function sectionItemCount(page: PresellPage, id: string): number {
  const section = page.sections.find((item) => item.id === id && item.visible);
  if (!section) return 0;
  if (id === "ingredients") return section.cards.length || section.bullets.length;
  if (id === "features") return featureLines(page).length;
  if (id === "faq") return section.faq.length;
  return section.paragraphs.length + section.bullets.length + section.cards.length;
}

function HeroVisual({
  page,
  plan,
  campaign,
  presentation,
}: {
  page: PresellPage;
  plan: DesignPlan;
  campaign: Campaign;
  presentation: "hero" | "anchor";
}) {
  if (packshotAvailable(plan) && page.hero.image.src) {
    return (
      <ProductStage
        image={page.hero.image}
        overlap={plan.tokens.imageOverlap}
        scale={plan.tokens.imageScale}
        presentation={presentation}
        priority={presentation === "hero"}
      />
    );
  }
  return <EmptyAssetHero productName={productNameFromFacts(campaign)} />;
}

function HeroFacts({ page, limit }: { page: PresellPage; limit: number }) {
  const highlights = page.hero.highlights.slice(0, limit);
  if (highlights.length === 0) return null;
  return (
    <ul className="ps-hero-facts">
      {highlights.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function heroCopyParts(
  page: PresellPage,
  cta: React.ReactNode,
  factLimit: number,
  riskReducer: string,
  valueLine: string,
  disclosureText: string,
  heroDisclaimer: string,
) {
  const benefit = valueLine && valueLine.trim().toLowerCase() !== page.hero.headline.trim().toLowerCase()
    ? heroBenefitSplit(valueLine)
    : null;
  return {
    eyebrow: (
      <p key="eyebrow" className="ps-eyebrow ps-hero-eyebrow">
        {page.hero.badge}
      </p>
    ),
    title: benefit ? (
      <div key="title" className="ps-hero-title-block">
        <p className="ps-hero-identity">{page.hero.headline}</p>
        <h1 className="ps-hero-title ps-hero-title-grounded" data-hero-value="1">
          {benefit.benefit}
        </h1>
        <p className="ps-hero-support" data-hero-support="1">
          {benefit.support}
        </p>
      </div>
    ) : valueLine && valueLine.trim().toLowerCase() !== page.hero.headline.trim().toLowerCase() ? (
      <div key="title" className="ps-hero-title-block">
        <p className="ps-hero-identity">{page.hero.headline}</p>
        <h1 className="ps-hero-title ps-hero-title-grounded" data-hero-value="1">
          {valueLine}
        </h1>
      </div>
    ) : (
      <h1 key="title" className="ps-hero-title">
        {page.hero.headline}
      </h1>
    ),
    summary: benefit || (valueLine && valueLine.trim().toLowerCase() !== page.hero.headline.trim().toLowerCase()) ? null : valueLine ? (
      <p key="summary" className="ps-hero-summary ps-hero-value" data-hero-value="1">
        {valueLine}
      </p>
    ) : null,
    disclosure: (
      <p key="disclosure" className="ps-hero-disclosure">
        {heroDisclaimer ? <span className="ps-hero-disclosure">{heroDisclaimer} </span> : null}
        {disclosureText}
      </p>
    ),
    cta: (
      <div key="cta" className="ps-hero-cta">
        {cta}
      </div>
    ),
    riskReducer: riskReducer ? (
      <p key="reassure" className="ps-hero-reassure" data-hero-guarantee="1">
        {riskReducer}
      </p>
    ) : null,
    facts: <HeroFacts key="facts" page={page} limit={factLimit} />,
  };
}

function HeroBlock({
  page,
  plan,
  campaign,
  creative,
  cta,
  valueLine,
}: {
  page: PresellPage;
  plan: DesignPlan;
  campaign: Campaign;
  creative: CreativeCompositionPlan;
  cta: React.ReactNode;
  valueLine: string;
}) {
  const variant: HeroVariant = plan.heroVariant;
  const ready = packshotAvailable(plan);
  const heroScene = creative.scenes.find((scene) => scene.kind === "HERO_PRODUCT_STAGE");
  const featuresVisible = page.sections.some((section) => section.id === "features" && section.visible);
  const factLimit = featuresVisible ? 0 : (heroScene?.visibleLeadCount ?? 3);
  const visual = <HeroVisual page={page} plan={plan} campaign={campaign} presentation="hero" />;
  const riskReducer = copyEligibleGuaranteeSentence(page, factsFromCampaign(campaign));
  const content = renderedBuilderContent(page);
  const parts = heroCopyParts(
    page,
    plan.ctaStrategy.hero ? cta : null,
    factLimit,
    riskReducer,
    valueLine,
    content?.disclosure || AFFILIATE_DISCLOSURE_TEXT,
    content?.heroDisclaimer || "",
  );
  const layout =
    !ready && (variant === "PRODUCT_STAGE" || variant === "PRODUCT_CANVAS" || variant === "PRODUCT_SPLIT")
      ? "MAGAZINE_PRODUCT"
      : variant;
  const v3 = Boolean(heroScene && ready);

  if (layout === "PRODUCT_CANVAS" || layout === "CENTERED_PRODUCT") {
    return (
      <header className="ps-hero ps-hero-canvas" id="hero">
        <div className="ps-hero-canvas-visual">{visual}</div>
        <div className="ps-hero-canvas-copy">
          {parts.eyebrow}
          {parts.title}
          {parts.summary}
          {parts.cta}
          {parts.riskReducer}
          {parts.disclosure}
          {parts.facts}
        </div>
      </header>
    );
  }

  return (
    <header
      className={`ps-hero ps-hero-premium ${ready ? "ps-hero-stage" : "ps-hero-magazine"} ${v3 ? "ps-hero-v3" : ""}`}
      data-scene="HERO_PRODUCT_STAGE"
      data-narrative="INTRODUCE"
      id="hero"
    >
      <SceneGeometry variant={heroScene?.geometry ?? "orb"} />
      <div className={ready ? "ps-hero-stage-grid" : "ps-hero-magazine-grid"}>
        {parts.eyebrow}
        {parts.title}
        <div className="ps-hero-visual" data-empty={ready ? "false" : "true"}>
          {visual}
        </div>
        {parts.summary}
        {parts.cta}
        {parts.riskReducer}
        {parts.disclosure}
        {parts.facts}
      </div>
    </header>
  );
}

export function PresellPageView({
  campaign,
  page,
  incomingQuery = "",
  renderPixel = false,
  trackClicks = false,
  disableAffiliateNavigation = false,
  renderAssets = NO_PRESELL_RENDER_ASSETS,
  sourceVisual = null,
}: {
  campaign: Campaign;
  page: PresellPage;
  incomingQuery?: string;
  renderPixel?: boolean;
  trackClicks?: boolean;
  disableAffiliateNavigation?: boolean;
  renderAssets?: PresellRenderAssets;
  sourceVisual?: SourceVisual | null;
}) {
  const facts = factsFromCampaign(campaign);
  const pricingText = facts
    ? copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation)
    : "";
  const offers = presentOffers(facts);
  const content = renderedBuilderContent(page);
  const ctaLabel = primaryConversionLabel(page.ctaLabel, offers.length > 0);
  const closingLabel = content?.closingCta || ctaLabel;
  const premium = planPremiumConversion({
    page,
    pricingText,
    guaranteeLine: copyEligibleGuaranteeSentence(page, facts),
    packshotReady: Boolean(page.hero.image.src),
  });
  const href = buildAffiliateHref(campaign.affiliateUrl, new URLSearchParams(incomingQuery));
  const heroCta = outboundCta(href, trackClicks);
  const navCta = outboundCta(href, trackClicks);
  const finalCta = outboundCta(href, trackClicks);
  const stickyCta = outboundCta(href, trackClicks);
  const plan = designPlanForCampaign(campaign) ?? createFallbackPlan(page);
  const creative =
    parseCreativeCompositionPlan(campaign.creativeCompositionJson) ??
    createCreativeCompositionPlan({ page, design: plan });
  const artSections: Array<{ id: string; itemCount: number }> = [];
  if (!page.sections.some((section) => section.id === "overview" && section.visible)) {
    artSections.push({ id: "overview-bridge", itemCount: 0 });
  }
  for (const scene of creative.scenes) {
    const role = scene.sectionIds[0] || "";
    if (scene.kind === "CTA_TRANSITION_SCENE" || scene.kind === "HERO_PRODUCT_STAGE") continue;
    if (scene.kind === "TRUST_DISCLOSURE_SCENE") {
      if (offers.length > 0) artSections.push({ id: "offer", itemCount: offers.length });
      if (page.hero.image.src) artSections.push({ id: "closing", itemCount: 1 });
      if (role) artSections.push({ id: role, itemCount: sectionItemCount(page, role) });
      continue;
    }
    if (role) artSections.push({ id: role, itemCount: sectionItemCount(page, role) });
  }
  const art = directSectionArt({
    authorizedCopy: authorizedCopy(page),
    sections: artSections,
    packshotReady: Boolean(page.hero.image.src),
  });
  const ingredientImages = new Map(
    (renderAssets.ingredientVisuals ?? []).map((item) => [ingredientFactKey(item.factValue), item.src]),
  );
  const discovered = discoverVisualAssets({
    packshot: page.hero.image.src ? { url: page.hero.image.src } : undefined,
    offers: offers.map((offer) => ({ name: offer.name, imageUrl: offer.imageUrl })),
    ingredients: page.sections
      .filter((section) => section.id === "ingredients" && section.visible)
      .flatMap((section) =>
        section.cards.map((card) => {
          const imageUrl = ingredientImages.get(ingredientFactKey(card.title));
          return imageUrl ? { name: card.title, imageUrl, embeddedText: "" } : { name: card.title };
        }),
      ),
  });
  const assetPlans = planSectionAssets({
    sections: art.sections.map((section) => ({ id: section.sectionRole, itemCount: 0 })),
    assets: discovered,
  });
  const navLinks = sectionNavLinks(page.sections).map((link) => ({
    ...link,
    label: content?.navLabels?.[`#${link.id}`] ?? link.label,
  }));

  const cta = (
    position: CtaPosition,
    payload: typeof heroCta,
    layout?: "block" | "compact" | "sticky",
    label = position === "final" ? closingLabel : ctaLabel,
  ) => (
    <PresellCta
      href={payload.href}
      label={label}
      position={position}
      campaignId={campaign.id}
      trackClicks={trackClicks}
      clickId={payload.clickId}
      layout={layout}
      disableAffiliateNavigation={disableAffiliateNavigation}
    />
  );

  if (campaign.productionPresentation === PRODUCTION_PRESENTATION_ID) {
    return (
      <PresellThemeRoot campaign={campaign} creative={creative} sourceVisual={sourceVisual}>
        {renderPixel && campaign.headScript ? (
          <Script id="presell-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: campaign.headScript }} />
        ) : null}
        <VisualMasterView
          page={page}
          heroCta={cta("hero", heroCta, "compact")}
          navCta={cta("header", navCta, "compact")}
          finalCta={cta("final", finalCta, "compact")}
          visualAssets={renderAssets.visualAssets}
          productVisuals={renderAssets.productVisuals}
          structuredLists={structuredFactGroups(facts)}
          productName={productNameFromFacts(campaign)}
          offerCount={facts?.offerFacts?.length ?? 0}
          presentationPlan={facts ? planPresentation(facts, analyzeProductProfile(facts)) : undefined}
          offers={offers.map((offer) => ({ name: offer.name, price: offer.price, totalPrice: offer.totalPrice }))}
          ingredientImages={Object.fromEntries(ingredientImages)}
        />
      </PresellThemeRoot>
    );
  }

  const visuals = renderAssets.visualAssets;
  const atmosphere = {
    ["--ps-sticky-pad" as string]: `${creative.stickyCta.collisionPaddingPx}px`,
    ...(visuals.heroAtmosphere ? { ["--ps-hero-atmosphere" as string]: `url("${visuals.heroAtmosphere}")` } : {}),
    ...(visuals.featureVisual ? { ["--ps-feature-texture" as string]: `url("${visuals.featureVisual}")` } : {}),
    ...(visuals.decisionBackground ? { ["--ps-closing-light" as string]: `url("${visuals.decisionBackground}")` } : {}),
  };
  return (
    <PresellThemeRoot campaign={campaign} creative={creative} sourceVisual={sourceVisual}>
      <article
        className="relative ps-article"
        data-premium="v2"
        data-motif={art.motif}
        data-art-director={art.version}
        data-hero-archetype={artPlanFor(art, "hero")?.layoutArchetype}
        data-asset-system={VISUAL_ASSET_SYSTEM_VERSION}
        data-asset-plan={assetPlans.map((item) => `${item.section}:${item.assetRole}`).join(" ")}
        data-creative-version={creative.version}
        data-hero-atmosphere={visuals.heroAtmosphere ? "1" : undefined}
        data-feature-texture={visuals.featureVisual ? "1" : undefined}
        data-closing-light={visuals.decisionBackground ? "1" : undefined}
        style={atmosphere}
      >
        {renderPixel && campaign.headScript ? (
          <Script id="presell-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: campaign.headScript }} />
        ) : null}

        <SectionNav productLabel={page.hero.headline} links={navLinks} cta={cta("header", navCta, "compact")} />
        <HeroBlock
          page={page}
          plan={plan}
          campaign={campaign}
          creative={creative}
          cta={cta("hero", heroCta, "compact")}
          valueLine={premium.hero.valueLine}
        />

        {!page.sections.some((section) => section.id === "overview" && section.visible) ? (
          <OverviewVisualBridge art={artPlanFor(art, "overview-bridge")} />
        ) : null}

        {creative.scenes.map((scene) => {
          if (scene.kind === "CTA_TRANSITION_SCENE") return null;
          if (scene.kind === "TRUST_DISCLOSURE_SCENE") {
            return (
              <div key={scene.id}>
                <OfferComparison
                  offers={offers}
                  art={artPlanFor(art, "offer")}
                  plans={content?.pricing}
                  shippingOverride={content?.shipping}
                  title={content?.pricingTitle}
                  renderCta={() => cta("final", outboundCta(href, trackClicks), undefined, content?.pricingCta || closingLabel)}
                />
                <ClosingProductScene
                  image={page.hero.image.src ? page.hero.image : undefined}
                  cta={cta("final", finalCta)}
                  name={page.hero.headline}
                  line={premium.hero.valueLine}
                  art={artPlanFor(art, "closing")}
                />
                <CreativeScene scene={scene} page={page} image={page.hero.image} art={artPlanFor(art, scene.sectionIds[0] || "")} ingredientImages={ingredientImages} />
              </div>
            );
          }
          return (
            <CreativeScene
              key={scene.id}
              scene={scene}
              page={page}
              image={page.hero.image}
              art={artPlanFor(art, scene.sectionIds[0] || "")}
              ingredientImages={ingredientImages}
            />
          );
        })}

        {content?.footer || content?.manufacturer || content?.returns || content?.warnings ? (
          <section className="ps-shell">
            {content.returns ? <p>{content.returns}</p> : null}
            {content.warnings ? <p>{content.warnings}</p> : null}
            {content.manufacturer ? <p>{content.manufacturer}</p> : null}
            {content.footer ? <p>{content.footer}</p> : null}
          </section>
        ) : null}

        {plan.ctaStrategy.stickyMobile ? (
          <StickyCtaBar
            href={stickyCta.href}
            label={ctaLabel}
            campaignId={campaign.id}
            trackClicks={trackClicks}
            clickId={stickyCta.clickId}
            compact={creative.stickyCta.compact}
            requireScrollIntentPx={creative.stickyCta.requireScrollIntentPx}
            collisionPaddingPx={creative.stickyCta.collisionPaddingPx}
            disableAffiliateNavigation={disableAffiliateNavigation}
          />
        ) : null}
      </article>
    </PresellThemeRoot>
  );
}

function createFallbackPlan(page: PresellPage): DesignPlan {
  return createDesignPlan({ page, theme: "PREMIUM", productAssetStatus: "NEEDS_ASSET" });
}

export function campaignHasStructuredPage(campaign: Campaign): boolean {
  return Boolean(parsePresellPage(campaign.pageComposition));
}

/** The production presentation renders its own site footer (legal links, disclosure page, site name). */
export function campaignRendersSiteFooter(campaign: Campaign): boolean {
  return campaignHasStructuredPage(campaign) && campaign.productionPresentation === PRODUCTION_PRESENTATION_ID;
}
