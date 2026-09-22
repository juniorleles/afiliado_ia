import type { PresellImage, PresellPage, PresellSection } from "@/lib/presell-page";
import type { ScenePlan } from "@/lib/creative/types";
import { FAQAccordion } from "@/components/presell/faq-accordion";
import { ProductStage } from "@/components/presell/product-stage";
import { SceneGeometry } from "@/components/presell/scene-geometry";
import { HEALTH_DISCLAIMER_TEXT, TRUST_EDITORIAL, isHealthDisclaimerEnabled } from "@/lib/public-site";
import { splitSentences } from "@/lib/presell-display";

function leadAndRest<T>(items: T[], count: number, collapsed: boolean): { lead: T[]; rest: T[] } {
  if (!collapsed || items.length <= count) return { lead: items, rest: [] };
  return { lead: items.slice(0, count), rest: items.slice(count) };
}

function meaningful(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

function Details({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <details className={`ps-small mt-4 ${className}`.trim()} data-read-more="1">
      <summary className="ps-read-more cursor-pointer font-medium text-[color:var(--ps-accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ps-accent)]">
        Read more
      </summary>
      <div className="mt-3 space-y-3" data-read-more-panel="1">
        {children}
      </div>
    </details>
  );
}

function sectionOf(page: PresellPage, id: string): PresellSection | undefined {
  return page.sections.find((section) => section.id === id && section.visible);
}

function Packshot({
  scene,
  image,
}: {
  scene: ScenePlan;
  image?: PresellImage;
}) {
  if (!image?.src || !scene.slot || scene.assetUse === "NONE") return null;
  const presentation =
    scene.slot.id === "heroPrimary" ? "hero" : scene.slot.id === "sectionAnchor" ? "anchor" : scene.slot.id === "edgeProduct" ? "edge" : "support";
  return (
    <ProductStage
      image={image}
      overlap={scene.slot.desktop.overlap}
      scale={scene.slot.fit}
      presentation={presentation}
      priority={scene.slot.priority === "PRIMARY" || scene.slot.id === "heroPrimary" || scene.slot.id === "sectionAnchor"}
    />
  );
}

function IngredientShowcase({
  section,
  scene,
  image,
}: {
  section: PresellSection;
  scene: ScenePlan;
  image?: PresellImage;
}) {
  const cards =
    section.cards.length > 0 ? section.cards : section.bullets.map((body) => ({ title: body, body: "" }));
  const { lead, rest } = leadAndRest(cards, scene.visibleLeadCount, scene.collapsed);
  const withAsset = Boolean(scene.slot && image?.src);
  return (
    <div className={withAsset ? "ps-ingredient-v2" : "ps-ingredient-editorial"} data-ingredient-compact="1">
      <div className="ps-ingredient-v2-head">
        <p className="ps-eyebrow">Formulation</p>
        <h2 className="ps-h2 mt-2">{section.title}</h2>
      </div>
      {withAsset ? (
        <div className="ps-ingredient-v2-grid">
          <div className="ps-ingredient-v2-asset">
            <Packshot scene={scene} image={image} />
          </div>
          <ol className="ps-orbit-list">
            {lead.map((card, index) => (
              <li key={card.title} className={`ps-orbit-item ${index === 0 ? "ps-orbit-lead" : ""}`}>
                <span className="ps-display-sm">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <p className="ps-h3" data-ingredient-name={card.title}>
                    {card.title}
                  </p>
                  {card.body ? <p className="ps-small mt-1 ps-ingredient-detail">{card.body}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <ol className="ps-ingredient-scale">
          {lead.map((card, index) => (
            <li key={card.title} className={`ps-ingredient-cell ${index === 0 ? "ps-ingredient-cell-lead" : ""}`}>
              <span className="ps-display-sm" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="ps-h3 mt-3" data-ingredient-name={card.title}>
                {card.title}
              </p>
              {card.body ? <p className="ps-small mt-2">{card.body}</p> : null}
            </li>
          ))}
        </ol>
      )}
      {rest.length > 0 ? (
        <Details>
          {rest.map((card) => (
            <p key={card.title} className="ps-body">
              <strong className="text-[color:var(--ps-text)]">{card.title}.</strong> {card.body}
            </p>
          ))}
        </Details>
      ) : null}
    </div>
  );
}

function UsageScene({
  usage,
  features,
  scene,
  image,
}: {
  usage: PresellSection;
  features?: PresellSection;
  scene: ScenePlan;
  image?: PresellImage;
}) {
  const steps = [...usage.bullets, ...usage.paragraphs];
  const facts = features ? (features.bullets.length ? features.bullets : features.paragraphs) : [];
  const { lead: factLead, rest: factRest } = leadAndRest(facts, Math.min(2, scene.visibleLeadCount), scene.collapsed);
  const compact = steps.length <= 1;
  return (
    <div className={`ps-usage-scene ${features ? "ps-usage-split" : ""}`}>
      <div className="ps-usage-main">
        <p className="ps-eyebrow">How to use</p>
        <h2 className="ps-h2 mt-2">{usage.title}</h2>
        {compact ? (
          <div className="ps-usage-card" data-usage-compact="1">
            <p className="ps-body-lg text-[color:var(--ps-text)]">{steps[0] || ""}</p>
          </div>
        ) : (
          <ol className="ps-step-list">
            {steps.map((item, index) => (
              <li key={item} className="ps-step ps-step-heroic">
                <span className="ps-step-num" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="ps-body-lg pt-2">{item}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      {features ? (
        <aside className="ps-usage-facts">
          {scene.slot && image?.src ? (
            <div
              className={`ps-usage-edge${scene.assetUse === "TRANSITION_ANCHOR" ? " ps-desktop-only-asset" : ""}`}
              data-mobile-asset={scene.assetUse === "TRANSITION_ANCHOR" ? "omit" : "on"}
            >
              <Packshot scene={scene} image={image} />
            </div>
          ) : null}
          <p className="ps-eyebrow">{features.title}</p>
          <ul className="ps-micro-facts">
            {factLead.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {factRest.length > 0 ? (
            <Details>
              {factRest.map((item) => (
                <p key={item} className="ps-body">
                  {item}
                </p>
              ))}
            </Details>
          ) : null}
        </aside>
      ) : scene.slot && image?.src ? (
        <div
          className={`ps-usage-edge${scene.assetUse === "TRANSITION_ANCHOR" ? " ps-desktop-only-asset" : ""}`}
          data-mobile-asset={scene.assetUse === "TRANSITION_ANCHOR" ? "omit" : "on"}
        >
          <Packshot scene={scene} image={image} />
        </div>
      ) : null}
    </div>
  );
}

function featureUnits(section: PresellSection): string[] {
  if (section.bullets.length > 0) return meaningful(section.bullets);
  return section.paragraphs.flatMap((paragraph) => splitSentences(paragraph));
}

function CharacteristicsScene({ section, scene }: { section: PresellSection; scene: ScenePlan }) {
  const items = featureUnits(section);
  const { lead, rest } = leadAndRest(items, Math.max(scene.visibleLeadCount, items.length), false);
  return (
    <div className="ps-fact-canvas ps-feature-system">
      <h2 className="ps-h2">{section.title}</h2>
      <div className="ps-feature-grid ps-fact-canvas-grid" data-feature-grid="2x2">
        {lead.map((item, index) => (
          <article
            key={item}
            className={`ps-feature-module ps-feature-module-${index + 1} ${index === 0 ? "ps-fact-lead" : "ps-fact-side"}`}
          >
            <span className="ps-feature-num" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="ps-feature-rule" aria-hidden="true" />
            <p className="ps-feature-copy">{item}</p>
          </article>
        ))}
      </div>
      {rest.length > 0 ? (
        <Details>
          {rest.map((item) => (
            <p key={item} className="ps-body">
              {item}
            </p>
          ))}
        </Details>
      ) : null}
    </div>
  );
}

export function OverviewVisualBridge() {
  return (
    <section
      className="ps-scene ps-scene-overview-bridge ps-rhythm-quiet ps-weight-supporting"
      data-scene="OVERVIEW_VISUAL_BRIDGE"
      data-overview-bridge="1"
      data-section-id="overview-bridge"
      data-narrative="ORIENT"
    >
      <div className="ps-shell">
        <div className="ps-overview-transition">
          <p className="ps-eyebrow">Overview</p>
          <span className="ps-overview-rule" aria-hidden="true" />
          <span className="ps-overview-mark" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

export function ClosingProductScene({
  image,
  cta,
}: {
  image?: PresellImage;
  cta: React.ReactNode;
}) {
  return (
    <section
      className="ps-scene ps-scene-closing-product ps-rhythm-visual ps-weight-primary"
      data-scene="CLOSING_PRODUCT_SCENE"
      data-closing-scene="1"
      data-section-id="closing"
      data-narrative="ACT"
    >
      <SceneGeometry variant="arch" />
      <div className="ps-shell">
        <div className="ps-closing-scene">
          {image?.src ? (
            <div className="ps-closing-visual">
              <ProductStage image={image} presentation="anchor" scale="contain" />
            </div>
          ) : (
            <div className="ps-closing-geo" aria-hidden="true" />
          )}
          <div className="ps-closing-cta">{cta}</div>
        </div>
      </div>
    </section>
  );
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return (match ? match[0] : text).trim();
}

function EditorialScene({
  primary,
  secondary,
  scene,
}: {
  primary: PresellSection;
  secondary?: PresellSection;
  scene: ScenePlan;
}) {
  const cautionCards = primary.cards.filter((card) => /^caution$/i.test(card.title) && card.body.trim());
  const primaryItems = [...primary.paragraphs, ...primary.bullets];
  const { lead, rest } = leadAndRest(primaryItems, scene.visibleLeadCount, scene.collapsed);
  const firstClass = primary.id === "overview" || !scene.collapsed;
  const source = lead[0] || "";
  const pull = !firstClass && source ? firstSentence(source) : "";
  const remainder = source && pull && source.trim() !== pull ? source.slice(pull.length).trim() : "";
  const extraLead = firstClass ? [] : lead.slice(1);
  const hidden = meaningful([...(remainder ? [remainder] : []), ...rest]);
  const secondaryItems = secondary ? [...secondary.paragraphs, ...secondary.bullets] : [];
  const secondaryHidden = meaningful(secondaryItems);
  const overviewSolo = primary.id === "overview" && secondaryHidden.length === 0;

  return (
    <div
      className={`ps-editorial-scene${overviewSolo ? " ps-editorial-scene-solo" : ""}`}
      data-section={primary.id}
    >
      <div className="ps-editorial-main">
        <p className="ps-eyebrow">
          {primary.id === "considerations" ? "What to consider" : primary.id === "pros" ? "Pros" : "Overview"}
        </p>
        <h2 className="ps-h2 mt-2">{primary.title}</h2>
        {firstClass ? (
          <div
            className="ps-overview-flow"
            data-overview-flow={primary.id === "overview" ? "1" : undefined}
            data-overview-scan={primary.id === "overview" ? "1" : undefined}
          >
            {lead.map((item, index) => (
              <p
                key={item}
                className={index === 0 && primary.id === "overview" ? "ps-overview-lede" : "ps-body ps-overview-p"}
              >
                {item}
              </p>
            ))}
          </div>
        ) : null}
        {!firstClass && pull ? <p className="ps-pull-fact">{pull}</p> : null}
        {!firstClass
          ? extraLead.map((item) => (
              <p key={item} className="ps-body mt-3">
                {item}
              </p>
            ))
          : null}
        {hidden.length > 0 ? (
          <Details>
            {hidden.map((item) => (
              <p key={item} className="ps-body">
                {item}
              </p>
            ))}
          </Details>
        ) : null}
        {cautionCards.length > 0 ? (
          <aside className="ps-caution-block mt-6" data-caution-block="1">
            <p className="ps-eyebrow">Caution</p>
            {cautionCards.map((card) => (
              <p key={card.body} className="ps-body mt-2">
                {card.body}
              </p>
            ))}
          </aside>
        ) : null}
      </div>
      {secondary && secondaryHidden.length > 0 ? (
        <aside className="ps-side-note">
          <p className="ps-eyebrow">{secondary.title}</p>
          <p className="ps-body mt-3 ps-overview-lead">{secondaryHidden[0]}</p>
          {secondaryHidden.length > 1 ? (
            <Details>
              {secondaryHidden.slice(1).map((item) => (
                <p key={item} className="ps-body">
                  {item}
                </p>
              ))}
            </Details>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}

function GuaranteeScene({ section, daysDisplay }: { section: PresellSection; daysDisplay: string | null }) {
  const text = section.paragraphs[0] || section.bullets[0] || "";
  const days = daysDisplay;
  return (
    <div className="ps-guarantee">
      <p className="ps-eyebrow ps-guarantee-kicker">Guarantee</p>
      {days ? (
        <div className="ps-guarantee-statement">
          <p className="ps-guarantee-display">{days} DAYS</p>
          <p className="ps-guarantee-copy">{text}</p>
        </div>
      ) : (
        <>
          <h2 className="ps-h2 mt-4 text-[color:var(--ps-on-accent)]">{section.title}</h2>
          <p className="ps-guarantee-copy">{text}</p>
        </>
      )}
    </div>
  );
}

function TrustScene({ faq, cta }: { faq?: PresellSection; cta?: React.ReactNode }) {
  const items = faq?.faq ?? [];
  const { lead, rest } = leadAndRest(items, 4, true);
  return (
    <div className="ps-trust-scene" data-trust-disclosure="1">
      {faq && lead.length > 0 ? (
        <div className="ps-faq-band">
          <p className="ps-eyebrow">Questions</p>
          <h2 className="ps-h2 mt-2">{faq.title}</h2>
          <div className="mt-5">
            <FAQAccordion items={lead} />
          </div>
          {rest.length > 0 ? (
            <Details>
              <FAQAccordion items={rest} />
            </Details>
          ) : null}
        </div>
      ) : null}
      <section className="ps-trust-editorial" aria-labelledby="how-we-review-heading">
        <p className="ps-eyebrow">Transparency</p>
        <h2 id="how-we-review-heading" className="ps-h3 mt-2">
          {TRUST_EDITORIAL.heading}
        </h2>
        {TRUST_EDITORIAL.paragraphs.map((paragraph) => (
          <p key={paragraph} className="ps-small mt-2 max-w-3xl">
            {paragraph}
          </p>
        ))}
        {isHealthDisclaimerEnabled() ? <p className="ps-small mt-5">{HEALTH_DISCLAIMER_TEXT}</p> : null}
      </section>
      {cta ? <div className="ps-trust-cta">{cta}</div> : null}
    </div>
  );
}

export function CreativeScene({
  scene,
  page,
  image,
  cta,
}: {
  scene: ScenePlan;
  page: PresellPage;
  image?: PresellImage;
  cta?: React.ReactNode;
}) {
  const primary = scene.sectionIds[0] ? sectionOf(page, scene.sectionIds[0]) : undefined;
  const secondary = scene.sectionIds[1] ? sectionOf(page, scene.sectionIds[1]) : undefined;

  if (scene.kind === "HERO_PRODUCT_STAGE") return null;

  const body = (() => {
    if (scene.kind === "INGREDIENT_SHOWCASE" && primary) {
      return <IngredientShowcase section={primary} scene={scene} image={image} />;
    }
    if ((scene.kind === "NUMBERED_USAGE_SCENE" || scene.kind === "PRODUCT_FACT_SCENE") && primary) {
      return (
        <UsageScene
          usage={primary}
          features={secondary?.id === "features" ? secondary : undefined}
          scene={scene}
          image={image}
        />
      );
    }
    if (scene.kind === "PRODUCT_CHARACTERISTICS_SCENE" && primary) {
      return <CharacteristicsScene section={primary} scene={scene} />;
    }
    if (
      (scene.kind === "CONSIDERATION_EDITORIAL_SCENE" || scene.kind === "EDITORIAL_EXPLAINER") &&
      primary
    ) {
      return <EditorialScene primary={primary} secondary={secondary} scene={scene} />;
    }
    if (scene.kind === "GUARANTEE_STATEMENT_SCENE" && primary) {
      return <GuaranteeScene section={primary} daysDisplay={page.guaranteeDaysDisplay ?? null} />;
    }
    if (scene.kind === "TRUST_DISCLOSURE_SCENE") {
      return <TrustScene faq={primary} cta={cta} />;
    }
    if (scene.kind === "CTA_TRANSITION_SCENE") {
      if (!cta) return null;
      return <div className="ps-cta-bridge ps-cta-bridge-compact">{cta}</div>;
    }
    return null;
  })();

  if (!body) return null;

  return (
    <section
      className={`ps-scene ps-scene-${scene.kind.toLowerCase()} ps-rhythm-${scene.rhythm.toLowerCase()} ps-weight-${scene.weight.toLowerCase()} ps-space-${scene.whitespace === "CONTENT_GAP" || scene.whitespace === "COMPOSITION_IMBALANCE" ? "tight" : "balanced"}`}
      data-scene={scene.kind}
      data-narrative={scene.narrativeRole}
      data-weight={scene.weight}
      data-desktop={scene.desktopComposition}
      data-mobile={scene.mobileComposition}
      data-geometry={scene.geometry ?? "none"}
      data-whitespace={scene.whitespace ?? "INTENTIONAL_NEGATIVE_SPACE"}
      data-visual-moment={scene.visualMoment ? "1" : "0"}
      data-section-id={scene.sectionIds[0] || scene.id}
    >
      <SceneGeometry variant={scene.geometry ?? "none"} />
      <div className={scene.kind === "GUARANTEE_STATEMENT_SCENE" ? "" : "ps-shell"}>{body}</div>
    </section>
  );
}
