import Script from "next/script";
import type { Campaign } from "@/lib/campaigns";
import { buildAffiliateHref } from "@/lib/affiliate-url";
import { copyEligibleGuaranteeSentence, parsePresellPage, type PresellPage } from "@/lib/presell-page";
import type { ProductFacts } from "@/lib/product-facts";
import { outboundCta, PresellCta } from "@/components/presell/presell-cta";
import { designPlanForCampaign, PresellThemeRoot } from "@/components/presell/presell-theme";
import { ProductStage } from "@/components/presell/product-stage";
import { EmptyAssetHero } from "@/components/presell/empty-asset-hero";
import { StickyCtaBar } from "@/components/presell/sticky-cta-bar";
import { CreativeScene, OverviewVisualBridge, ClosingProductScene } from "@/components/presell/scene-render";
import { SceneGeometry } from "@/components/presell/scene-geometry";
import type { DesignPlan, HeroVariant } from "@/lib/design/plan";
import { packshotAvailable } from "@/lib/design/plan";
import { createDesignPlan } from "@/lib/design/planner";
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

function heroCopyParts(page: PresellPage, cta: React.ReactNode, factLimit: number, riskReducer: string) {
  return {
    eyebrow: (
      <p key="eyebrow" className="ps-eyebrow ps-hero-eyebrow">
        {page.hero.badge}
      </p>
    ),
    title: (
      <h1 key="title" className="ps-hero-title">
        {page.hero.headline}
      </h1>
    ),
    summary: page.hero.subheadline ? (
      <p key="summary" className="ps-hero-summary">
        {page.hero.subheadline}
      </p>
    ) : null,
    disclosure: (
      <p key="disclosure" className="ps-hero-disclosure">
        Disclosure: I may earn a commission if you purchase through links on this page.
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
}: {
  page: PresellPage;
  plan: DesignPlan;
  campaign: Campaign;
  creative: CreativeCompositionPlan;
  cta: React.ReactNode;
}) {
  const variant: HeroVariant = plan.heroVariant;
  const ready = packshotAvailable(plan);
  const heroScene = creative.scenes.find((scene) => scene.kind === "HERO_PRODUCT_STAGE");
  const featuresVisible = page.sections.some((section) => section.id === "features" && section.visible);
  const factLimit = featuresVisible ? 0 : (heroScene?.visibleLeadCount ?? 3);
  const visual = <HeroVisual page={page} plan={plan} campaign={campaign} presentation="hero" />;
  const riskReducer = copyEligibleGuaranteeSentence(page, factsFromCampaign(campaign));
  const parts = heroCopyParts(page, plan.ctaStrategy.hero ? cta : null, factLimit, riskReducer);
  const layout =
    !ready && (variant === "PRODUCT_STAGE" || variant === "PRODUCT_CANVAS" || variant === "PRODUCT_SPLIT")
      ? "MAGAZINE_PRODUCT"
      : variant;
  const v3 = Boolean(heroScene && ready);

  if (layout === "PRODUCT_CANVAS" || layout === "CENTERED_PRODUCT") {
    return (
      <header className="ps-hero ps-hero-canvas">
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
      className={`ps-hero ${ready ? "ps-hero-stage" : "ps-hero-magazine"} ${v3 ? "ps-hero-v3" : ""}`}
      data-scene="HERO_PRODUCT_STAGE"
      data-narrative="INTRODUCE"
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
}: {
  campaign: Campaign;
  page: PresellPage;
  incomingQuery?: string;
  renderPixel?: boolean;
  trackClicks?: boolean;
  disableAffiliateNavigation?: boolean;
}) {
  const href = buildAffiliateHref(campaign.affiliateUrl, new URLSearchParams(incomingQuery));
  const heroCta = outboundCta(href, trackClicks);
  const finalCta = outboundCta(href, trackClicks);
  const stickyCta = outboundCta(href, trackClicks);
  const plan = designPlanForCampaign(campaign) ?? createFallbackPlan(page);
  const creative =
    parseCreativeCompositionPlan(campaign.creativeCompositionJson) ??
    createCreativeCompositionPlan({ page, design: plan });

  const cta = (
    position: "hero" | "middle" | "final" | "guarantee" | "sticky",
    payload: typeof heroCta,
    layout?: "block" | "compact" | "sticky",
  ) => (
    <PresellCta
      href={payload.href}
      label={page.ctaLabel}
      position={position}
      campaignId={campaign.id}
      trackClicks={trackClicks}
      clickId={payload.clickId}
      layout={layout}
      disableAffiliateNavigation={disableAffiliateNavigation}
    />
  );

  return (
    <PresellThemeRoot campaign={campaign} creative={creative}>
      <article
        className="relative ps-article"
        data-creative-version={creative.version}
        style={{ ["--ps-sticky-pad" as string]: `${creative.stickyCta.collisionPaddingPx}px` }}
      >
        {renderPixel && campaign.headScript ? (
          <Script id="presell-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: campaign.headScript }} />
        ) : null}

        <HeroBlock page={page} plan={plan} campaign={campaign} creative={creative} cta={cta("hero", heroCta, "compact")} />

        {!page.sections.some((section) => section.id === "overview" && section.visible) ? (
          <OverviewVisualBridge />
        ) : null}

        {creative.scenes.map((scene) => {
          if (scene.kind === "CTA_TRANSITION_SCENE") return null;
          if (scene.kind === "TRUST_DISCLOSURE_SCENE") {
            return (
              <div key={scene.id}>
                <ClosingProductScene
                  image={page.hero.image.src ? page.hero.image : undefined}
                  cta={cta("final", finalCta)}
                />
                <CreativeScene scene={scene} page={page} image={page.hero.image} />
              </div>
            );
          }
          return (
            <CreativeScene
              key={scene.id}
              scene={scene}
              page={page}
              image={page.hero.image}
            />
          );
        })}

        {plan.ctaStrategy.stickyMobile ? (
          <StickyCtaBar
            href={stickyCta.href}
            label={page.ctaLabel}
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
