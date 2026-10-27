// npx tsx scripts/test-semantic-grounding.ts
import type { ConversionBrief } from "../src/lib/conversion-strategy/types.ts";
import type { ProductContract } from "../src/lib/product-contract/types.ts";
import type { AiCommercialCopyDraft } from "../src/lib/lp-generator/ai-copy/types.ts";
import type { GroundedText, SalesCopy } from "../src/lib/page-blueprint/types.ts";
import { classifyCopyText, classifyDraft, isEditorialLabel } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { validateSalesCopy } from "../src/lib/page-blueprint/validate.ts";
import { applyAiCommercialDraft } from "../src/lib/lp-generator/ai-copy/apply.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function contract(partial: {
  name: string;
  kind?: string;
  features?: string[];
  components?: string[];
  usage?: string[];
  benefits?: string[];
  specs?: Array<{ name: string; value: string; unit?: string }>;
  faq?: Array<{ question: string; answer: string }>;
  packages?: Array<{ label: string; totalPrice?: string }>;
}): ProductContract {
  return {
    contractVersion: 1,
    status: "RENDERABLE",
    identity: { productName: partial.name, productKind: partial.kind, language: "en", slug: "lab" },
    features: (partial.features ?? []).map((text) => ({ text, evidenceRefs: ["e1"], attribution: "SOURCE_STATEMENT" as const })),
    components: (partial.components ?? []).map((name) => ({ name, evidenceRefs: ["e2"] })),
    usage: (partial.usage ?? []).map((text) => ({ text, evidenceRefs: ["e3"] })),
    benefits: (partial.benefits ?? []).map((text) => ({ text, evidenceRefs: ["e4"], attribution: "SELLER_CLAIM" as const, policyStatus: "PASS" as const })),
    specifications: (partial.specs ?? []).map((item) => ({ ...item, evidenceRefs: ["e5"] })),
    faq: (partial.faq ?? []).map((item) => ({ ...item, evidenceRefs: ["e6"] })),
    offer: partial.packages ? { packages: partial.packages.map((item) => ({ ...item, evidenceRefs: ["e7"] })) } : undefined,
    cta: { state: "PREVIEW_ONLY", label: "View offer" },
    legal: { affiliateDisclosure: "Disclosure: I may earn a commission if you purchase through links on this page.", trustLinks: [] },
    seo: { title: partial.name, description: partial.name, canonical: "http://localhost/p/lab", robots: "noindex,nofollow" },
    dataStates: {},
    evidence: [],
    gates: { grounding: "PASS", policy: "PASS", content: "PASS", assets: "REVIEW", link: "REVIEW" },
    publication: { approval: "REQUIRED", blockers: [] },
  };
}

function briefFor(item: ProductContract): ConversionBrief {
  return {
    ctaStrategy: { action: "NONE", reason: "No authorized commercial action." },
  } as ConversionBrief;
}

function g(text: string): GroundedText {
  return { text, evidenceRefs: [], contractPaths: [], producer: "DETERMINISTIC_OFFLINE" };
}

function baseCopy(item: ProductContract): SalesCopy {
  return {
    copyVersion: 1,
    producer: "DETERMINISTIC_OFFLINE",
    headline: g(item.identity.productName),
    subheadline: item.identity.productKind ? g(item.identity.productKind) : undefined,
    introduction: g(item.identity.productName),
    sections: [
      { sectionType: "hero", headline: g(item.identity.productName), body: [], items: [] },
      {
        sectionType: "specifications",
        headline: g("Details"),
        body: [],
        items: (item.components ?? []).map((component) => ({ text: g(component.name) })),
      },
      { sectionType: "legal", headline: g("Disclosure"), body: [g(item.legal.affiliateDisclosure)], items: [] },
    ],
    offerMicrocopy: [],
    cta: { action: "NONE", caption: g("No authorized purchase link is available.") },
    faq: (item.faq ?? []).map((entry) => ({ question: g(entry.question), answer: g(entry.answer) })),
  };
}

const supplement = contract({
  name: "Novalis Core",
  kind: "dietary supplement",
  features: ["dietary supplement"],
  components: ["Cranberry Extract", "Bearberry", "Lactobacillus Acidophilus", "Lactobacillus Plantarum"],
  usage: ["Take one capsule every morning with a glass of water."],
  faq: [{ question: "How do I use Novalis Core?", answer: "Take one capsule every morning with a glass of water." }],
});

const beauty = contract({
  name: "Pellucid Balm",
  kind: "tinted lip balm",
  features: ["Fragrance-free formula"],
  components: ["Shea butter", "Beeswax"],
  usage: ["Apply to lips as needed."],
  specs: [{ name: "Net weight", value: "4.5", unit: "g" }],
});

const electronics = contract({
  name: "Quillon X2",
  kind: "wireless earbuds",
  features: ["Water-resistant housing", "Touch controls"],
  components: ["Earbuds (one pair)", "Charging case"],
  specs: [
    { name: "Battery life", value: "8", unit: "hours" },
    { name: "Bluetooth version", value: "5.3" },
  ],
  packages: [{ label: "1 pair", totalPrice: "$59" }],
});

assert(isEditorialLabel("Ingredients", "Novalis Core"), "Ingredients is an editorial label");
assert(isEditorialLabel("Frequently asked questions", "Novalis Core"), "FAQ is an editorial label");
assert(isEditorialLabel("Product at a glance", "Quillon X2"), "Product at a glance is an editorial label");
assert(isEditorialLabel("Legal & usage", "Pellucid Balm"), "Legal & usage is an editorial label");
assert(isEditorialLabel("Returns, shipping and cautions", "Novalis Core"), "returns heading is an editorial label");
assert(
  classifyCopyText({
    path: "sections[2].headline",
    text: "Returns, shipping and cautions",
    contract: contract({ name: "Novalis Core", kind: "dietary supplement" }),
  }).allowed,
  "returns heading grounds as an editorial label",
);
assert(!isEditorialLabel("Clinically proven bladder support", "Novalis Core"), "claim heading is not editorial");

const glance = classifyCopyText({ text: "Product at a glance", path: "sections[0].headline", contract: supplement });
assert(glance.allowed && glance.classification === "EDITORIAL_LABEL", "section title Product at a glance is allowed");

const paraphrase = classifyCopyText({
  text: "A daily dietary supplement formula with a blend of botanical extracts and probiotic strains.",
  path: "subheadline",
  contract: supplement,
});
assert(paraphrase.allowed && paraphrase.classification === "SUPPORTED_PARAPHRASE", `supported supplement paraphrase (${paraphrase.reason})`);

const dailyUse = classifyCopyText({
  text: "Made for daily use",
  path: "transitions[0]",
  contract: supplement,
});
assert(dailyUse.allowed && dailyUse.classification === "SUPPORTED_PARAPHRASE", "made for daily use is a supported usage paraphrase");

const intro = classifyCopyText({
  text: "Novalis Core is a dietary supplement presented as a single-capsule daily routine. It combines botanical ingredients and several Lactobacillus strains. Follow the manufacturer-recommended usage below.",
  path: "introduction",
  contract: supplement,
});
assert(intro.allowed && intro.classification === "SUPPORTED_PARAPHRASE", `supported introduction paraphrase (${intro.reason})`);

const medical = classifyCopyText({
  text: "Novalis Core clinically proven to cure fatigue.",
  path: "headline",
  contract: supplement,
});
assert(!medical.allowed && medical.classification === "UNSUPPORTED_CLAIM", "medical promise stays blocked");

const price = classifyCopyText({
  text: "Novalis Core now $19.99 — limited time 40% off.",
  path: "subheadline",
  contract: supplement,
});
assert(!price.allowed && price.classification === "UNSUPPORTED_CLAIM", "invented price and discount stay blocked");

const secret = classifyCopyText({
  text: "Ancient Himalayan secret that reverses aging overnight.",
  path: "introduction",
  contract: supplement,
});
assert(!secret.allowed && secret.classification === "UNSUPPORTED_CLAIM", "unsupported benefit language stays blocked");

const beautyPara = classifyCopyText({
  text: "Pellucid Balm is a tinted lip balm with a fragrance-free formula.",
  path: "introduction",
  contract: beauty,
});
assert(beautyPara.allowed, `beauty paraphrase is supported (${beautyPara.reason})`);

const beautyBlock = classifyCopyText({
  text: "Pellucid Balm erases wrinkles in seven days.",
  path: "headline",
  contract: beauty,
});
assert(!beautyBlock.allowed, "beauty medical invention stays blocked");

const electroPara = classifyCopyText({
  text: "Quillon X2 wireless earbuds with water-resistant housing and 8 hours battery life.",
  path: "introduction",
  contract: electronics,
});
assert(electroPara.allowed, `electronics paraphrase is supported (${electroPara.reason})`);

const electroBotanical = classifyCopyText({
  text: "Quillon X2 botanical probiotic blend for daily capsule use.",
  path: "subheadline",
  contract: electronics,
});
assert(!electroBotanical.allowed, "electronics cannot inherit supplement class paraphrases");

const electroPrice = classifyCopyText({
  text: "Quillon X2 for $12.00 today only.",
  path: "headline",
  contract: electronics,
});
assert(!electroPrice.allowed, "electronics invented price stays blocked");

const draft: AiCommercialCopyDraft = {
  version: 1,
  headline: "Novalis Core dietary supplement — daily capsule formula",
  subheadline: "A daily dietary supplement formula with a blend of botanical extracts and probiotic strains.",
  introduction: "Novalis Core is a dietary supplement presented as a single-capsule daily routine. It combines botanical ingredients and several Lactobacillus strains. Follow the manufacturer-recommended usage below.",
  sectionHeadlines: {
    hero: "Product at a glance",
    specifications: "Ingredients",
    faq: "Frequently asked questions",
    legal: "Legal & usage",
  },
  features: ["Dietary supplement", "Daily single-capsule usage"],
  benefitExplanations: [],
  faq: [{ question: "How do I use Novalis Core?", answer: "Take one capsule every morning with a glass of water." }],
  ctaMicrocopy: "Preview only — no purchase action available",
};

const classified = classifyDraft(draft, supplement);
const rejected = classified.filter((item) => !item.allowed);
assert(rejected.length === 0, `fictional supplement draft is fully grounded (${rejected.map((item) => item.path + ":" + item.reason).join("; ")})`);

const applied = applyAiCommercialDraft(baseCopy(supplement), draft, supplement, briefFor(supplement));
assert(Boolean(applied), "grounded draft applies");
assert(applied?.producer === "AI_COMMERCIAL", "applied producer is AI_COMMERCIAL");
assert(applied?.headline.text.includes("Novalis Core"), "applied headline keeps product name");

const poisoned: AiCommercialCopyDraft = {
  ...draft,
  introduction: "Novalis Core is clinically proven to treat fatigue and ships with a $5 bonus.",
};
const blocked = applyAiCommercialDraft(baseCopy(supplement), poisoned, supplement, briefFor(supplement));
assert(blocked === null, "draft with medical and invented offer is not applied");

const det = validateSalesCopy(baseCopy(supplement), supplement, briefFor(supplement));
assert(det.ok, "deterministic copy still grounds literally");

console.log(`PASS test-semantic-grounding.ts (${passed} OK)`);
