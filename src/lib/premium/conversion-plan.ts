import type { PresellPage } from "@/lib/presell-page";
import { splitSentences } from "@/lib/presell-display";
import { authorizedOffers, primaryConversionLabel, type AuthorizedOffer } from "@/lib/presell-presentation";

/**
 * Presentation plan only. It selects layout from copy and assets that
 * already exist. It does not create facts, rankings, or trust claims.
 */
export type PremiumConversionPlan = {
  version: 1;
  hero: {
    valueLine: string;
    showPackshot: boolean;
    guaranteeLine: string;
    ctaLabel: string;
  };
  packshotPlacements: Array<"hero" | "closing">;
  offers: AuthorizedOffer[];
  offerCtaLabel: string;
  sections: Array<{
    id: string;
    treatment: "ingredient-grid" | "usage-compact" | "feature-cards" | "offer-comparison" | "guarantee-emblem" | "faq" | "closing-product";
    showPackshot: boolean;
  }>;
};

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function usefulLine(value: string, headline: string): boolean {
  const text = clean(value);
  if (text.length < 40) return false;
  return text.toLowerCase() !== clean(headline).toLowerCase();
}

export function featureLines(page: PresellPage): string[] {
  const section = page.sections.find((item) => item.id === "features" && item.visible);
  if (!section) return [];
  if (section.bullets.length > 0) return section.bullets.map(clean).filter(Boolean);
  return section.paragraphs.flatMap((paragraph) => splitSentences(paragraph));
}

/** Hero line is an existing sentence. A short label that repeats the headline is skipped. */
export function heroValueLine(page: PresellPage): string {
  const headline = page.hero.headline;
  const candidates = [page.hero.summary, page.hero.subheadline, featureLines(page)[0] ?? ""];
  for (const candidate of candidates) {
    if (usefulLine(candidate, headline)) return clean(candidate);
  }
  return clean(page.hero.subheadline || page.hero.summary || "");
}

/**
 * A heading is allowed only as a verbatim clause of the same sentence.
 * The remainder keeps every other word. Nothing is added.
 */
export function splitAuthorizedLead(text: string): { lead: string | null; rest: string } {
  const body = clean(text);
  const cut = body.search(/[,;:]/);
  if (cut < 16 || cut > 90) return { lead: null, rest: body };
  const lead = body.slice(0, cut).trim();
  const rest = body.slice(cut + 1).trim();
  const separator = body[cut];
  if (!rest || lead.split(" ").length < 3) return { lead: null, rest: body };
  if (`${lead}${separator} ${rest}` !== body) return { lead: null, rest: body };
  return { lead, rest };
}

export function planPremiumConversion(input: {
  page: PresellPage;
  pricingText: string;
  guaranteeLine: string;
  packshotReady: boolean;
}): PremiumConversionPlan {
  const offers = authorizedOffers(input.pricingText);
  const ctaLabel = primaryConversionLabel(input.page.ctaLabel, offers.length > 0);
  const packshotPlacements: Array<"hero" | "closing"> = [];
  if (input.packshotReady) packshotPlacements.push("hero", "closing");
  const sections: PremiumConversionPlan["sections"] = [];
  if (input.page.sections.some((section) => section.id === "ingredients" && section.visible)) {
    sections.push({ id: "ingredients", treatment: "ingredient-grid", showPackshot: false });
  }
  if (input.page.sections.some((section) => section.id === "usage" && section.visible)) {
    sections.push({ id: "usage", treatment: "usage-compact", showPackshot: false });
  }
  if (input.page.sections.some((section) => section.id === "features" && section.visible)) {
    sections.push({ id: "features", treatment: "feature-cards", showPackshot: false });
  }
  if (input.page.sections.some((section) => section.id === "guarantee" && section.visible)) {
    sections.push({ id: "guarantee", treatment: "guarantee-emblem", showPackshot: false });
  }
  if (offers.length > 0) sections.push({ id: "offer", treatment: "offer-comparison", showPackshot: false });
  if (input.packshotReady) sections.push({ id: "closing", treatment: "closing-product", showPackshot: true });
  if (input.page.sections.some((section) => section.id === "faq" && section.visible)) {
    sections.push({ id: "faq", treatment: "faq", showPackshot: false });
  }
  return {
    version: 1,
    hero: {
      valueLine: heroValueLine(input.page),
      showPackshot: input.packshotReady,
      guaranteeLine: clean(input.guaranteeLine),
      ctaLabel,
    },
    packshotPlacements,
    offers,
    offerCtaLabel: ctaLabel,
    sections,
  };
}
