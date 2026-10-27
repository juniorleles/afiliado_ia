// npx tsx scripts/test-content-quality-repair.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyAttribute } from "../src/lib/attribute-class/classify.ts";
import { statementAllowed } from "../src/lib/product-contract/claims.ts";
import { emptyProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { buildConversionBrief } from "../src/lib/conversion-strategy/build.ts";
import { buildPageBlueprint } from "../src/lib/page-blueprint/blueprint.ts";
import { countContentRepetitions, inspectContentQuality, repairContentQuality } from "../src/lib/lp-generator/content-quality.ts";
import { persistQualityInspection, replayQualityInspection } from "../src/lib/lp-generator/quality-persist.ts";
import { faqEntryAllowed } from "../src/lib/presell-copy/faq-select.ts";
import { enrichProduct } from "../src/lib/product-enrichment/pipeline.ts";
import { labContractInput } from "../src/lib/design-system/scenarios.ts";
import { labSources } from "../src/lib/product-enrichment/lab-sources.ts";
import { structureResearchFacts } from "../src/lib/lp-generator/structure.ts";
import { AFFILIATE_DISCLOSURE_TEXT, HEALTH_DISCLAIMER_TEXT, PUBLIC_FOOTER_LINKS, getPublicSiteName, getPublicSiteUrl } from "../src/lib/public-site.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function inputOf(facts: ReturnType<typeof emptyProductFacts>): ContractInput {
  return {
    facts,
    slug: "lab",
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

function seed(name: string, url: string, kind: string) {
  const facts = emptyProductFacts(name, url, "MANUAL");
  facts.confidence.productName = "MANUAL";
  facts.productFormat = {
    value: kind,
    statement: kind,
    provenance: "MANUAL",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: url,
    sourcePageCategory: "PRIMARY",
  };
  return facts;
}

assert(classifyAttribute("Easy To Use").class === "PRODUCT_FEATURE", "Easy To Use is a product feature");
assert(classifyAttribute("No Stimulants").class === "PRODUCT_FEATURE", "No Stimulants is a product feature");
assert(classifyAttribute("Non-Habit Forming").class === "PRODUCT_FEATURE", "Non-Habit Forming is a product feature");
assert(classifyAttribute("Lactobacillus Paracasei").class === "INGREDIENT", "Latin strain stays an ingredient");
assert(classifyAttribute("B. lactis BL-04").class === "INGREDIENT", "strain code stays an ingredient");
assert(classifyAttribute("Lactobacillus Reuteri").class === "INGREDIENT", "Reuteri stays an ingredient");
assert(classifyAttribute("Shea butter").class === "INGREDIENT", "beauty material stays an ingredient");
assert(classifyAttribute("Woven nylon").class === "INGREDIENT", "accessory material stays an ingredient");
assert(classifyAttribute("Charging case").class === "INGREDIENT", "electronics included item stays a component");
assert(classifyAttribute("Take one capsule with water each morning.").class === "USAGE_INSTRUCTION", "usage sentence is not an ingredient");
assert(classifyAttribute("60-day money-back guarantee.").class === "GUARANTEE_OR_POLICY", "guarantee is not an ingredient");
assert(classifyAttribute("Backed by clinical research to transform lives").class === "SELLER_CLAIM", "promotional sentence is a seller claim");

const supplement = seed("Novalis Denti", "https://denti.novalis.example/", "dietary supplement");
supplement.description = "Novalis Denti is a chewable probiotic tablet.";
supplement.confidence.description = "DIRECT_SOURCE";
supplement.ingredientsOrComponents = [
  "Lactobacillus Paracasei",
  "B. lactis BL-04",
  "Lactobacillus Reuteri",
  "Easy To Use",
  "No Stimulants",
  "Non-Habit Forming",
];
supplement.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
supplement.features = ["Chewable tablet"];
supplement.confidence.features = "DIRECT_SOURCE";
supplement.sourceSnippets = [
  {
    field: "faq",
    question: "How can I get started?",
    text: "It's very easy! Just click the button below and you will be taken to our secure order checkout page.",
    sourceUrl: "https://denti.novalis.example/faq",
    confidence: "DIRECT_SOURCE",
    sourcePageCategory: "FAQ",
  },
  {
    field: "faq",
    question: "Is this safe?",
    text: "This product is designed for all ages and medical conditions and is generally considered to be safe.",
    sourceUrl: "https://denti.novalis.example/faq",
    confidence: "DIRECT_SOURCE",
    sourcePageCategory: "FAQ",
  },
  {
    field: "faq",
    question: "Does research support this?",
    text: "Novalis Denti is backed by clinical research and can transform lives.",
    sourceUrl: "https://denti.novalis.example/faq",
    confidence: "DIRECT_SOURCE",
    sourcePageCategory: "FAQ",
  },
  {
    field: "faq",
    question: "How should the bottle be stored?",
    text: "Keep the bottle closed and dry after each use.",
    sourceUrl: "https://denti.novalis.example/faq",
    confidence: "DIRECT_SOURCE",
    sourcePageCategory: "FAQ",
  },
];
const structured = structureResearchFacts({
  operatorName: "Novalis Denti",
  category: "dietary supplement",
  facts: supplement,
  purchaseLink: null,
});
assert(
  !structured.facts.ingredientsOrComponents.some((item) => /easy to use|no stimulants|non-habit forming/i.test(item)),
  "structure drops commercial chips from ingredients",
);
assert(
  structured.facts.ingredientsOrComponents.filter((item) => /paracasei|lactis|reuteri/i.test(item)).length === 3,
  "declared strains stay in structured ingredients",
);
assert(structured.facts.productFormat?.value === "dietary supplement", "operator category becomes the documented product kind when the source omitted format");

const contract = buildProductContract(inputOf(structured.facts)).contract;
const componentNames = (contract.components ?? []).map((item) => item.name);
assert(!componentNames.some((item) => /easy to use|no stimulants|non-habit forming/i.test(item)), "contract does not render chips as ingredients");
assert(componentNames.filter((item) => /paracasei|lactis|reuteri/i.test(item)).length === 3, "contract keeps declared strains");
assert(
  !(contract.faq ?? []).some((item) => /checkout|transform lives|clinical research|all ages and medical/i.test(`${item.question} ${item.answer}`)),
  "contract FAQ drops prohibited seller claims",
);
assert((contract.faq ?? []).some((item) => /stored/i.test(item.question)), "objective storage FAQ is kept");

assert(!faqEntryAllowed("How can I get started?", "Click the button below to reach the checkout page.").ok, "checkout FAQ is blocked");
assert(!faqEntryAllowed("Is it safe?", "It is designed for all ages and medical conditions.").ok, "universal safety FAQ is blocked");
assert(!faqEntryAllowed("Does research support this?", "Novalis Denti is backed by clinical research and can transform lives.").ok, "clinical-research FAQ is blocked");
assert(!faqEntryAllowed("How does it work?", "Well, the way this works is pretty simple actually…").ok, "ellipsis filler FAQ is blocked");
assert(faqEntryAllowed("How should the bottle be stored?", "Keep the bottle closed and dry after each use.").ok, "storage FAQ is allowed");
assert(
  !statementAllowed("Try Novalis Denti: a unique blend of probiotic strains backed by clinical research.", "PROMOTIONAL"),
  "unsupported clinical-research claims are not promotional copy",
);

const brief = buildConversionBrief(contract);
const built = buildPageBlueprint({ contract, brief });
const repaired = repairContentQuality({ copy: built.copy, contract, brief });
const repeats = countContentRepetitions(repaired.copy);
assert(repeats === 0, `assembled copy has no inspector repeats (got ${repeats})`);
assert(inspectContentQuality({ copy: repaired.copy, contract, brief }).every((item) => item.id !== "repetition"), "same inspector reports no repetition defect");
assert(repaired.copy.faq.every((item) => item.answer.text.trim().length > 0), "FAQ answers stay on copy.faq");
assert(
  repaired.copy.sections.filter((section) => section.sectionType === "faq").every((section) => section.items.every((item) => !item.text.text.trim())),
  "FAQ section items do not repeat answers",
);

const inspection = persistQualityInspection({
  copy: repaired.copy,
  contract,
  brief,
  repaired,
  timestamp: "2026-10-23T00:00:00.000Z",
});
assert(inspection.persistence === "CONSISTENT", "quality inspection matches replay on the final copy");
assert(inspection.gate === "CONTENT_QUALITY_GATE" && inspection.ruleVersion === 1, "persisted gate names the rule version");

const stale = persistQualityInspection({
  copy: {
    ...repaired.copy,
    faq: [...repaired.copy.faq, ...repaired.copy.faq, ...repaired.copy.faq, ...repaired.copy.faq],
  },
  contract,
  brief,
  repaired: { ...repaired, status: "PASS", defects: [] },
  timestamp: "2026-10-23T00:00:00.000Z",
});
assert(stale.persistence === "INCONSISTENT", "silent PASS is rejected when replay finds defects");
assert(
  replayQualityInspection({
    copy: repaired.copy,
    contract,
    brief,
    stored: undefined,
  }).persistence === "INCONSISTENT",
  "missing persisted inspection is inconsistent",
);

const beauty = enrichProduct({ scenarioKey: "s2", contractInput: labContractInput(1), sources: labSources("s2") });
const electronics = enrichProduct({ scenarioKey: "s3", contractInput: labContractInput(2), sources: labSources("s3") });
assert((beauty.afterContract.components ?? []).some((item) => /shea|beeswax|rose oil/i.test(item.name)), "beauty fixture keeps materials as components");
assert(!(beauty.afterContract.components ?? []).some((item) => /easy to use/i.test(item.name)), "beauty fixture has no misclassified chips");
const beautyCopy = buildPageBlueprint({ contract: beauty.afterContract, brief: buildConversionBrief(beauty.afterContract) });
assert(
  inspectContentQuality({ copy: beautyCopy.copy, contract: beauty.afterContract, brief: buildConversionBrief(beauty.afterContract) }).every((item) => item.id !== "repetition"),
  "beauty fixture is not blocked for repetition",
);
assert((electronics.afterContract.components ?? []).some((item) => /earbuds|charging case|usb-c/i.test(item.name)), "electronics fixture keeps included items");
const electronicsCopy = buildPageBlueprint({
  contract: electronics.afterContract,
  brief: buildConversionBrief(electronics.afterContract),
});
assert(
  inspectContentQuality({ copy: electronicsCopy.copy, contract: electronics.afterContract, brief: buildConversionBrief(electronics.afterContract) }).every((item) => item.id !== "repetition"),
  "electronics fixture is not blocked for repetition",
);

const digitalFacts = seed("Novalis Notes", "https://notes.novalis.example/course", "digital course");
digitalFacts.description = "Novalis Notes is a digital course supplied as a download.";
digitalFacts.confidence.description = "MANUAL";
digitalFacts.usageInformation = ["Download the files after checkout."];
digitalFacts.confidence.usageInformation = "MANUAL";
digitalFacts.features = ["Lifetime access to the files"];
digitalFacts.confidence.features = "MANUAL";
const digital = buildProductContract(inputOf(digitalFacts)).contract;
assert(!(digital.components ?? []).length, "digital fixture does not invent ingredients");
const digitalCopy = buildPageBlueprint({ contract: digital, brief: buildConversionBrief(digital) });
assert(
  inspectContentQuality({ copy: digitalCopy.copy, contract: digital, brief: buildConversionBrief(digital) }).every((item) => item.id !== "repetition"),
  "digital fixture is not blocked for repetition",
);
assert(digitalCopy.copy.cta.action === "NONE", "digital without hop stays commercially inactive");

const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
assert(existsSync(femicoreHop) && existsSync(femicoreCatalog), "FemiCore hop and catalog exist for isolation check");
const beforeHop = createHash("sha256").update(readFileSync(femicoreHop)).digest("hex");
const beforeCatalog = createHash("sha256").update(readFileSync(femicoreCatalog)).digest("hex");
assert(beforeHop.length === 64 && beforeCatalog.length === 64, "FemiCore files are readable without mutation");

console.log(`PASS ${passed} assertions`);
