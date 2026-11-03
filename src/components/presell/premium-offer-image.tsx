"use client";

import React, { useState } from "react";

export function PremiumOfferImage({
  src,
  alt,
  assetId,
  imageRole,
  representsQuantity,
  quantityLabel,
}: {
  src: string | null;
  alt: string;
  assetId: string | null;
  imageRole: string;
  representsQuantity: boolean;
  quantityLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="premium-offer-card__media premium-offer-card__media--fallback" data-offer-image="fallback">
        <p className="premium-offer-card__qty-mark">{quantityLabel}</p>
      </div>
    );
  }
  return (
    <div className="premium-offer-card__media" data-offer-image="packshot">
      <img
        src={src}
        alt={alt}
        width={640}
        height={640}
        loading="lazy"
        decoding="async"
        data-packshot-asset={assetId ?? undefined}
        data-image-role={imageRole}
        data-image-represents-quantity={representsQuantity ? "1" : "0"}
        onError={() => setFailed(true)}
      />
    </div>
  );
}
