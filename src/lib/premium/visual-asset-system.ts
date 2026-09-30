/**
 * Classifies visuals the page already has.
 * A loose URL is not an association. Decorative art is never evidence.
 */

export const VISUAL_ASSET_SYSTEM_VERSION = "visual-asset-system-v1";

export type AssetClass =
  | "AUTHORITATIVE_PRODUCT"
  | "EVIDENCE_ASSOCIATED"
  | "DECORATIVE_GENERATED"
  | "PRESENTATIONAL_ICON"
  | "REJECTED";

export type AssetAssociation = "product-identity" | "same-card" | "alt-text" | "figure-caption" | "structured" | "url-only" | "none";
export type EmbeddedClaimState = "clear" | "unsupported" | "unknown";

const EMBEDDED_UNSUPPORTED =
  /\b(best value|most popular|best seller|doctor recommended|clinically proven|fda approved|certified|testimonial|quality approved|secure checkout|natural ingredients)\b|\d(?:\.\d)?\s*\/\s*5/i;

export type AssetCandidate = {
  id: string;
  url?: string;
  association: AssetAssociation;
  subject: "product" | "offer" | "ingredient" | "section" | "unknown";
  subjectKey?: string;
  /** Visible text already read from the asset. Null means it was not inspected. */
  embeddedText: string | null;
  unitsDepicted: number | null;
};

export type ClassifiedAsset = {
  id: string;
  assetClass: AssetClass;
  subject: AssetCandidate["subject"];
  subjectKey?: string;
  url?: string;
  quantityUse: "single-unit" | "omit";
  factualAuthority: "SOURCE" | "NONE";
  reason: string;
};

export type SectionAssetPlan = {
  section: string;
  assetRole: string;
  render: "source" | "icon" | "css" | "omit";
  factualAuthority: "SOURCE" | "NONE";
};

export type PlannedDecorativeAsset = {
  assetType: "DECORATIVE_GENERATED";
  section: string;
  purpose: string;
  provider: "unspecified";
  model: "unspecified";
  promptVersion: typeof VISUAL_ASSET_SYSTEM_VERSION;
  prompt: string;
  factualAuthority: "NONE";
};

const LINKED: AssetAssociation[] = ["product-identity", "same-card", "alt-text", "figure-caption", "structured"];

export function inspectEmbeddedText(text: string | null): EmbeddedClaimState {
  if (text == null) return "unknown";
  if (EMBEDDED_UNSUPPORTED.test(text)) return "unsupported";
  return "clear";
}

export function classifyVisualAsset(candidate: AssetCandidate): ClassifiedAsset {
  const embedded = inspectEmbeddedText(candidate.embeddedText);
  const linked = LINKED.includes(candidate.association);
  const base = {
    id: candidate.id,
    subject: candidate.subject,
    subjectKey: candidate.subjectKey,
    url: candidate.url,
    quantityUse: "omit" as const,
    factualAuthority: "NONE" as const,
  };
  if (!candidate.url || !linked || candidate.association === "url-only") {
    return { ...base, assetClass: "REJECTED", reason: "no explicit association" };
  }
  if (embedded === "unsupported") {
    return { ...base, assetClass: "REJECTED", reason: "embedded text is not an authorized claim" };
  }
  if (candidate.subject === "offer" && embedded !== "clear") {
    return { ...base, assetClass: "REJECTED", reason: "offer image text was not inspected" };
  }
  if (candidate.subject === "ingredient" && embedded !== "clear") {
    return { ...base, assetClass: "REJECTED", reason: "ingredient image text was not inspected" };
  }
  const single = candidate.unitsDepicted === 1;
  if (candidate.subject === "product" && candidate.association === "product-identity") {
    return {
      ...base,
      assetClass: "AUTHORITATIVE_PRODUCT",
      quantityUse: single ? "single-unit" : "omit",
      factualAuthority: "SOURCE",
      reason: single ? "identity asset depicts one unit" : "identity asset is not a proven single unit",
    };
  }
  if (candidate.subject === "offer" || candidate.subject === "ingredient") {
    return {
      ...base,
      assetClass: "EVIDENCE_ASSOCIATED",
      quantityUse: candidate.subject === "offer" && single ? "single-unit" : "omit",
      factualAuthority: "SOURCE",
      reason: "explicit association and inspected text",
    };
  }
  return { ...base, assetClass: "REJECTED", reason: "subject is not tied to a fact" };
}

export function discoverVisualAssets(input: {
  packshot?: { url: string };
  offers?: ReadonlyArray<{ name: string; imageUrl?: string; embeddedText?: string | null; unitsDepicted?: number | null }>;
  ingredients?: ReadonlyArray<{ name: string; imageUrl?: string; embeddedText?: string | null }>;
}): ClassifiedAsset[] {
  const found: ClassifiedAsset[] = [];
  if (input.packshot?.url) {
    found.push(
      classifyVisualAsset({
        id: "packshot",
        url: input.packshot.url,
        association: "product-identity",
        subject: "product",
        embeddedText: null,
        unitsDepicted: null,
      }),
    );
  }
  for (const offer of input.offers ?? []) {
    if (!offer.imageUrl) continue;
    found.push(
      classifyVisualAsset({
        id: `offer:${offer.name}`,
        url: offer.imageUrl,
        association: "same-card",
        subject: "offer",
        subjectKey: offer.name,
        embeddedText: offer.embeddedText ?? null,
        unitsDepicted: offer.unitsDepicted ?? null,
      }),
    );
  }
  for (const ingredient of input.ingredients ?? []) {
    if (!ingredient.imageUrl) continue;
    found.push(
      classifyVisualAsset({
        id: `ingredient:${ingredient.name}`,
        url: ingredient.imageUrl,
        association: "structured",
        subject: "ingredient",
        subjectKey: ingredient.name,
        embeddedText: ingredient.embeddedText ?? null,
        unitsDepicted: null,
      }),
    );
  }
  return found;
}

export function planSectionAssets(input: {
  sections: ReadonlyArray<{ id: string; itemCount: number }>;
  assets: readonly ClassifiedAsset[];
}): SectionAssetPlan[] {
  const packshot = input.assets.find((asset) => asset.assetClass === "AUTHORITATIVE_PRODUCT");
  const safeOffer = input.assets.some((asset) => asset.subject === "offer" && asset.assetClass === "EVIDENCE_ASSOCIATED");
  const ingredientImages = input.assets.filter((asset) => asset.subject === "ingredient" && asset.assetClass === "EVIDENCE_ASSOCIATED").length;
  return input.sections.map((section) => {
    if (section.id === "hero" || section.id === "closing") {
      return {
        section: section.id,
        assetRole: packshot ? "AUTHORITATIVE_PRODUCT" : "CSS_DECORATIVE",
        render: packshot ? "source" : "css",
        factualAuthority: packshot ? "SOURCE" : "NONE",
      };
    }
    if (section.id === "ingredients") {
      return {
        section: section.id,
        assetRole: ingredientImages > 0 ? "EVIDENCE_ASSOCIATED" : "PRESENTATIONAL_ICON",
        render: ingredientImages > 0 ? "source" : "icon",
        factualAuthority: ingredientImages > 0 ? "SOURCE" : "NONE",
      };
    }
    if (section.id === "features") {
      return { section: section.id, assetRole: "PRESENTATIONAL_ICON", render: "icon", factualAuthority: "NONE" };
    }
    if (section.id === "usage") {
      return { section: section.id, assetRole: "PRESENTATIONAL_ICON", render: "icon", factualAuthority: "NONE" };
    }
    if (section.id === "guarantee" || section.id === "overview-bridge") {
      return { section: section.id, assetRole: "CSS_DECORATIVE", render: "css", factualAuthority: "NONE" };
    }
    if (section.id === "offer") {
      return {
        section: section.id,
        assetRole: safeOffer ? "EVIDENCE_ASSOCIATED" : "NONE",
        render: safeOffer ? "source" : "omit",
        factualAuthority: safeOffer ? "SOURCE" : "NONE",
      };
    }
    return { section: section.id, assetRole: "NONE", render: "omit", factualAuthority: "NONE" };
  });
}

const NAV_SECTION_IDS = ["ingredients", "features", "faq"] as const;

/** Links only for sections that are actually visible. Labels are the section titles. */
export function sectionNavLinks(sections: ReadonlyArray<{ id: string; title: string; visible: boolean }>): Array<{ id: string; label: string }> {
  return NAV_SECTION_IDS.flatMap((id) => {
    const section = sections.find((item) => item.id === id && item.visible && item.title.trim());
    if (!section) return [];
    return [{ id, label: section.title.trim() }];
  });
}

/** Planned only. Nothing here is requested from a provider. */
export function plannedDecorativeAssets(): PlannedDecorativeAsset[] {
  const prompt =
    "Abstract light, soft geometry, and a quiet gradient. No product, no packaging, no people, no ingredients, no laboratory, no certificate, no text.";
  return [
    { assetType: "DECORATIVE_GENERATED", section: "hero", purpose: "atmosphere behind the product stage", provider: "unspecified", model: "unspecified", promptVersion: VISUAL_ASSET_SYSTEM_VERSION, prompt, factualAuthority: "NONE" },
    { assetType: "DECORATIVE_GENERATED", section: "features", purpose: "texture behind the feature band", provider: "unspecified", model: "unspecified", promptVersion: VISUAL_ASSET_SYSTEM_VERSION, prompt, factualAuthority: "NONE" },
    { assetType: "DECORATIVE_GENERATED", section: "closing", purpose: "light behind the closing product", provider: "unspecified", model: "unspecified", promptVersion: VISUAL_ASSET_SYSTEM_VERSION, prompt, factualAuthority: "NONE" },
  ];
}
