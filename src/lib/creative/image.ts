export const PRODUCT_IMAGE_WIDTHS = [360, 540, 720, 1080] as const;
export const HERO_IMAGE_SIZES = "(max-width: 900px) 232px, min(42vw, 36rem)";
export const SUPPORT_IMAGE_SIZES = "(max-width: 900px) 11rem, 16rem";
export const EDGE_IMAGE_SIZES = "(max-width: 900px) 8rem, 11rem";

export function isLocalProductSrc(src: string): boolean {
  return src.startsWith("/media/product/");
}

export function productImageVariant(src: string, width: number, format: "webp" | "jpeg" = "webp"): string {
  if (!isLocalProductSrc(src)) return src;
  const joiner = src.includes("?") ? "&" : "?";
  return `${src}${joiner}w=${width}&fm=${format}&q=72`;
}

export function productImageSrcSet(src: string): string | undefined {
  if (!isLocalProductSrc(src)) return undefined;
  return PRODUCT_IMAGE_WIDTHS.map((width) => `${productImageVariant(src, width)} ${width}w`).join(", ");
}

export function productImageSizes(role: "hero" | "anchor" | "edge" | "support"): string {
  if (role === "hero") return HERO_IMAGE_SIZES;
  if (role === "edge" || role === "support") return EDGE_IMAGE_SIZES;
  return SUPPORT_IMAGE_SIZES;
}

export function productImageFallbackWidth(role: "hero" | "anchor" | "edge" | "support"): number {
  if (role === "hero") return 720;
  if (role === "anchor") return 540;
  return 360;
}
