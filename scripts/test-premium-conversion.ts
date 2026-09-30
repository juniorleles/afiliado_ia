// npx tsx scripts/test-premium-conversion.ts
import type { PresellPage, PresellSection } from "../src/lib/presell-page.ts";
import { planPremiumConversion, splitAuthorizedLead } from "../src/lib/premium/conversion-plan.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function section(id: PresellSection["id"], extra: Partial<PresellSection> = {}): PresellSection {
  return {
    id,
    title: id,
    visible: true,
    paragraphs: [],
    bullets: [],
    cards: [],
    faq: [],
    ...extra,
  };
}

const feature = "Harbor Trail pairs a morning capsule with a listed mineral blend, for daily use.";
const page: PresellPage = {
  version: 1,
  template: "REVIEW",
  hero: {
    badge: "Review",
    headline: "Harbor Trail",
    subheadline: "Harbor Trail",
    summary: "",
    highlights: [],
    image: { src: "/media/product/harbor.png", alt: "Harbor Trail", provenance: "DIRECT_SOURCE" },
  },
  sections: [
    section("ingredients", { cards: [{ title: "Trail Leaf", body: "" }, { title: "Harbor Seed", body: "" }] }),
    section("usage", { paragraphs: ["Take one capsule daily with water."] }),
    section("features", { paragraphs: [feature] }),
    section("guarantee", { paragraphs: ["Return Harbor Trail within 60 days for a refund."] }),
    section("faq", { faq: [{ question: "How is it taken?", answer: "Take one capsule daily with water." }] }),
  ],
  ctaLabel: "Learn More",
  omitted: [],
  guaranteeDaysDisplay: "60",
};

const plan = planPremiumConversion({
  page,
  pricingText: "FIELD $12 per tin; CAMP $9 per tin",
  guaranteeLine: "Return Harbor Trail within 60 days for a refund.",
  packshotReady: true,
});

assert(plan.version === 1, "the planner emits a presentation plan");
assert(plan.hero.ctaLabel === "Check Current Offer", "pricing selects the current-offer hop label");
assert(plan.hero.valueLine === feature, "a headline-only subhead yields the authorized feature sentence");
assert(plan.packshotPlacements.join(",") === "hero,closing", "the packshot is limited to hero and closing");
assert(plan.sections.every((item) => item.id === "closing" || item.showPackshot === false), "supporting sections do not request a packshot");
assert(plan.offers.length === 2 && plan.offers[0]?.price === "$12 per tin", "offer rows restate authorized prices");
assert(!JSON.stringify(plan).match(/best seller|most popular|save %|testimonial|certified/i), "the plan has no unsupported trust or discount fields");

const split = splitAuthorizedLead(feature);
assert(split.lead !== null && feature.startsWith(split.lead), "a feature heading is a verbatim prefix");
assert(split.lead && `${split.lead}, ${split.rest}` === feature, "the heading and remainder reconstruct the sentence");
assert(splitAuthorizedLead("Short note.").lead === null, "a short line does not gain a heading");

const bare = planPremiumConversion({
  page: { ...page, ctaLabel: "Read the label" },
  pricingText: "",
  guaranteeLine: "",
  packshotReady: false,
});
assert(bare.hero.ctaLabel === "Read the label", "a specific stored label is kept");
assert(bare.offers.length === 0, "missing pricing does not invent an offer");
assert(bare.packshotPlacements.length === 0, "a missing packshot is not fabricated");
