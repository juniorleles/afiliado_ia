// npx tsx scripts/test-presell-strategy.ts
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { validateSalesCopy } from "../src/lib/page-blueprint/validate.ts";
import {
  buildPresellPlan,
  presellCtaAuthorization,
  shouldIncludeHowItWorks,
} from "../src/lib/presell-strategy/plan.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function contract(partial: {
  name: string;
  kind?: string;
  description?: string;
  features?: string[];
  components?: string[];
  usage?: string[];
  cautions?: string[];
  specs?: Array<{ name: string; value: string; unit?: string }>;
  faq?: Array<{ question: string; answer: string }>;
  packages?: Array<{ label: string; totalPrice?: string }>;
  cta?: { state: "AUTHORIZED" | "PREVIEW_ONLY" | "MISSING"; href?: string; label?: string };
}): ProductContract {
  return {
    contractVersion: 1,
    status: "RENDERABLE",
    identity: { productName: partial.name, productKind: partial.kind, language: "en", slug: "lab" },
    description: partial.description ? { text: partial.description, evidenceRefs: ["e0"] } : undefined,
    features: (partial.features ?? []).map((text) => ({ text, evidenceRefs: ["e1"], attribution: "SOURCE_STATEMENT" as const })),
    components: (partial.components ?? []).map((name) => ({ name, evidenceRefs: ["e2"] })),
    usage: (partial.usage ?? []).map((text) => ({ text, evidenceRefs: ["e3"] })),
    cautions: (partial.cautions ?? []).map((text) => ({ text, evidenceRefs: ["e4"] })),
    specifications: (partial.specs ?? []).map((item) => ({ ...item, evidenceRefs: ["e5"] })),
    faq: (partial.faq ?? []).map((item) => ({ ...item, evidenceRefs: ["e6"] })),
    offer: partial.packages ? { packages: partial.packages.map((item) => ({ ...item, evidenceRefs: ["e7"] })) } : undefined,
    cta: partial.cta ?? { state: "PREVIEW_ONLY", label: "View offer" },
    legal: { affiliateDisclosure: "Disclosure: I may earn a commission if you purchase through links on this page.", trustLinks: [] },
    seo: { title: partial.name, description: partial.name, canonical: "http://localhost/p/lab", robots: "noindex,nofollow" },
    dataStates: {},
    evidence: ["e0", "e1", "e2", "e3", "e4", "e5", "e6", "e7"].map((id) => ({
      id,
      sourceUrl: "https://lab.example/source",
      sourcePageCategory: "PRIMARY" as const,
      confidence: "DIRECT_SOURCE" as const,
      copyEligibility: "YES" as const,
      field: "lab",
    })),
    gates: { grounding: "PASS", policy: "PASS", content: "PASS", assets: "REVIEW", link: partial.cta?.state === "AUTHORIZED" ? "PASS" : "REVIEW" },
    publication: { approval: "REQUIRED", blockers: [] },
  };
}

const supplement = contract({
  name: "Novalis Core",
  kind: "dietary supplement",
  features: ["vegetable capsule shell"],
  components: ["Cranberry Extract", "Lactobacillus Acidophilus"],
  usage: ["Take one capsule every morning with water."],
  faq: [{ question: "How do I use Novalis Core?", answer: "Take one capsule every morning with water." }],
  cautions: ["Keep out of reach of children."],
});

const beauty = contract({
  name: "Pellucid Balm",
  kind: "tinted lip balm",
  description: "A tinted lip balm in a twist-up tube.",
  features: ["Fragrance-free formula"],
  components: ["Shea butter", "Beeswax"],
  usage: ["Apply to lips as needed."],
  specs: [{ name: "Net weight", value: "4.5", unit: "g" }],
});

const electronics = contract({
  name: "Quillon X2",
  kind: "wireless earbuds",
  description: "True wireless earbuds with a charging case.",
  features: ["Water-resistant housing", "Touch controls"],
  components: ["Earbuds (one pair)", "Charging case"],
  usage: ["Charge the case with the included USB-C cable."],
  specs: [
    { name: "Battery life", value: "8", unit: "hours" },
    { name: "Bluetooth version", value: "5.3" },
  ],
  faq: [{ question: "What is in the box?", answer: "Earbuds, a charging case, and a USB-C cable." }],
  packages: [{ label: "1 pair", totalPrice: "$59" }],
  cta: { state: "AUTHORIZED", href: "https://shop.quillon.example/x2", label: "View Official Offer" },
});

const thin = contract({ name: "Alder Clip", kind: "bag clip" });

const supplementPlan = buildPresellPlan(supplement);
assert(supplementPlan.category === "SUPPLEMENT", "supplement category");
assert(supplementPlan.selected.includes("HERO"), "supplement keeps hero");
assert(supplementPlan.selected.includes("INGREDIENTS_OR_SPECIFICATIONS"), "supplement selects composition");
assert(supplementPlan.selected.includes("PRODUCT_CONSIDERATIONS"), "supplement selects cautions");
assert(supplementPlan.selected.includes("FAQ"), "supplement selects FAQ");
assert(!supplementPlan.selected.includes("HOW_IT_WORKS"), "duplicate usage/FAQ omits how-it-works");
assert(!supplementPlan.selected.includes("OFFICIAL_OFFER_HANDOFF"), "supplement without hop omits handoff");
assert(supplementPlan.cta.status === "PREVIEW_ONLY", "supplement CTA stays preview-only");
assert(supplementPlan.independentReviewClaim === false, "no independent-review claim");

const beautyPlan = buildPresellPlan(beauty);
assert(beautyPlan.category === "BEAUTY", "beauty category");
assert(beautyPlan.selected.includes("PRODUCT_OVERVIEW"), "beauty selects overview");
assert(beautyPlan.selected.includes("KEY_DIFFERENTIATORS"), "beauty selects characteristics");
assert(beautyPlan.selected.includes("HOW_IT_WORKS"), "beauty selects how to apply when usage is distinct");
assert(beautyPlan.selected.includes("INGREDIENTS_OR_SPECIFICATIONS"), "beauty selects composition");
assert(!beautyPlan.selected.includes("FAQ"), "beauty omits empty FAQ");

const electroPlan = buildPresellPlan(electronics);
assert(electroPlan.category === "ELECTRONICS", "electronics category");
assert(electroPlan.selected.includes("HOW_IT_WORKS"), "electronics selects how it works when usage is distinct");
assert(electroPlan.selected.includes("INGREDIENTS_OR_SPECIFICATIONS"), "electronics selects specifications");
assert(electroPlan.selected.includes("OFFICIAL_OFFER_HANDOFF"), "electronics selects official handoff");
assert(electroPlan.cta.status === "AUTHORIZED", "electronics CTA is authorized");
assert(electroPlan.cta.label === "View Official Offer", "handoff uses an official-offer label");

const identityOnly = contract({
  name: "Novalis Core",
  kind: "dietary supplement",
  features: ["dietary supplement"],
  components: ["Cranberry Extract"],
});
assert(!buildPresellPlan(identityOnly).selected.includes("KEY_DIFFERENTIATORS"), "feature that only repeats product kind is not a differentiator");

const thinPlan = buildPresellPlan(thin);
assert(thinPlan.selected.join(",") === "HERO,LEGAL_DISCLOSURE", "thin product only keeps identity and legal");
assert(!thinPlan.selected.includes("PRODUCT_OVERVIEW"), "empty overview is omitted");
assert(!shouldIncludeHowItWorks(thin), "no usage means no how-it-works");

const zzzz = contract({
  name: "Novalis Core",
  kind: "dietary supplement",
  cta: { state: "AUTHORIZED", href: "https://shop.example.com/buy?hop=zzzzz", label: "Buy now" },
});
zzzz.gates.link = "PASS";
const zcta = presellCtaAuthorization(zzzz);
assert(zcta.status === "BLOCKED_PLACEHOLDER", "hop=zzzzz is not an authorized destination");
assert(buildPresellPlan(zzzz).cta.href === null, "placeholder hop does not render a live CTA");

const electroBrief = buildConversionBrief(electronics);
assert(electroBrief.sectionPlan.some((item) => item.type === "how_it_works" && item.include), "electronics brief includes how_it_works");
const electroPage = buildPageBlueprint({ contract: electronics, brief: electroBrief });
assert(electroPage.copy.sections.some((item) => item.sectionType === "how_it_works"), "electronics copy has how_it_works");
assert(electroPage.copy.cta.action === "AUTHORIZED_HOP", "authorized hop remains a live CTA");
const grounded = validateSalesCopy(electroPage.copy, electronics, electroBrief);
assert(grounded.ok, `electronics copy grounds (${grounded.violations.map((item) => item.message).join("; ")})`);

const supplementBrief = buildConversionBrief(supplement);
assert(!supplementBrief.sectionPlan.some((item) => item.type === "how_it_works" && item.include), "duplicate usage is not planned as how_it_works");
const supplementPage = buildPageBlueprint({ contract: supplement, brief: supplementBrief });
assert(!supplementPage.copy.sections.some((item) => item.sectionType === "how_it_works"), "duplicate usage is not copied as how_it_works");
assert(supplementPage.copy.cta.action === "NONE", "preview without hop has no purchase CTA");
const supplementGround = validateSalesCopy(supplementPage.copy, supplement, supplementBrief);
assert(supplementGround.ok, `supplement copy grounds (${supplementGround.violations.map((item) => item.message).join("; ")})`);

console.log(`PASS test-presell-strategy.ts (${passed} OK)`);
