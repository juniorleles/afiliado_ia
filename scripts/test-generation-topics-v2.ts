// npx tsx scripts/test-generation-topics-v2.ts
//
// Optional operational generation topics (product_format, returns, shipping).
// Fictional products only.
import {
  buildGenerationFactManifest,
  emptyProductFacts,
  getConsumerCopyEligibleFacts,
  type ProductFacts,
  type ReturnsInformationFact,
  type ShippingInformationFact,
} from "../src/lib/product-facts.ts";
import { createGenerationPlan, usageInstructionSpans, validateGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { closedClaimFirewall, projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { collectSlotProjectionViolations } from "../src/lib/ai/slot-projection-isolation.ts";
import { deterministicFaqQuestion, validateFaqQuestion } from "../src/lib/ai/faq-question-semantics.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const NAME = "Larkspur Field Kettle";
const URL_A = "https://larkspur.example/kettle";

function base(): ProductFacts {
  const facts = emptyProductFacts(NAME, URL_A, "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Stainless Steel Body", "Folding Handle", "Dishwasher Safe"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.usageInformation = ["Fill the kettle to the marked line before heating."];
  facts.confidence.usageInformation = "DIRECT_SOURCE";
  facts.cautions = ["Do not heat the kettle when empty."];
  facts.confidence.cautions = "DIRECT_SOURCE";
  facts.guaranteeInformation = "Every kettle is covered by a 30-day money-back guarantee.";
  facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  return facts;
}

function returnsFact(statement: string, kind: ReturnsInformationFact["kind"], extra: Partial<ReturnsInformationFact> = {}): ReturnsInformationFact {
  return {
    statement,
    kind,
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://larkspur.example/help/returns",
    sourcePageCategory: "RETURNS",
    ...extra,
  };
}

function shippingFact(statement: string, kind: ShippingInformationFact["kind"], extra: Partial<ShippingInformationFact> = {}): ShippingInformationFact {
  return {
    statement,
    kind,
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://larkspur.example/help/shipping",
    sourcePageCategory: "SHIPPING",
    ...extra,
  };
}

function expanded(): ProductFacts {
  const facts = base();
  facts.returnsInformation = [
    returnsFact("You have 45 days from delivery to request a return.", "RETURN_WINDOW"),
    returnsFact("If you are not satisfied, simply ask for your money back.", "REFUND_MECHANISM"),
    returnsFact("Email help@larkspur.example with the subject Return Request.", "REFUND_MECHANISM"),
    returnsFact("Pack the kettle with the packing slip and send it back to us.", "RETURN_PROCESS"),
    returnsFact("12 Orchard Road, Springfield, IL 62701, United States", "RETURN_PROCESS"),
    returnsFact("We do not cover the return shipping costs.", "RETURN_CONDITION"),
    returnsFact("It may take a while for the refund to appear; processing takes 4 to 8 days.", "REFUND_MECHANISM"),
    returnsFact("Returns are only accepted with a store credit voucher.", "OTHER", { copyEligibility: "NO" }),
  ];
  facts.shippingInformation = [
    shippingFact("Domestic: FREE, 3-5 working days", "DESTINATION", { sourceUnit: "TABLE_CELL" }),
    shippingFact("Canada: $12.50, 8-12 working days", "DESTINATION", { sourceUnit: "TABLE_CELL" }),
    shippingFact("Mexico: $12.50, 8-12 working days", "DESTINATION", { sourceUnit: "TABLE_CELL" }),
    shippingFact("Within 48 hours of your order you will receive an email with your tracking number and a link to follow the parcel.", "PROCESSING"),
    shippingFact("Yes. Within 48 hours of your order you receive an email with your tracking number and a link to follow your parcel.", "PROCESSING", {
      question: "Can I track my order?",
      sourceUnit: "FAQ_ANSWER",
    }),
    shippingFact("Domestic: FREE, 3-5 working days", "DESTINATION", { sourceUnit: "TABLE_CELL" }),
    shippingFact("Orders ship from our warehouse after payment is confirmed \uFFFD always.", "PROCESSING"),
    shippingFact("Estimated delivery depends on the carrier.", "DELIVERY_ESTIMATE", { provenance: "HEURISTIC_EXTRACTION" }),
  ];
  return facts;
}

// 1. Absent operational evidence: topics closed, no new slots, manifest unchanged.
{
  const facts = base();
  const plan = createGenerationPlan(facts);
  for (const topic of ["product_format", "returns", "shipping"] as const) {
    assert(plan.closedTopics.includes(topic), `1: ${topic} is CLOSED without evidence`);
  }
  assert(!plan.optionalBlocks.includes("RETURNS") && !plan.optionalBlocks.includes("SHIPPING"), "1: no RETURNS/SHIPPING blocks");
  const slotPlan = createEvidenceSlotPlan(facts);
  assert(!slotPlan.slots.some((slot) => slot.type === "RETURNS" || slot.type === "SHIPPING"), "1: no operational slots (OMIT)");
  const manifest = buildGenerationFactManifest(facts);
  assert(!manifest.items.some((item) => /returns|shipping|productFormat/.test(item.field)), "1: manifest has no operational items");
  const closed = validateGenerationPlan("Enjoy free shipping and ships to Canada in 8-12 working days.", plan);
  assert(closed.violations.some((item) => item.topic === "shipping"), "1: closed shipping wording is a violation");
  const closedReturns = validateGenerationPlan("Include the packing slip; return shipping is on you.", plan);
  assert(closedReturns.violations.some((item) => item.topic === "returns"), "1: closed returns wording is a violation");
}

// 2. Authorized evidence opens the topics; eligibility filters apply.
const facts = expanded();
const eligible = getConsumerCopyEligibleFacts(facts);
{
  const plan = createGenerationPlan(facts);
  assert(plan.allowedTopics.includes("returns") && plan.allowedTopics.includes("shipping"), "2: returns and shipping OPEN");
  assert(plan.optionalBlocks.includes("RETURNS") && plan.optionalBlocks.includes("SHIPPING"), "2: blocks are optional, never required");
  assert(!eligible.returnsInformation.some((item) => /@|Orchard Road|62701/.test(item)), "2: contact and postal details excluded from copy");
  assert(!eligible.returnsInformation.some((item) => /store credit/.test(item)), "2: copyEligibility=NO statement excluded");
  assert(!eligible.shippingInformation.some((item) => /carrier/.test(item)), "2: HEURISTIC statement excluded");
  assert(!eligible.shippingInformation.some((item) => /\uFFFD/.test(item)), "2: encoding-corrupted statement excluded");
  const destinations = eligible.shippingInformation.filter((item) => /working days/.test(item));
  assert(destinations.length === 3, "2: destination rows kept distinct and exact duplicates removed");
  assert(eligible.shippingInformation.filter((item) => /48 hours/.test(item)).length === 1, "2: repeated tracking fact deduplicated");
}

// 3. Projection: guarantee owns money-back; returns keep procedure; no fragments.
{
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const returnsClaims = projection.claims.filter((claim) => claim.field === "returnsInformation");
  const moneyBack = returnsClaims.find((claim) => /money back/.test(claim.sourceText));
  assert(Boolean(moneyBack) && !moneyBack?.generationAuthorized, "3: money-back wording in returns is not authorized (guarantee owns it)");
  const processing = returnsClaims.find((claim) => /4 to 8 days/.test(claim.sourceText));
  assert(Boolean(processing?.generationAuthorized) && processing?.claimClass === "RETURNS", "3: 'take a while' idiom is not usage; processing time kept");
  assert(returnsClaims.every((claim) => !claim.generationAuthorized || claim.generationText === claim.sourceText), "3: operational statements are not split into fragments");
  const firewall = closedClaimFirewall(projection, plan);
  assert(firewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0, "3: firewall has no visible closed claims");
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  const returnsSlot = slotPlan.slots.find((slot) => slot.type === "RETURNS");
  const shippingSlot = slotPlan.slots.find((slot) => slot.type === "SHIPPING");
  assert(Boolean(returnsSlot) && returnsSlot?.required === false, "3: RETURNS slot is optional");
  assert(Boolean(shippingSlot) && shippingSlot?.required === false, "3: SHIPPING slot is optional");
  assert(collectSlotProjectionViolations(slotPlan.slots).length === 0, "3: slot isolation holds (return shipping is not shipping topic)");
}

// 4. Grounding: fees and windows bind to operational evidence; no strengthening.
{
  const ok = validateGrounding("Shipping to Canada costs $12.50 and takes 8-12 working days.", facts);
  assert(!ok.unsupportedClaims.some((item) => item.severity === "hard"), "4: shipping fee grounded by shipping evidence");
  const noShipping = validateGrounding("Shipping to Canada costs $12.50 and takes 8-12 working days.", base());
  assert(noShipping.unsupportedClaims.some((item) => /price claim/.test(item.reason)), "4: fee without shipping evidence is unsupported");
  const only = validateGrounding("Shipping to Canada is only $12.50.", facts);
  assert(only.unsupportedClaims.some((item) => /strengthened/.test(item.reason)), "4: 'only $X' is blocked");
  const guaranteed = validateGrounding("Domestic orders have guaranteed delivery in 3-5 working days.", facts);
  assert(guaranteed.unsupportedClaims.some((item) => /strengthened/.test(item.reason)), "4: guaranteed delivery is blocked");
  const riskFree = validateGrounding("Returns are risk-free and hassle-free.", facts);
  assert(riskFree.unsupportedClaims.some((item) => /strengthened/.test(item.reason)), "4: risk-free / hassle-free returns are blocked");
  const returnWindow = expanded();
  returnWindow.guaranteeInformation = undefined;
  returnWindow.confidence.guaranteeInformation = "NOT_FOUND";
  const bound = validateGrounding("You have 45 days from delivery to request a refund.", returnWindow);
  assert(!bound.unsupportedClaims.some((item) => /guarantee duration/.test(item.reason)), "4: return window binds to returns evidence");
  const unbound = validateGrounding("You have 90 days from delivery to request a refund.", returnWindow);
  assert(unbound.unsupportedClaims.some((item) => item.severity === "hard"), "4: a different window is unsupported");
}

// 5. Format: small attribute, FAQ only when not already stated by usage.
{
  const withFormat = expanded();
  withFormat.productFormat = {
    value: "kettle",
    statement: "Each Larkspur Field Kettle is a one-litre stovetop kettle.",
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: URL_A,
    sourcePageCategory: "PRIMARY",
  };
  const plan = createGenerationPlan(withFormat);
  assert(plan.allowedTopics.includes("product_format"), "5: product_format OPEN with explicit evidence");
  assert(!plan.authorizedBlocks.some((block) => /FORMAT/.test(block)), "5: no standalone format section");
  const slotPlan = createEvidenceSlotPlan(withFormat);
  const faq = slotPlan.slots.find((slot) => slot.type === "FAQ" && slot.topic === "product_format");
  assert(Boolean(faq), "5: format realized as a compact FAQ");
  const question = faq ? deterministicFaqQuestion(faq, NAME) : null;
  assert(question === `What form does ${NAME} come in?`, "5: deterministic neutral format question");
  const validation = faq && question
    ? validateFaqQuestion({
        question,
        topic: faq.topic,
        field: faq.evidence[0]?.field,
        semanticAuthority: faq.semanticAuthority,
        authorizedTopics: [faq.topic],
        slotId: faq.slotId,
        closedTopics: plan.closedTopics,
        supportText: faq.evidence.map((item) => item.value).join("\n"),
        productName: NAME,
      })
    : null;
  assert(validation?.semanticResult === "PASS", "5: format question passes semantic validation");

  const duplicate = expanded();
  duplicate.productFormat = { ...withFormat.productFormat, statement: duplicate.usageInformation[0] as string };
  const dupPlan = createEvidenceSlotPlan(duplicate);
  assert(!dupPlan.slots.some((slot) => slot.topic === "product_format"), "5: format already stated by usage is not repeated");
}

// 6. Usage precision: idiom vs instruction.
assert(usageInstructionSpans("It may take a while to arrive.").length === 0, "6: 'take a while' is not a usage instruction");
assert(usageInstructionSpans("Take a tablet each morning.").length > 0, "6: 'take a tablet' is still a usage instruction");

console.log("ALL GENERATION TOPIC V2 TESTS PASSED");
