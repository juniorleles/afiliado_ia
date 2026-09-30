import { isUnusableProductAspect } from "@/lib/presell-display";
import type { AssetCandidate, AssetRole, ClassificationMethod } from "@/lib/assets/types";

export type ClassifyInput = {
  url: string;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  tagHtml?: string;
  className?: string;
  parentHint?: string;
  source?: AssetCandidate["source"];
};

export type ClassifyResult = {
  role: AssetRole | "UNCERTAIN";
  packshotScore: number;
  rejected: boolean;
  rejectReason: string | null;
  classificationMethod: ClassificationMethod;
};

/** Filename, alt, title, and the image tag itself — not surrounding page chrome. */
function visualHaystack(input: ClassifyInput): string {
  return [input.url, input.alt, input.title, input.tagHtml, input.className].filter(Boolean).join(" ").toLowerCase();
}

function contextHaystack(input: ClassifyInput): string {
  return (input.parentHint || "").toLowerCase();
}

export function looksLikeTrackingPixel(src: string): boolean {
  return /1x1|pixel\.gif|facebook\.com\/tr|google-analytics|doubleclick|tracking[-_]?pixel|spacer\.gif/i.test(src);
}

export function looksLikePromoCta(text: string): boolean {
  return /order[-_ ]?now|buy[-_ ]?now|add[-_ ]?to[-_ ]?cart|click[-_ ]?here|countdown|hurry|limited[-_ ]?offer/i.test(
    text,
  );
}

export function looksLikeLogo(text: string): boolean {
  return /logo|wordmark|brandmark|favicon|sprite/i.test(text);
}

export function looksLikeIconOrBadge(text: string): boolean {
  return /\bicon\b|badge|payment|visa|mastercard|paypal|amex|ssl|lock[-_]?icon|social|facebook|instagram|twitter|youtube|tiktok|pinterest|credit[-_ ]?cards?|checkmark|star[-_ ]?marker|\bmarker\b|\bbullet\b|\bglyph\b|\bchevron\b/i.test(
    text,
  );
}

/** Raster file whose name identifies a product or package, not a UI glyph. */
export function looksLikePackageRaster(url: string): boolean {
  const file = (url.split("?")[0]?.split("/").pop() || "").toLowerCase();
  if (!/\.(?:png|jpe?g|webp)$/.test(file)) return false;
  if (looksLikeIconOrBadge(file) || looksLikeLogo(file)) return false;
  return /\b(?:product|package|packshot|bottle|jar|tub|pouch|carton)\b/.test(file);
}

export function looksLikeNavOrFooter(text: string): boolean {
  return /\bnav\b|navbar|header[-_ ]logo|footer|breadcrumb|menu-item|site-header/i.test(text);
}

export function looksLikeAvatar(text: string): boolean {
  return /avatar|testimonial|reviewer|headshot|portrait|customer[-_ ]photo|\bdoctor\b|physician/i.test(text);
}

export function looksLikeIngredientVisual(text: string): boolean {
  return /\bingredient|\bbotanical|\bherb\b|\bextract\b|\binulin\b|blend[-_ ](?:visual|img|image)?/i.test(text);
}

export function looksLikeLifestyle(text: string): boolean {
  return /lifestyle|in[-_ ]use|\bperson\b|kitchen|bathroom|\bdesk\b|\bscene\b/i.test(text);
}

/** Do not match Bootstrap `container`, CSS `box`, or generic `pack` substrings. */
export function looksLikePackshot(text: string): boolean {
  return /\bpackshot\b|\bpackaging\b|\bbottle\b|\bjar\b|\btub\b|\bpouch\b|\bcanister\b|\bsupplement\b|product[-_ ]?(?:image|photo|shot|pack|bottle|visual)/i.test(
    text,
  );
}

export function classifyAssetCandidate(input: ClassifyInput): ClassifyResult {
  const visual = visualHaystack(input);
  const context = contextHaystack(input);
  const width = input.width || 0;
  const height = input.height || 0;
  const method: ClassificationMethod = "DETERMINISTIC";

  if (looksLikeTrackingPixel(input.url) || /tracking[-_]?pixel/i.test(visual)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "tracking-pixel", classificationMethod: method };
  }
  if ((width > 0 && width < 80) || (height > 0 && height < 80)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "too-small", classificationMethod: method };
  }
  if (looksLikePromoCta(visual) || /(?:^|[^\w])cta(?:[^\w]|$)/i.test(`${input.url} ${input.alt || ""} ${input.className || ""}`)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "promo-banner", classificationMethod: method };
  }
  if (/\bbutton\b/i.test(`${input.className || ""} ${input.alt || ""} ${input.url}`)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "promo-banner", classificationMethod: method };
  }
  if (looksLikeIconOrBadge(visual) && !looksLikePackshot(visual)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "icon-or-badge", classificationMethod: method };
  }
  if (looksLikeAvatar(visual)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "testimonial-avatar", classificationMethod: method };
  }
  if (looksLikeNavOrFooter(context) && !looksLikePackshot(visual)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "nav-or-footer", classificationMethod: method };
  }
  if (looksLikeLogo(visual) && !looksLikePackshot(visual)) {
    return { role: "BRAND_LOGO", packshotScore: 0, rejected: true, rejectReason: "logo", classificationMethod: method };
  }
  if (width > 0 && height > 0 && isUnusableProductAspect(width, height)) {
    return { role: "UNUSABLE", packshotScore: 0, rejected: true, rejectReason: "extreme-aspect", classificationMethod: method };
  }

  if (looksLikeIngredientVisual(visual) && !looksLikePackshot(visual)) {
    return {
      role: "INGREDIENT_VISUAL",
      packshotScore: 8,
      rejected: false,
      rejectReason: null,
      classificationMethod: method,
    };
  }

  const packageRaster = looksLikePackageRaster(input.url);
  let score = 16;
  if (looksLikePackshot(visual) || packageRaster) score += 42;
  if (input.source === "og") score += 18;
  if (input.source === "jsonld") score += 22;
  if (input.source === "twitter") score += 10;
  if (width && height) {
    score += Math.min(28, Math.round(Math.min(width, height) / 22));
    const ratio = width / height;
    if (ratio >= 0.62 && ratio <= 1.45) score += 18;
  }
  if (looksLikeLifestyle(visual)) score += 8;

  if ((looksLikePackshot(visual) || packageRaster) && score >= 40) {
    const composed = looksLikeIngredientVisual(visual) || looksLikeLifestyle(visual);
    return {
      role: composed ? "PRODUCT_LIFESTYLE" : "PRODUCT_PACKSHOT",
      packshotScore: score,
      rejected: false,
      rejectReason: null,
      classificationMethod: method,
    };
  }
  if (looksLikeLifestyle(visual) && score >= 28) {
    return { role: "PRODUCT_LIFESTYLE", packshotScore: score, rejected: false, rejectReason: null, classificationMethod: method };
  }
  if (/deco|pattern|texture|abstract/i.test(visual) && !looksLikePackshot(visual)) {
    return { role: "DECORATIVE_SOURCE", packshotScore: 4, rejected: false, rejectReason: null, classificationMethod: method };
  }

  return { role: "UNCERTAIN", packshotScore: score, rejected: false, rejectReason: null, classificationMethod: method };
}

export function isViablePackshotRole(role: AssetRole | "UNCERTAIN"): boolean {
  return role === "PRODUCT_PACKSHOT" || role === "PRODUCT_LIFESTYLE" || role === "UNCERTAIN";
}

export function pickBestPackshot(candidates: AssetCandidate[]): AssetCandidate | null {
  const viable = candidates
    .filter((item) => !item.rejected && isViablePackshotRole(item.role))
    .sort((a, b) => b.packshotScore - a.packshotScore);
  const packshots = viable.filter((item) => item.role === "PRODUCT_PACKSHOT");
  if (packshots[0] && packshots[0].packshotScore >= 40) return packshots[0];
  const lifestyle = viable.filter((item) => item.role === "PRODUCT_LIFESTYLE");
  if (lifestyle[0] && lifestyle[0].packshotScore >= 45 && !packshots[0]) return lifestyle[0];
  return viable.find((item) => item.packshotScore >= 40) ?? null;
}
