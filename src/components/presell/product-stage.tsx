"use client";

import { useState } from "react";
import type { PresellImage } from "@/lib/presell-page";
import {
  productImageFallbackWidth,
  productImageSizes,
  productImageSrcSet,
  productImageVariant,
} from "@/lib/creative/image";
import { EmptyAssetHero } from "@/components/presell/empty-asset-hero";

export function ProductStage({
  image,
  overlap = false,
  scale = "stage",
  presentation = "hero",
  priority = false,
}: {
  image: PresellImage;
  overlap?: boolean;
  scale?: "contain" | "stage";
  presentation?: "hero" | "anchor" | "edge" | "support";
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const width = productImageFallbackWidth(presentation);
  const height = Math.round(width * 0.95);
  const useOriginal = presentation === "hero";
  const src = useOriginal ? image.src : productImageVariant(image.src, width);
  const srcSet = useOriginal ? undefined : productImageSrcSet(image.src);

  if (failed) {
    return <EmptyAssetHero />;
  }

  return (
    <figure
      className={`ps-product-stage ${overlap ? "ps-product-stage-overlap" : ""} ${scale === "stage" ? "ps-product-stage-lg" : ""} ps-product-${presentation}`}
      data-product-stage="1"
      data-product-presentation={presentation}
    >
      <span className="ps-product-stage-plane" aria-hidden="true" />
      {presentation === "hero" ? <span className="ps-product-stage-ring" aria-hidden="true" /> : null}
      {/* Local copies are resized via /media/product?w=; object-contain avoids distorting packaging. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        srcSet={srcSet}
        sizes={productImageSizes(presentation)}
        alt={image.alt}
        width={width}
        height={height}
        className="ps-product-stage-img"
        decoding="async"
        loading="eager"
        fetchPriority={priority ? "high" : "auto"}
        data-product-lcp={priority ? "1" : undefined}
        onError={() => setFailed(true)}
      />
    </figure>
  );
}
