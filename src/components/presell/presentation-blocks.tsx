import type { AuthorizedOffer } from "@/lib/presell-presentation";
import { authorizedQuantityCount, offerAssetAssociation, presentSavings, quantityImageRepeats, shippingTone, type OfferAssetLink } from "@/lib/premium/presentation-priority";
import type { SectionArtPlan } from "@/lib/premium/section-art-director";
import { DecorativeMark } from "@/components/presell/decorative-marks";

export function IngredientCards({
  cards,
}: {
  cards: ReadonlyArray<{ title: string; body: string; imageSrc?: string }>;
}) {
  return (
    <ul className="ps-ingredient-grid">
      {cards.map((card, index) => (
        <li key={card.title} className="ps-ingredient-card">
          <span className="ps-ingredient-index" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="ps-ingredient-mark" data-ingredient-visual={card.imageSrc ? "source" : "icon"} aria-hidden="true">
            {card.imageSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.imageSrc} alt="" />
            ) : (
              <DecorativeMark role="ingredient" index={index} />
            )}
          </span>
          <div>
            <p className="ps-h3" data-ingredient-name={card.title}>
              {card.title}
            </p>
            {card.body ? <p className="ps-small ps-ingredient-detail">{card.body}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function UsageMotif() {
  return (
    <span className="ps-usage-motif" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="48" height="48" focusable="false">
        <rect x="16" y="6" width="16" height="28" rx="8" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M18 38c2 4 10 4 12 0" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M34 30c4 1 6 4 6 8" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  );
}

export function GuaranteeStatement({
  title,
  text,
  days,
}: {
  title: string;
  text: string;
  days: string | null;
}) {
  return (
    <div className="ps-guarantee" data-guarantee-panel="1">
      <div className="ps-guarantee-layout">
        {days ? (
          <div className="ps-guarantee-emblem" data-guarantee-emblem="duration" aria-hidden="true">
            <p className="ps-guarantee-display">{days}</p>
            <p className="ps-guarantee-unit">Days</p>
          </div>
        ) : null}
        <div className="ps-guarantee-copyblock">
          <p className="ps-eyebrow ps-guarantee-kicker">Guarantee</p>
          <h2 className="ps-h2 ps-guarantee-title">{title}</h2>
          <p className="ps-guarantee-copy">{text}</p>
        </div>
      </div>
    </div>
  );
}

function QuantityFan({ count, src }: { count: number; src: string }) {
  return (
    <div className="ps-qty-fan" data-qty-count={count} aria-hidden="true" style={{ ["--ps-qty" as string]: String(count) }}>
      {Array.from({ length: count }, (_, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${src}-${index}`} src={src} alt="" style={{ ["--ps-i" as string]: String(index) }} />
      ))}
    </div>
  );
}

function ShipMark() {
  return <DecorativeMark role="shipping" index={0} />;
}

function SavingsMark() {
  return <DecorativeMark role="savings" index={0} />;
}

function BonusMark() {
  return <DecorativeMark role="bonus" index={0} />;
}

export function OfferComparison({
  offers,
  renderCta,
  unitsDepicted = null,
  unitImageSrc,
  associatedBy = "none",
  embeddedUnsupportedClaim = null,
  art,
  plans,
  shippingOverride,
  title = "Pricing",
}: {
  offers: readonly AuthorizedOffer[];
  renderCta?: () => React.ReactNode;
  /** Units already visible inside one copy of `unitImageSrc`. Unknown means omit. */
  unitsDepicted?: number | null;
  unitImageSrc?: string;
  associatedBy?: OfferAssetLink;
  embeddedUnsupportedClaim?: boolean | null;
  art?: SectionArtPlan;
  plans?: ReadonlyArray<{ title: string; description: string }>;
  shippingOverride?: string;
  title?: string;
}) {
  if (offers.length === 0) return null;
  return (
    <section
      className="ps-scene ps-scene-offer"
      data-scene="OFFER_COMPARISON"
      data-section-id="offer"
      id="offer"
      data-offer-count={offers.length}
      data-archetype={art?.layoutArchetype}
      data-surface={art?.surfaceTreatment}
      data-density={art?.visualDensity}
      data-asset={art?.assetStrategy}
    >
      <div className="ps-shell">
        <h2 className="ps-h2">{title}</h2>
        <div className="ps-offer-grid" data-offer-layout="adaptive">
          {offers.map((offer, index) => {
            const quantity = authorizedQuantityCount(offer.quantity);
            const plan = plans?.[index];
            const planName = plan?.title ?? offer.name;
            const shipText = shippingOverride !== undefined ? shippingOverride : offer.shipping;
            const decision = offerAssetAssociation({
              associatedBy,
              embeddedUnsupportedClaim,
              unitsDepicted,
              authorizedQuantity: quantity,
            });
            const repeats = decision === "single-unit-repeat" ? quantityImageRepeats(quantity, 1) : null;
            const savingsText = presentSavings(offer.savings);
            const ship = shippingTone(shipText);
            return (
              <article key={`${offer.name}|${offer.price}`} className="ps-offer-card" data-offer-name={planName || offer.price}>
                {planName ? <p className="ps-offer-name">{planName}</p> : null}
                {plan?.description ? <p className="ps-offer-quantity">{plan.description}</p> : null}
                {offer.quantity ? (
                  <p className="ps-offer-quantity">
                    {/^(\d{1,2})\s+(.+)$/.test(offer.quantity.trim()) ? (
                      <>
                        <span className="ps-offer-qty-num">{offer.quantity.trim().match(/^(\d{1,2})/)?.[1]}</span>
                        <span className="ps-offer-qty-unit">{offer.quantity.trim().replace(/^\d{1,2}\s+/, "")}</span>
                      </>
                    ) : (
                      offer.quantity
                    )}
                  </p>
                ) : null}
                {repeats && unitImageSrc ? <QuantityFan count={repeats} src={unitImageSrc} /> : null}
                {decision === "package" && unitImageSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="ps-offer-package" src={unitImageSrc} alt="" />
                ) : null}
                <div className="ps-offer-price-block">
                  {offer.originalPrice ? <s className="ps-offer-original">{offer.originalPrice}</s> : null}
                  <p className="ps-offer-price">{offer.price}</p>
                  {offer.totalPrice ? <p className="ps-offer-total">{offer.totalPrice}</p> : null}
                </div>
                {savingsText || shipText || offer.bonuses ? (
                  <div className="ps-offer-callouts">
                    {savingsText ? (
                      <p className="ps-offer-savings">
                        <SavingsMark />
                        {savingsText}
                      </p>
                    ) : null}
                    {shipText ? (
                      <p className={ship === "advantage" ? "ps-offer-ship ps-offer-ship-advantage" : "ps-offer-ship"}>
                        {ship === "advantage" ? <ShipMark /> : null}
                        {shipText}
                      </p>
                    ) : null}
                    {offer.bonuses ? (
                      <p className="ps-offer-bonus">
                        <BonusMark />
                        {offer.bonuses}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {offer.popularityLabel ? <p className="ps-offer-note">{offer.popularityLabel}</p> : null}
                {renderCta ? <div className="ps-offer-cta">{renderCta()}</div> : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
