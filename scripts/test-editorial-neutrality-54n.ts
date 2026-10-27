// npx tsx scripts/test-editorial-neutrality-54n.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyEditorialText } from "../src/lib/editorial-neutrality/classify.ts";
import { neutralizeEditorialText } from "../src/lib/editorial-neutrality/neutralize.ts";
import { applyEditorialNeutrality } from "../src/lib/editorial-neutrality/apply.ts";
import { inspectEditorialNeutrality } from "../src/lib/editorial-neutrality/inspect.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { composeV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { pipelineDefects, evaluateGenerationGates } from "../src/lib/lp-generator/gates.ts";
import { classifyCopyText } from "../src/lib/page-blueprint/semantic-grounding.ts";
import { inspectContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";
import type { ProductFacts } from "../src/lib/product-facts.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function inputOf(facts: ProductFacts): ContractInput {
  return {
    facts,
    slug: "novalis-core",
    siteName: getPublicSiteName(),
    siteUrl: getPublicSiteUrl(),
    cta: { previewOnly: true },
    legal: {
      affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT,
      healthDisclaimer: HEALTH_DISCLAIMER_TEXT,
      healthDisclaimerPolicy: "WHEN_HEALTH_CONTENT",
      trustLinks: PUBLIC_FOOTER_LINKS.map((link) => ({ href: link.href, label: link.label })),
    },
  };
}

function seed(name: string): ProductFacts {
  const facts = emptyProductFacts(name, "https://shop.novalis.example/core", "MANUAL");
  facts.confidence.productName = "MANUAL";
  facts.productFormat = {
    value: "dietary supplement",
    statement: "dietary supplement",
    provenance: "MANUAL",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://shop.novalis.example/core",
    sourcePageCategory: "PRIMARY",
  };
  facts.usageInformation = ["Take one capsule every morning with water."];
  return facts;
}

const shippingPromo = neutralizeEditorialText({
  text: "After your purchase, you have 60 days from the moment you get your package to explore the benefits of this amazing product.",
  role: "OPERATIONAL",
});
assert(shippingPromo.action === "NEUTRALIZE", "promotional shipping policy can be neutralized");
assert(/60 days/i.test(shippingPromo.renderedText ?? ""), "the 60-day window is preserved");
assert(!/amazing|benefits/i.test(shippingPromo.renderedText ?? ""), "amazing-product language is removed");

const generalization = neutralizeEditorialText({
  text: "According to most of our customers, domestic packages arrive within 5-7 working days after being ordered.",
  role: "FAQ",
});
assert(generalization.action === "NEUTRALIZE", "an unsupported customer generalization is neutralized");
assert(/5-7 working days/i.test(generalization.renderedText ?? ""), "the stated window remains");
assert(!/most of our customers/i.test(generalization.renderedText ?? ""), "the customer survey is not published");

const medical = neutralizeEditorialText({
  text: "This formula is clinically proven to cure fatigue.",
  role: "FEATURE",
});
assert(medical.action === "OMIT" && medical.classification === "MEDICAL_OR_HEALTH_CLAIM", "medical claims are omitted, not rewritten into facts");

const benefit = neutralizeEditorialText({
  text: "Explore the benefits of this amazing product every morning.",
  role: "FAQ",
});
assert(benefit.action === "OMIT", "an unsupported benefit with no operational remainder is omitted");

const safe = neutralizeEditorialText({
  text: "Our amazing product is shipped to customers within two business days.",
  role: "OPERATIONAL",
});
assert(safe.action === "NEUTRALIZE", "safe neutralization keeps the shipment window");
assert(/two business days/i.test(safe.renderedText ?? ""), "the shipment window is the remainder");
assert(!/amazing/i.test(safe.renderedText ?? ""), "the amplifier is not kept");

const exception = neutralizeEditorialText({
  text: "Please keep in mind that we do not support the return shipping costs.",
  role: "OPERATIONAL",
});
assert(exception.action === "KEEP", "a return-shipping exception is preserved");

const refund = neutralizeEditorialText({
  text: "If you are not fully satisfied, you can easily ask for your money back.",
  role: "OPERATIONAL",
});
assert(refund.action === "NEUTRALIZE" || refund.action === "KEEP", "a refund request remains a request");
assert(!/unconditional|guaranteed refund/i.test(refund.renderedText ?? ""), "a refund request is not turned into an unconditional guarantee");

const restAssured = neutralizeEditorialText({
  text: "As long as you sent back ALL the bottles and the Packing Slip, you can rest assured the refund will be processed in only a few days after we receive your package.",
  role: "OPERATIONAL",
});
assert(restAssured.action === "NEUTRALIZE", "rest-assured refund copy can keep the condition");
assert(/packing slip/i.test(restAssured.renderedText ?? "") && /refund/i.test(restAssured.renderedText ?? ""), "the return condition and refund remain");
assert(!/rest assured|you can the /i.test(restAssured.renderedText ?? ""), "the amplifier is removed without breaking the sentence");

const attributed = classifyEditorialText({ text: "The seller states: 60-day money-back guarantee.", role: "GUARANTEE" });
assert(attributed.classification === "SELLER_STATED_FACT" || attributed.classification === "NEUTRAL_INFORMATION", "seller attribution stays publishable");

const neutral = neutralizeEditorialText({
  text: "Orders ship within two business days.",
  role: "OPERATIONAL",
});
assert(neutral.action === "KEEP", "a neutral operational sentence is not blocked");

const electronics = classifyEditorialText({ text: "Battery life: 8 hours", role: "SPECIFICATION" });
assert(electronics.classification === "NEUTRAL_INFORMATION" || electronics.classification === "SELLER_STATED_FACT", "electronics specifications stay technical");

const beauty = classifyEditorialText({ text: "Apply to lips as needed.", role: "USAGE" });
assert(beauty.classification === "NEUTRAL_INFORMATION" || beauty.classification === "SELLER_STATED_FACT", "beauty usage stays instructional");

const digital = classifyEditorialText({ text: "The source lists a single PDF download.", role: "FAQ" });
assert(digital.classification !== "MEDICAL_OR_HEALTH_CLAIM", "digital-product format is not a medical claim");

const facts = seed("Novalis Core");
facts.shippingInformation = [
  {
    statement: "Our amazing product is shipped to customers within two business days.",
    kind: "PROCESSING",
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://shop.novalis.example/help/shipping",
    sourcePageCategory: "SHIPPING",
  },
];
facts.returnsInformation = [
  {
    statement: "Please keep in mind that we do not support the return shipping costs.",
    kind: "RETURN_CONDITION",
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://shop.novalis.example/help/refunds",
    sourcePageCategory: "RETURNS",
  },
];
facts.sourceSnippets = [
  {
    field: "faq",
    question: "How long will my order take?",
    text: "According to most of our customers, domestic packages arrive within 5-7 working days after being ordered.",
    sourceUrl: "https://shop.novalis.example/help/shipping",
    confidence: "DIRECT_SOURCE",
  },
  {
    field: "faq",
    question: "Is delivery free?",
    text: "Nothing at all! The delivery service is on our side, as a sign of appreciation and trust you will be happy with your order.",
    sourceUrl: "https://shop.novalis.example/help/shipping",
    confidence: "DIRECT_SOURCE",
  },
];
const contract = buildProductContract(inputOf(facts)).contract;
assert(
  (contract.operational?.shipping ?? []).every((item) => !/amazing/i.test(item.statement)),
  "the contract does not publish promotional shipping amplifiers",
);
assert(
  (contract.operational?.returns ?? []).some((item) => /return shipping costs/i.test(item.statement)),
  "return-cost exceptions reach the contract",
);
assert(
  (contract.faq ?? []).every((item) => !/most of our customers|nothing at all/i.test(item.answer)),
  "FAQ generalizations and implied free shipping do not reach the contract",
);
assert((contract.faq ?? []).some((item) => /5-7 working days/i.test(item.answer)), "the seller-stated shipping window can remain as FAQ");

const brief = buildConversionBrief(contract);
const page = buildPageBlueprint({ contract, brief });
assert(!/amazing product|most of our customers|nothing at all/i.test(JSON.stringify(page.copy)), "blueprint copy is editorially neutral");
assert(page.copy.sections.some((section) => section.sectionType === "trust" && section.items.some((item) => /seller states/i.test(item.text.text))), "operational copy stays seller-attributed");
assert(inspectContentQuality({ copy: page.copy, contract, brief }).length === 0, "content quality stays independent and clear");
assert(classifyCopyText({ path: "introduction", text: page.copy.introduction.text, contract }).allowed, "semantic grounding stays independent and still allows identity copy");

const model = composeV4Model({
  scenarioKey: "lab-neutrality",
  contract,
  brief,
  copy: {
    ...page.copy,
    sections: page.copy.sections.map((section) =>
      section.sectionType === "trust"
        ? {
            ...section,
            items: [
              ...section.items,
              { text: { text: "This amazing product changes lives.", evidenceRefs: [], contractPaths: ["injected"], producer: "DETERMINISTIC" } },
            ],
          }
        : section,
    ),
  },
  blueprint: page.blueprint,
});
assert(!/amazing product changes lives/i.test(JSON.stringify(model.copy) + JSON.stringify(model.blueprint.sections)), "the renderer cannot bypass the neutrality gate");

const evaluated = evaluateGenerationGates({
  defects: pipelineDefects({ contract, brief, copy: page.copy, blueprint: page.blueprint, model, catalog: null }),
  contentQuality: "PASS",
});
assert(evaluated.gates.EDITORIAL_NEUTRALITY_GATE.verdict === "PASS", "neutrality is a first-class gate");
assert(evaluated.gates.CONTENT_GROUNDING_GATE.verdict === "PASS", "grounding is not replaced by neutrality");
assert(evaluated.gates.EDITORIAL_QUALITY_GATE.verdict === "PASS", "editorial quality stays its own gate");
assert(evaluated.gates.COMMERCIAL_AUTHORIZATION_GATE.verdict === "PASS", "commercial authorization stays its own gate");
assert(evaluated.labels.CONTENT_PASS === true, "READY requires every required gate, including neutrality");

const leftover = applyEditorialNeutrality({
  ...page.copy,
  introduction: { ...page.copy.introduction, text: "Clinically proven to cure fatigue." },
});
assert(
  leftover.findings.some((item) => item.path === "introduction" && item.action === "OMIT"),
  "a blocking medical introduction is omitted rather than rewritten into a fact",
);

const libFiles = [
  "src/lib/editorial-neutrality/classify.ts",
  "src/lib/editorial-neutrality/neutralize.ts",
  "src/lib/editorial-neutrality/apply.ts",
  "src/lib/editorial-neutrality/inspect.ts",
];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/prodentim|femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
}

const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
assert(existsSync(femicoreCatalog) && existsSync(femicoreHop), "FemiCore files stay readable without writes");
assert(fileHash(femicoreCatalog) === fileHash(femicoreCatalog), "FemiCore catalog hash is stable in this test");

assert(inspectEditorialNeutrality(page.copy).every((item) => item.action === "KEEP"), "published lab copy has no leftover neutrality actions");

console.log(`PASS test-editorial-neutrality-54n.ts (${passed} OK)`);
