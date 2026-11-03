import React from "react";
import { DsContainer, DsKicker, DsSection } from "@/components/design-system/primitives";
import { PremiumOfferImage } from "@/components/presell/premium-offer-image";
import {
  displayKicker,
  type ApprovedOffer,
} from "@/lib/presell-quality/approved-offers";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function OfferBuyControl({ offer }: { offer: ApprovedOffer }) {
  if (offer.commercialNavigationEnabled && offer.affiliateDestination) {
    return (
      <a
        className="ds-btn ds-btn--cta premium-offer-card__buy"
        href={offer.affiliateDestination}
        rel="noopener noreferrer"
        data-v4-cta="offers"
        data-v4-track="official_offer_click"
        data-offer-cta="authorized"
        data-commercial-navigation="enabled"
      >
        {offer.buyLabel}
      </a>
    );
  }
  return (
    <div className="premium-offer-card__cta">
      <button
        type="button"
        className="ds-btn ds-btn--cta premium-offer-card__buy"
        aria-disabled="true"
        data-v4-cta="preview-disabled"
        data-offer-cta="blocked"
        data-commercial-navigation="blocked"
        data-affiliate-status={offer.affiliateDestinationStatus.toLowerCase()}
      >
        {offer.buyLabel}
      </button>
      <p className="ds-caption premium-offer-card__caption">Preview only. This package destination is not authorized.</p>
    </div>
  );
}

export function PremiumOfferCards({
  offers,
  heading = "Choose a bottle count",
  kicker = "Available packages",
}: {
  offers: ApprovedOffer[];
  heading?: string;
  kicker?: string;
}) {
  if (!offers.length) return null;
  return (
    <DsSection tone="soft" className="v4-band premium-producer-offers" id="seller-stated-packages">
      <DsContainer>
        <DsKicker>{kicker}</DsKicker>
        <h2 className="ds-h2">{heading}</h2>
        <div
          className="premium-offer-cards"
          data-premium="packages"
          data-seller-stated-offers="1"
          data-offer-cards="premium"
          data-package-layout="offer-cards"
        >
          {offers.map((offer) => (
            <article
              key={offer.id}
              className={cx("premium-card", "premium-offer-card", offer.featuredReason && "premium-card--featured")}
              data-seller-package={offer.id}
              data-package-featured={offer.featuredReason ? "1" : undefined}
              data-featured-reason={offer.featuredReason ?? undefined}
              data-bottle-count={String(offer.bottleCount)}
            >
              <p className="ds-kicker premium-offer-card__kicker">{displayKicker(offer)}</p>
              <PremiumOfferImage
                src={offer.productImageSrc}
                alt={offer.productImageAlt}
                assetId={offer.productImageAssetId}
                imageRole={offer.imageRole.toLowerCase()}
                representsQuantity={offer.imageRepresentsBottleCount}
                quantityLabel={offer.quantityLabel}
              />
              <h3 className="ds-h3 premium-offer-card__title">{offer.quantityLabel}</h3>
              {offer.supplyLabel ? <p className="ds-meta premium-offer-card__supply">{offer.supplyLabel}</p> : null}
              <p className="ds-display ds-display--package">{offer.unitPriceLabel}</p>
              <p className="ds-meta">per bottle</p>
              <p className="ds-body premium-offer-card__total">Total: {offer.totalPriceLabel}</p>
              {offer.comparisonTotalLabel ? (
                <p className="ds-meta" data-offer-comparison="seller-listed">
                  Seller-listed comparison {offer.comparisonTotalLabel}
                </p>
              ) : null}
              <p className="ds-meta" data-offer-shipping="">
                {offer.shippingDescription}
              </p>
              {offer.bonuses.map((bonus) => (
                <p className="ds-body premium-offer-card__bonus" key={bonus} data-offer-bonus="">
                  {bonus}
                </p>
              ))}
              <OfferBuyControl offer={offer} />
            </article>
          ))}
        </div>
      </DsContainer>
    </DsSection>
  );
}
