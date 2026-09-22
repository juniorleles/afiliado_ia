// npx tsx scripts/test-composition-fact-firewall.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { emptyProductFacts, withImportQuality, type ProductFacts } from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { hydrateSlotFillsToPage, type SlotFill } from "../src/lib/ai/slot-generation.ts";
import { adaptStructuredToVariantCopy } from "../src/lib/ai/structured-generation.ts";
import {
  composePresellPage,
  consumerVisibleText,
  validateComposedPage,
  authorizedCopyFromVariant,
  visibleSections,
} from "../src/lib/presell-page.ts";
import {
  adapterAddedFactualCopy,
  compositionFactFirewall,
  compositionFactsFromVariant,
  compositionTraceComplete,
  isNonFactualUiCopy,
} from "../src/lib/composition-fact-firewall.ts";
import { VALIDATION_SAFE_AFFILIATE } from "../src/lib/validation/constants.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const RUN12_DIR = path.join(
  process.cwd(),
  "data",
  "controlled-ready-12",
  "2026-09-21-controlled-composition-visual-12",
);

const composerSrc = readFileSync(path.join(process.cwd(), "src/lib/presell-page.ts"), "utf8");
assert(!composerSrc.includes("eligible.features"), "composer source does not fall back to eligible.features");
assert(!composerSrc.includes("eligible.description"), "composer source does not fall back to eligible.description");
assert(!composerSrc.includes("eligible.usageInformation"), "composer source does not fall back to eligible.usageInformation");
assert(!composerSrc.includes("eligible.guaranteeInformation"), "composer source does not fall back to eligible.guaranteeInformation");
assert(!composerSrc.includes("eligible.ingredientsOrComponents"), "composer source does not fall back to eligible.ingredients");
assert(!composerSrc.includes("eligible.cautions"), "composer source does not fall back to eligible.cautions");
assert(!composerSrc.includes("eligible.pricingInformation"), "composer source does not fall back to eligible.pricing");
assert(!composerSrc.includes("eligible.manufacturer"), "composer source does not fall back to eligible.manufacturer");
assert(composerSrc.includes("NOT_IN_VARIANT"), "missing variant sections are omitted, not backfilled");

const generationSrc = readFileSync(path.join(process.cwd(), "src/lib/ai/deterministic-thin-generation.ts"), "utf8");
assert(generationSrc.includes("DETERMINISTIC_THIN"), "thin generation file still present and untouched by this test");

assert(isNonFactualUiCopy("## Key Features"), "Key Features heading is NON_FACTUAL_UI_COPY");
assert(isNonFactualUiCopy("## FAQ"), "FAQ heading is NON_FACTUAL_UI_COPY");
assert(isNonFactualUiCopy("## Overview"), "Overview heading is NON_FACTUAL_UI_COPY");
assert(isNonFactualUiCopy("Learn More"), "Learn More is NON_FACTUAL_UI_COPY");
assert(!isNonFactualUiCopy("## Clinically Proven Formula"), "factual heading is not classified as UI copy");
assert(!isNonFactualUiCopy("What does Joint Genesis focus on?"), "FAQ questions are not globally excluded");

const factualHeadingDelta = adapterAddedFactualCopy(
  "Supports mobility with a daily capsule.",
  "## Clinically Proven Formula\n\nSupports mobility with a daily capsule.",
);
assert(
  factualHeadingDelta.some((item) => /clinically proven formula/i.test(item)),
  "factual headings are still detected as adapter delta",
);
const structuralHeadingDelta = adapterAddedFactualCopy(
  "The ingredients also give the formula broader support. What does Joint Genesis focus on? The listing describes lubrication.",
  "## Key Features\n\nThe ingredients also give the formula broader support.\n\n## FAQ\n\n- What does Joint Genesis focus on? The listing describes lubrication.",
);
assert(structuralHeadingDelta.length === 0, "structural headings are not adapter factual delta");
assert(
  !structuralHeadingDelta.some((item) => /what does joint genesis focus on/i.test(item)),
  "FAQ question already in declared copy is not a false factual delta",
);

function resurrectionFacts(overrides: Partial<ProductFacts> & { productName?: string }): ProductFacts {
  const facts = emptyProductFacts(overrides.productName || "Sample Support", "https://example.test/p", "IMPORTED");
  facts.importQuality = "PARTIAL";
  return { ...facts, ...overrides, confidence: { ...facts.confidence, ...(overrides.confidence || {}) } };
}

function composeAuthorized(body: string, facts: ProductFacts, headline = "Sample Support notes") {
  const variant = { approach: "REVIEW" as const, headline, body, ctaLabel: "Learn More" };
  const page = composePresellPage({ variant, facts, template: "REVIEW" });
  const visible = consumerVisibleText(page);
  const authorized = authorizedCopyFromVariant(variant, facts.productName);
  const firewall = compositionFactFirewall({ authorizedCopy: authorized, composedVisible: visible });
  return { page, visible, authorized, firewall, variant };
}

const mixedFeature = resurrectionFacts({
  features: ["Supports flexibility and take two capsules daily."],
  confidence: { ...emptyProductFacts("x", "https://example.test", "IMPORTED").confidence, features: "DIRECT_SOURCE" },
});
const mixedA = composeAuthorized(
  "Supports flexibility.\n\n## Key Features\n\nSupports flexibility.\n",
  mixedFeature,
);
assert(mixedA.visible.includes("Supports flexibility."), "A: allowed feature remains");
assert(!/take two capsules daily/i.test(mixedA.visible), "A: closed usage cannot re-enter");
assert(!JSON.stringify(mixedA.page).includes("take two capsules daily"), "A: closed usage absent from page JSON");
assert(mixedA.firewall.status === "PASS", "A: firewall PASS");
console.log("OK: RESURRECTION_A_USAGE=PASS");

const mixedGuarantee = resurrectionFacts({
  description: "Supports mobility with a 180-day guarantee.",
  guaranteeInformation: "180-day guarantee.",
  confidence: {
    ...emptyProductFacts("x", "https://example.test", "IMPORTED").confidence,
    description: "DIRECT_SOURCE",
    guaranteeInformation: "DIRECT_SOURCE",
  },
});
const mixedB = composeAuthorized("Supports mobility.\n\n## Overview\n\nSupports mobility.\n", mixedGuarantee);
assert(mixedB.visible.includes("Supports mobility."), "B: allowed description remains");
assert(!/180-day guarantee/i.test(mixedB.visible), "B: guarantee cannot re-enter");
assert(mixedB.page.sections.find((s) => s.id === "guarantee")?.visible !== true, "B: guarantee section omitted");
console.log("OK: RESURRECTION_B_GUARANTEE=PASS");

const mixedPrice = resurrectionFacts({
  features: ["Supports flexibility for only $49."],
  pricingInformation: "only $49",
  confidence: {
    ...emptyProductFacts("x", "https://example.test", "IMPORTED").confidence,
    features: "DIRECT_SOURCE",
    pricingInformation: "DIRECT_SOURCE",
  },
});
const mixedC = composeAuthorized(
  "Supports flexibility.\n\n## Key Features\n\nSupports flexibility.\n",
  mixedPrice,
);
assert(mixedC.visible.includes("Supports flexibility."), "C: allowed feature remains");
assert(!/\$49/.test(mixedC.visible), "C: price cannot re-enter");
assert(mixedC.page.omitted.some((o) => o.component === "Pricing"), "C: pricing remains omitted");
console.log("OK: RESURRECTION_C_PRICE=PASS");

const mixedMfr = resurrectionFacts({
  features: ["Supports mobility and is manufactured by Example Labs."],
  manufacturer: "Example Labs",
  confidence: {
    ...emptyProductFacts("x", "https://example.test", "IMPORTED").confidence,
    features: "DIRECT_SOURCE",
    manufacturer: "DIRECT_SOURCE",
  },
});
const mixedD = composeAuthorized(
  "Supports mobility.\n\n## Key Features\n\nSupports mobility.\n",
  mixedMfr,
);
assert(mixedD.visible.includes("Supports mobility."), "D: allowed feature remains");
assert(!/Example Labs/i.test(mixedD.visible), "D: manufacturer cannot re-enter");
assert(mixedD.page.omitted.some((o) => o.component === "Manufacturer"), "D: manufacturer omitted");
console.log("OK: RESURRECTION_D_MANUFACTURER=PASS");

const mixedIngredient = resurrectionFacts({
  ingredientsOrComponents: ["Secretine-X closed span"],
  confidence: {
    ...emptyProductFacts("x", "https://example.test", "IMPORTED").confidence,
    ingredientsOrComponents: "DIRECT_SOURCE",
  },
});
const mixedE = composeAuthorized("Supports mobility.\n\n## Overview\n\nSupports mobility.\n", mixedIngredient);
assert(!/Secretine-X/i.test(mixedE.visible), "E: ineligible ingredient cannot re-enter");
assert(!JSON.stringify(mixedE.page).includes("Secretine-X"), "E: ingredient absent from page JSON");
assert(mixedE.page.omitted.some((o) => o.component === "Ingredients"), "E: ingredients omitted");
console.log("OK: RESURRECTION_E_INGREDIENT=PASS");

const mixedTimeline = resurrectionFacts({
  features: ["Supports mobility in seven days."],
  confidence: { ...emptyProductFacts("x", "https://example.test", "IMPORTED").confidence, features: "DIRECT_SOURCE" },
});
const mixedF = composeAuthorized(
  "Supports mobility.\n\n## Key Features\n\nSupports mobility.\n",
  mixedTimeline,
);
assert(mixedF.visible.includes("Supports mobility."), "F: allowed feature remains");
assert(!/in seven days/i.test(mixedF.visible), "F: results timeline cannot re-enter");
console.log("OK: RESURRECTION_F_RESULTS_TIMELINE=PASS");

const sparseFacts = resurrectionFacts({
  features: ["Raw ProductFacts feature that must not appear on a sparse page."],
  confidence: { ...emptyProductFacts("x", "https://example.test", "IMPORTED").confidence, features: "DIRECT_SOURCE" },
});
const sparse = composeAuthorized("A listed product overview without a features block.", sparseFacts);
assert(sparseFacts.features.length > 0, "sparse: raw features are available");
assert(!visibleSections(sparse.page).some((s) => s.id === "features"), "sparse: features section omitted");
assert(!/Raw ProductFacts feature/i.test(sparse.visible), "sparse: composer did not repopulate from raw ProductFacts");
assert(sparse.page.omitted.some((o) => o.component === "Features" && o.reason === "NOT_IN_VARIANT"), "sparse: Features NOT_IN_VARIANT");
console.log("OK: SPARSE_COMPOSITION=PASS");

const failClosed = compositionFactFirewall({
  authorizedCopy: "Supports mobility.",
  composedVisible: "Supports mobility. Take once each morning.",
});
assert(failClosed.status === "FAIL", "invariant fail-closed on factual delta");
assert(failClosed.addedFactualCopy.some((item) => /take once each morning/i.test(item)), "fail-closed names the added claim");

const run12Raw = JSON.parse(readFileSync(path.join(RUN12_DIR, "generation-raw.json"), "utf8")) as {
  fills: SlotFill[];
  ctaLabel: string;
  anthropicCalls: number;
  generationMethod: string;
};
assert(run12Raw.anthropicCalls === 0, "saved Run12 fills recorded ANTHROPIC_CALLS=0");
assert(run12Raw.generationMethod === "DETERMINISTIC_THIN", "saved fills are DETERMINISTIC_THIN");

const run12Facts = withImportQuality(JSON.parse(readFileSync(path.join(RUN12_DIR, "import-facts.json"), "utf8")) as ProductFacts);
const slotPlan = createEvidenceSlotPlan(run12Facts);
const generationPlan = createGenerationPlan(run12Facts);
const hydrated = hydrateSlotFillsToPage(run12Raw.fills, slotPlan, run12Raw.ctaLabel, "BUYER_GUIDE");
const adapted = adaptStructuredToVariantCopy(hydrated, generationPlan);
const declaredCopy = [
  hydrated.headline.text,
  hydrated.summary.text,
  ...hydrated.blocks.map((block) => block.content),
  ...hydrated.blocks.flatMap((block) => (block.items || []).map((item) => `${item.question} ${item.answer}`)),
  hydrated.cta.label,
].join("\n");
const adapterDelta = adapterAddedFactualCopy(declaredCopy, `${adapted.headline}\n${adapted.body}\n${adapted.ctaLabel}`);
assert(adapterDelta.length === 0, `Run12 adapter structural headings are non-factual (delta=${JSON.stringify(adapterDelta)})`);

const variant = { approach: "BUYER_GUIDE" as const, ...adapted };
const composed = composePresellPage({ variant, facts: run12Facts, template: "BUYER_GUIDE" });
const visible = consumerVisibleText(composed);
assert(!/take once each morning/i.test(visible), "Run12: CLOSED_USAGE_REINTRODUCED=NO");
assert(!/take once each morning/i.test(JSON.stringify(composed)), "Run12: F004_C002_VISIBLE=NO");
assert(composed.hero.headline === run12Raw.fills.find((f) => f.slotId === "S001")?.content, "Run12: identity headline preserved");
assert(composed.ctaLabel === "Learn More", "Run12: CTA identity preserved");

const compositionFacts = compositionFactsFromVariant(variant, run12Facts.productName);
assert(compositionFacts.provenance === "VALIDATED_GENERATED_COPY", "composer factual input is validated generated copy");
const firewall = compositionFactFirewall({
  authorizedCopy: compositionFacts.authorizedCopy,
  composedVisible: visible,
});
assert(firewall.status === "PASS", `Run12: COMPOSER_ADDED_FACTUAL_COPY=NO (${firewall.addedFactualCopy.join(" | ")})`);
const trace = compositionTraceComplete({ authorizedCopy: compositionFacts.authorizedCopy, composedVisible: visible });
assert(trace.complete, "COMPOSITION_TRACE_COMPLETE=YES");
assert(trace.rawProductFactFallbackBlocks.length === 0, "RAW_PRODUCTFACT_FALLBACK_BLOCKS=0");

const post = validateComposedPage(
  composed,
  run12Facts,
  VALIDATION_SAFE_AFFILIATE,
  authorizedCopyFromVariant(variant, run12Facts.productName),
);
assert(post.factualFirewall.status === "PASS", "post-composition firewall PASS");
assert(post.grounding.status === "GROUNDED", `POST_COMPOSITION_GROUNDING=${post.grounding.status}`);
assert(post.grounding.unsupportedClaims.length === 0, "UNSUPPORTED_CLAIMS=0");
assert(post.policy === "READY", `POLICY=${post.policy}`);
assert(post.finalGate === "READY", `FINAL_CONTENT_GATE=${post.finalGate}`);

console.log("OK: RUN12_REPLAY=PASS");
console.log("OK: ADAPTER_DELTA_PRECISION=PASS");
console.log("OK: COMPOSITION_FACT_FIREWALL=PASS");

console.log("\nTodos os testes do composition fact firewall passaram.");
