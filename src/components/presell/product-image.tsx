"use client";

import { useEffect, useState } from "react";
import type { PresellImage } from "@/lib/presell-page";
import { isUnusableProductAspect } from "@/lib/presell-display";

function Placeholder({ alt, frame }: { alt: string; frame: string }) {
  const name = alt.replace(/ product (image|visual placeholder)$/i, "").trim() || "Product";
  return (
    <div
      className={`flex ${frame} flex-col items-center justify-center rounded-2xl border border-zinc-700 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 text-center shadow-inner`}
      role="img"
      aria-label={alt}
    >
      <span className="px-6 text-lg font-semibold tracking-wide text-zinc-200">{name}</span>
      <span className="mt-2 px-6 text-xs leading-relaxed text-zinc-500">
        Product image not available
      </span>
    </div>
  );
}

export function ProductImage({
  image,
  size = "default",
}: {
  image: PresellImage;
  size?: "default" | "hero";
}) {
  const [unusable, setUnusable] = useState(false);
  const frame =
    size === "hero"
      ? "aspect-[4/5] w-full max-w-md min-h-[16rem] sm:aspect-square sm:min-h-[18rem]"
      : "aspect-square w-full max-w-sm";

  useEffect(() => {
    if (!image.src || image.provenance === "PLACEHOLDER" || image.provenance === "NOT_FOUND") return;
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (!cancelled && isUnusableProductAspect(probe.naturalWidth, probe.naturalHeight)) {
        setUnusable(true);
      }
    };
    probe.src = image.src;
    return () => {
      cancelled = true;
    };
  }, [image.src, image.provenance]);

  if (unusable || image.provenance === "PLACEHOLDER" || image.provenance === "NOT_FOUND" || !image.src) {
    return <Placeholder alt={image.alt} frame={frame} />;
  }

  return (
    <figure className={`${frame} overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-lg`}>
      {/* Explicit dimensions avoid layout shift. Local copies are served from /media/product. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt={image.alt}
        width={640}
        height={800}
        className="h-full w-full object-contain"
      />
    </figure>
  );
}
