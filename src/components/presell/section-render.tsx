import type { PresellImage, PresellPage, PresellSection } from "@/lib/presell-page";
import type { DesignPlan, SectionPlan, SectionVariant, StoryBand } from "@/lib/design/plan";
import { FAQAccordion } from "@/components/presell/faq-accordion";
import { ProductStage } from "@/components/presell/product-stage";

function leadAndRest<T>(items: T[], count: number, collapsed: boolean): { lead: T[]; rest: T[] } {
  if (!collapsed || items.length <= count) return { lead: items, rest: [] };
  return { lead: items.slice(0, count), rest: items.slice(count) };
}

function Details({ children }: { children: React.ReactNode }) {
  return (
    <details className="ps-small mt-4">
      <summary className="cursor-pointer font-medium text-[color:var(--ps-accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ps-accent)]">
        Read more
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function Band({ band, children }: { band: StoryBand; children: React.ReactNode }) {
  return <section className={`ps-band ps-story-${band}`}>{children}</section>;
}

export function DesignedSection({
  section,
  plan,
  band,
  pair,
  productImage,
  packshotReady,
}: {
  section: PresellSection;
  plan: SectionPlan;
  band: StoryBand;
  pair?: PresellSection | null;
  productImage?: PresellImage;
  packshotReady?: boolean;
}) {
  return (
    <Band band={band}>
      <div className="ps-shell">
        <SectionBody
          section={section}
          plan={plan}
          pair={pair}
          productImage={productImage}
          packshotReady={packshotReady}
        />
      </div>
    </Band>
  );
}

function SectionBody({
  section,
  plan,
  pair,
  productImage,
  packshotReady,
}: {
  section: PresellSection;
  plan: SectionPlan;
  pair?: PresellSection | null;
  productImage?: PresellImage;
  packshotReady?: boolean;
}) {
  const variant: SectionVariant = plan.variant;
  if (section.id === "faq" || variant === "FAQ_ACCORDION" || variant === "VISUAL_DISCLOSURE_GROUP") {
    const { lead, rest } = leadAndRest(section.faq, plan.visibleLeadCount, plan.collapsed);
    return (
      <div className="ps-disclosure">
        <p className="ps-eyebrow">Questions</p>
        <h2 className="ps-h2 mt-2">{section.title}</h2>
        <div className="mt-8">
          <FAQAccordion items={lead} />
        </div>
        {rest.length > 0 ? (
          <Details>
            <FAQAccordion items={rest} />
          </Details>
        ) : null}
      </div>
    );
  }

  if (variant === "NUMBERED_STEPS" || variant === "VISUAL_NUMBER_STEP") {
    const items = [...section.bullets, ...section.paragraphs];
    const { lead, rest } = leadAndRest(items, plan.visibleLeadCount, plan.collapsed);
    return (
      <div className="ps-number-steps">
        <p className="ps-eyebrow">How to use</p>
        <h2 className="ps-h2 mt-2">{section.title}</h2>
        <ol className="ps-step-list">
          {lead.map((item, index) => (
            <li key={item} className="ps-step">
              <span className="ps-step-num" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="ps-body-lg pt-2">{item}</p>
            </li>
          ))}
        </ol>
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

  if (
    variant === "INGREDIENT_GRID" ||
    variant === "INGREDIENT_EDITORIAL_GRID" ||
    variant === "INGREDIENT_ORBIT"
  ) {
    const cards =
      section.cards.length > 0
        ? section.cards
        : section.bullets.map((body) => ({ title: body, body: "" }));
    const { lead, rest } = leadAndRest(cards, plan.visibleLeadCount, true);
    const orbit = variant === "INGREDIENT_ORBIT" && packshotReady && productImage?.src;
    return (
      <div className={orbit ? "ps-ingredient-orbit" : "ps-ingredient-editorial"}>
        <p className="ps-eyebrow">Formulation</p>
        <h2 className="ps-h2 mt-2">{section.title}</h2>
        {orbit ? (
          <div className="ps-orbit-layout">
            <div className="ps-orbit-core">
              <ProductStage image={productImage!} scale="contain" />
            </div>
            <ol className="ps-orbit-list">
              {lead.map((card, index) => (
                <li key={card.title} className="ps-orbit-item">
                  <span className="ps-display-sm">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="ps-h3">{card.title}</p>
                    {card.body ? <p className="ps-small mt-1">{card.body}</p> : null}
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
                <p className="ps-h3 mt-3">{card.title}</p>
                {card.body ? <p className="ps-small mt-2">{card.body}</p> : null}
              </li>
            ))}
          </ol>
        )}
        {rest.length > 0 ? (
          <Details>
            <div className="grid gap-3 sm:grid-cols-2">
              {rest.map((card) => (
                <p key={card.title} className="ps-body">
                  <strong className="text-[color:var(--ps-text)]">{card.title}.</strong> {card.body}
                </p>
              ))}
            </div>
          </Details>
        ) : null}
      </div>
    );
  }

  if (variant === "FEATURE_BENTO" || variant === "PRODUCT_FACT_CANVAS" || variant === "EDITORIAL_FEATURE_SPLIT") {
    const items = section.bullets.length > 0 ? section.bullets : section.paragraphs;
    const { lead, rest } = leadAndRest(items, plan.visibleLeadCount, true);
    const [primary, ...others] = lead;
    return (
      <div className="ps-fact-canvas">
        <h2 className="ps-h2">{section.title}</h2>
        <div className="ps-fact-canvas-grid">
          {primary ? (
            <article className="ps-fact-lead">
              <p className="ps-label">At a glance</p>
              <p className="ps-body-lg mt-4 text-[color:var(--ps-text)]">{primary}</p>
            </article>
          ) : null}
          {others.map((item, index) => (
            <article key={item} className="ps-fact-side">
              <span className="ps-label">{String(index + 2).padStart(2, "0")}</span>
              <p className="ps-body mt-3">{item}</p>
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

  if (variant === "FACT_STRIP" || variant === "FACT_RIBBON") {
    const items = [...section.bullets, ...section.paragraphs].slice(0, plan.visibleLeadCount);
    return (
      <div>
        <h2 className="ps-h2">{section.title}</h2>
        <div className="ps-fact-ribbon">
          {items.map((item) => (
            <p key={item} className="ps-ribbon-item">
              {item}
            </p>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "GUARANTEE_PANEL" || variant === "WIDE_GUARANTEE_STATEMENT") {
    const text = section.paragraphs[0] || section.bullets[0] || "";
    const days = text.match(/(\d+)\s*-?\s*day/i)?.[1];
    return (
      <div className="ps-guarantee">
        <p className="ps-eyebrow ps-guarantee-kicker">Guarantee</p>
        {days ? (
          <p className="ps-guarantee-display">{days} DAYS</p>
        ) : (
          <h2 className="ps-h2 mt-4 text-[color:var(--ps-on-accent)]">{section.title}</h2>
        )}
        <p className="ps-guarantee-copy">{text}</p>
      </div>
    );
  }

  if (variant === "PROS_CONSIDERATIONS_SPLIT" || variant === "CONSIDERATION_COLUMNS") {
    const selfItems = [...section.paragraphs, ...section.bullets];
    const { lead, rest } = leadAndRest(selfItems, plan.visibleLeadCount, plan.collapsed);
    const pairItems = pair ? [...pair.paragraphs, ...pair.bullets] : [];
    return (
      <div>
        <div className={`ps-consider ${pair ? "ps-consider-split" : ""}`}>
          <div>
            <p className="ps-eyebrow">{section.id === "pros" ? "What stands out" : "What to consider"}</p>
            <h2 className="ps-h2 mt-2">{section.title}</h2>
            <ul className="mt-6 space-y-4">
              {lead.map((item) => (
                <li key={item} className="ps-body ps-consider-item">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          {pair ? (
            <div>
              <p className="ps-eyebrow">Also consider</p>
              <h2 className="ps-h2 mt-2">{pair.title}</h2>
              <ul className="mt-6 space-y-4">
                {pairItems.slice(0, plan.visibleLeadCount).map((item) => (
                  <li key={item} className="ps-body ps-consider-item">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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

  const paras = section.paragraphs;
  const { lead, rest } = leadAndRest(paras, plan.visibleLeadCount, plan.collapsed || variant === "DETAILS_ACCORDION");
  const bullets = leadAndRest(section.bullets, plan.visibleLeadCount, true);
  return (
    <div className={variant === "MAGAZINE_TEXT_BLOCK" ? "ps-magazine-block" : ""}>
      <h2 className="ps-h2">{section.title}</h2>
      <div className={`mt-6 ${variant === "EDITORIAL_QUOTE_STYLE" || variant === "MAGAZINE_TEXT_BLOCK" ? "ps-magazine-rule" : ""}`}>
        {lead.map((paragraph) => (
          <p key={paragraph} className="ps-body-lg mb-4 text-[color:var(--ps-text)]">
            {paragraph}
          </p>
        ))}
        {bullets.lead.map((item) => (
          <p key={item} className="ps-body mb-2">
            {item}
          </p>
        ))}
      </div>
      {rest.length > 0 || bullets.rest.length > 0 ? (
        <Details>
          {rest.map((paragraph) => (
            <p key={paragraph} className="ps-body">
              {paragraph}
            </p>
          ))}
          {bullets.rest.map((item) => (
            <p key={item} className="ps-body">
              {item}
            </p>
          ))}
        </Details>
      ) : null}
    </div>
  );
}

export function sectionPlanOf(plan: DesignPlan, id: string): SectionPlan | undefined {
  return plan.sectionPlans.find((item) => item.id === id);
}
