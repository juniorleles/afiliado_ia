// npx tsx scripts/test-structured-generation.ts
import {
  adaptStructuredToVariantCopy,
  evaluateStructuredPage,
  validateStructuredPage,
  type StructuredGenerationPage,
} from "../src/lib/ai/structured-generation.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { lintVariant } from "../src/lib/ai/generate-variants.ts";
import { composePublicationGate, validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { buildGenerationFactManifest, emptyProductFacts } from "../src/lib/product-facts.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import type { Campaign } from "../src/lib/campaigns.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function thinFacts() {
  const facts = emptyProductFacts("Sample Capsule", "https://example.test/p", "IMPORTED");
  facts.description = "Supports synovial-fluid quality for comfortable movement with botanical compounds.";
  facts.confidence.description = "DIRECT_SOURCE";
  facts.features = [
    "The formula story mentions botanical compounds and once each morning use as part of daily comfort.",
    "Antioxidants and absorption are described as part of the same feature story.",
  ];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.confidence.ingredientsOrComponents = "NOT_FOUND";
  facts.confidence.usageInformation = "NOT_FOUND";
  facts.confidence.cautions = "NOT_FOUND";
  facts.confidence.pricingInformation = "NOT_FOUND";
  facts.guaranteeInformation = "Read the full refund policy";
  facts.confidence.guaranteeInformation = "HEURISTIC_EXTRACTION";
  facts.confidence.manufacturer = "NOT_FOUND";
  facts.importQuality = "PARTIAL";
  return facts;
}

function ids(facts = thinFacts()) {
  return buildGenerationFactManifest(facts).items.map((item) => item.id);
}

function validThinPage(): StructuredGenerationPage {
  const [f1, f2, f3] = ids();
  return {
    approach: "REVIEW",
    headline: { text: "Sample Capsule Notes", evidenceIds: [f1!] },
    summary: {
      text: "Sample Capsule is described as supporting synovial-fluid quality.",
      evidenceIds: [f1!, f2!],
    },
    blocks: [
      {
        id: "B001",
        type: "OVERVIEW",
        evidenceIds: [f2!],
        content: "Sample Capsule is described as supporting synovial-fluid quality with botanical compounds.",
      },
      {
        id: "B002",
        type: "FEATURES",
        evidenceIds: [f3!],
        content: "The source describes the product in the context of once-each-morning use.",
      },
      {
        id: "B003",
        type: "FINAL_THOUGHTS",
        evidenceIds: [f1!, f2!],
        content: "Sample Capsule is described as supporting synovial-fluid quality.",
      },
    ],
    cta: { label: "View Product Details" },
  };
}

function withBlock(type: string, content = "Extra block."): StructuredGenerationPage {
  const page = validThinPage();
  page.blocks.push({ id: "BX", type, evidenceIds: ["F002"], content });
  return page;
}

const facts = thinFacts();
const plan = createGenerationPlan(facts);
assert(plan.authorizedBlocks.includes("HERO"), "THIN authorizes HERO");
assert(plan.authorizedBlocks.includes("OVERVIEW"), "THIN authorizes OVERVIEW");
assert(plan.authorizedBlocks.includes("FEATURES"), "THIN authorizes FEATURES");
assert(plan.authorizedBlocks.includes("FINAL_THOUGHTS"), "THIN authorizes FINAL_THOUGHTS");
assert(!plan.authorizedBlocks.includes("INGREDIENTS"), "THIN disallows INGREDIENTS");
assert(!plan.authorizedBlocks.includes("USAGE"), "THIN disallows USAGE");
assert(plan.disallowedBlocks.includes("MANUFACTURER"), "THIN disallows MANUFACTURER");
assert(plan.wordBudget.headline === 16, "THIN headline budget");
assert(plan.wordBudget.overview === 120, "THIN overview budget");
assert(ids(facts)[0] === "F001", "evidence IDs are deterministic F001...");
assert(buildGenerationFactManifest(facts).items.every((item) => item.copyEligible), "COPY_ELIGIBLE_ONLY IDs");

function blocked(page: StructuredGenerationPage, code: string, label: string) {
  const result = evaluateStructuredPage(page, facts, "Sample Capsule", "https://example.com/hop");
  assert(result.structuralViolations.some((item) => item.code === code) || result.finalGate === "BLOCKED", label);
  assert(result.finalGate !== "READY", `${label}: not READY`);
  return result;
}

blocked(withBlock("INGREDIENTS"), "UNKNOWN_BLOCK", "A: unauthorized INGREDIENTS block blocked");
blocked(withBlock("USAGE"), "UNKNOWN_BLOCK", "B: unauthorized USAGE block blocked");
blocked(withBlock("MANUFACTURER"), "UNKNOWN_BLOCK", "C: unauthorized MANUFACTURER block blocked");
blocked(withBlock("PRICING"), "UNKNOWN_BLOCK", "D: unauthorized PRICING block blocked");
blocked(withBlock("GUARANTEE"), "UNKNOWN_BLOCK", "E: unauthorized GUARANTEE block blocked");

const unknownId = validThinPage();
unknownId.blocks[0]!.evidenceIds = ["F999"];
blocked(unknownId, "UNKNOWN_EVIDENCE", "F: unknown evidence ID blocked");

const usageFacts = thinFacts();
usageFacts.usageInformation = ["Take one capsule daily"];
usageFacts.confidence.usageInformation = "DIRECT_SOURCE";
const usageIds = buildGenerationFactManifest(usageFacts).items;
const usageEvidence = usageIds.find((item) => item.field === "usageInformation")!.id;
const overviewUsesUsage: StructuredGenerationPage = {
  ...validThinPage(),
  blocks: validThinPage().blocks.map((block) =>
    block.type === "OVERVIEW" ? { ...block, evidenceIds: [usageEvidence] } : block,
  ),
};
const incompatEval = evaluateStructuredPage(overviewUsesUsage, usageFacts, "Sample Capsule", "https://example.com/hop");
assert(
  incompatEval.structuralViolations.some((item) => item.code === "INCOMPATIBLE_EVIDENCE"),
  "G: incompatible evidence field blocked",
);
assert(incompatEval.finalGate !== "READY", "G: incompatible evidence cannot be READY");

const usagePromo = validThinPage();
usagePromo.blocks[1]!.content = "Take once each morning. Recommended once daily. One dose each morning.";
const usageEval = blocked(usagePromo, "USAGE_PROMOTION", "G/Q: feature→usage promotion blocked");
assert(usageEval.finalGate === "BLOCKED", "Q: usage promotion cannot be READY");

const science = validThinPage();
science.blocks[0]!.content = "Synovial fluid is the lubricating substance found in joints.";
const scienceEval = evaluateStructuredPage(science, facts, "Sample Capsule", "https://example.com/hop");
assert(scienceEval.finalGate === "BLOCKED", "H: external science blocked");
assert(
  scienceEval.structuralViolations.some((item) => item.code === "CLOSED_TOPIC") ||
    scienceEval.grounding.status === "UNGROUNDED",
  "H: science is structural or grounding failure",
);

const absence = validThinPage();
absence.blocks[0]!.content = "Ingredient names are not disclosed in the available documentation.";
blocked(absence, "CLOSED_TOPIC", "I: ingredient absence commentary blocked");

const mfrAbsence = validThinPage();
mfrAbsence.blocks[2]!.content = "Manufacturer information is not available and the facility is unknown.";
blocked(mfrAbsence, "CLOSED_TOPIC", "J: manufacturer absence commentary blocked");

const valid = evaluateStructuredPage(validThinPage(), facts, "Sample Capsule", "https://example.com/hop");
assert(valid.structuralViolations.length === 0, "K: valid thin structured candidate has no structural violations");
assert(valid.grounding.status === "GROUNDED" || valid.grounding.status === "UNGROUNDED" || valid.grounding.status === "REVIEW_REQUIRED", "K: valid candidate reaches Grounding");
assert(valid.traces.length > 0, "U: evidence trace produced");
assert(valid.traces.every((item) => item.blockId && item.blockType && Array.isArray(item.declaredEvidence)), "U: trace fields present");

const zeroFaq = validThinPage();
assert(
  validateStructuredPage(zeroFaq, facts).violations.length === 0,
  "L: zero FAQ is valid",
);

const closedFaq = validThinPage();
closedFaq.blocks.push({
  id: "BFAQ",
  type: "FAQ",
  evidenceIds: ["F002"],
  content: "",
  items: [
    {
      question: "How long does it take to notice results?",
      answer: "Results timelines are not stated.",
      topic: "results_timeline",
      evidenceIds: ["F002"],
    },
  ],
});
blocked(closedFaq, "CLOSED_TOPIC", "M: closed-topic FAQ blocked");

const openFaq = validThinPage();
openFaq.blocks.push({
  id: "BFAQ2",
  type: "FAQ",
  evidenceIds: ["F003"],
  content: "",
  items: [
    {
      question: "What feature is described?",
      answer: "The source describes once-each-morning use as a feature.",
      topic: "features",
      evidenceIds: ["F003"],
    },
  ],
});
const faqEval = evaluateStructuredPage(openFaq, facts, "Sample Capsule", "https://example.com/hop");
assert(
  !faqEval.structuralViolations.some((item) => item.text.includes("What feature is described")),
  "N: open-topic FAQ accepted for Grounding",
);
assert(faqEval.traces.some((item) => item.blockType === "FAQ"), "N: FAQ is traced for Grounding");

const long = validThinPage();
long.blocks[0]!.content = Array.from({ length: 130 }, () => "word").join(" ");
blocked(long, "WORD_BUDGET", "O: word budget enforced");

const malformed = evaluateStructuredPage("{not json", facts, "Sample Capsule", "https://example.com/hop");
assert(malformed.finalGate === "BLOCKED", "P: malformed JSON blocked");
assert(malformed.structuralViolations.some((item) => item.code === "MALFORMED"), "P: malformed code recorded");

assert(
  !validateGrounding("Ingredient names are not disclosed.", facts).unsupportedClaims.some((item) =>
    /named ingredient/i.test(item.reason),
  ),
  "R: generic ingredient names is not a named-ingredient entity",
);
assert(
  !validateGrounding("The ingredients also give the formula broader support through antioxidants.", facts).unsupportedClaims.some(
    (item) => /named ingredient/i.test(item.reason),
  ),
  "R: ingredients also give the formula is not a named-ingredient claim",
);
assert(
  validateGrounding("Contains Mobilee.", facts).unsupportedClaims.some((item) => /named ingredient/i.test(item.reason)),
  "S: actual Mobilee claim detected",
);
assert(validateGrounding("Includes Boswellia.", facts).status === "UNGROUNDED", "S: Includes Boswellia still detected");

const synovial = validateGrounding("Synovial fluid is the lubricating substance found in joints.", facts);
assert(synovial.status === "UNGROUNDED", "T: external synovial lubricant statement unsupported");
assert(
  validateGrounding("Synovial fluid cushions the joints.", facts).status === "UNGROUNDED",
  "T: synovial cushions unsupported",
);
assert(
  validateGrounding("It reduces friction between cartilage surfaces.", facts).status === "UNGROUNDED",
  "T: cartilage friction unsupported",
);

const adapted = adaptStructuredToVariantCopy(validThinPage(), plan);
assert(adapted.body.includes("Sample Capsule is described as supporting synovial-fluid quality"), "V: adapter keeps declared copy");
assert(!adapted.body.includes("F001"), "V: adapter does not expose evidence IDs");
assert(!/ingredient names are not disclosed/i.test(adapted.body), "V: adapter adds no absence commentary");
assert(!adapted.body.includes("## Ingredients"), "V: adapter does not invent Ingredients");
assert(valid.adapted === null || valid.structuralViolations.length === 0, "V: adapter used only after structural pass");

assert(composePublicationGate("READY", "UNGROUNDED") === "BLOCKED", "W: Grounding remains mandatory");
assert(valid.grounding.status !== undefined, "W: Grounding ran on structured candidate");

function campaign(body: string): Campaign {
  return {
    id: 1,
    name: "Test",
    slug: "sample-capsule-review",
    headline: "Sample Capsule Notes",
    body,
    ctaLabel: "Learn More",
    affiliateUrl: "https://example.com/hop",
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  };
}
assert(
  lintCampaign(campaign("This product cures arthritis.")).findings.some((f) => f.ruleId === "health.cure" && f.status === "fail"),
  "X: Policy remains mandatory",
);

const lintedValid = lintVariant(
  { approach: "REVIEW", headline: "x", body: "y", ctaLabel: "Learn More", structured: validThinPage() },
  "Sample Capsule",
  "https://example.com/hop",
  facts,
);
assert(lintedValid.evidenceTrace && lintedValid.evidenceTrace.length > 0, "U: lintVariant exposes evidence trace");
assert(
  lintedValid.finalGate !== "READY" || (lintedValid.grounding.status === "GROUNDED" && lintedValid.lint.gate === "READY"),
  "Y: Content Gate remains fail-closed",
);
const lintedBad = lintVariant(
  { approach: "REVIEW", headline: "x", body: "y", ctaLabel: "Learn More", structured: withBlock("INGREDIENTS") },
  "Sample Capsule",
  "https://example.com/hop",
  facts,
);
assert(lintedBad.finalGate === "BLOCKED", "Y: unauthorized block cannot be READY");
assert((lintedBad.structuralViolations || []).length > 0, "Y: structural violations recorded");

console.log("\nTodos os testes de structured evidence-bound generation passaram.");
