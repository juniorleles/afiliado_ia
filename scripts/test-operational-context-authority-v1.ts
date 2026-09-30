/**
 * OPERATIONAL CONTEXT AUTHORITY V1 — fictional products only.
 * Inside authorized returns/shipping evidence, operational fees and logistical
 * manufacturer references are not PRICING/MANUFACTURER topics, and returns and
 * shipping may cross-reference. Product-price and manufacturer assertions still block.
 */
import { emptyProductFacts, buildGenerationFactManifest, type ProductFacts, type ReturnsInformationFact, type ShippingInformationFact } from "../src/lib/product-facts.ts";
import { createGenerationPlan, validateGenerationPlan, type GenerationTopic } from "../src/lib/ai/generation-plan.ts";
import { isOperationalContextSlot } from "../src/lib/ai/operational-context.ts";
import { validateSlotFills } from "../src/lib/ai/slot-generation.ts";

const NAME_FOR_PLAN = "Fernwick Trail Flask";
import { closedClaimFirewall, projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan } from "../src/lib/ai/evidence-slot-plan.ts";
import { collectSlotProjectionViolations, slotVisibleTopics, visibleSemanticTopics, type SlotIsolationView } from "../src/lib/ai/slot-projection-isolation.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.log("FALHOU: " + msg);
    return;
  }
  console.log("OK: " + msg);
}

const FIELD: Record<string, string> = { returns: "returnsInformation", shipping: "shippingInformation", features: "features", usage: "usageInformation" };

function slot(topic: GenerationTopic, values: string[], field = FIELD[topic]): SlotIsolationView {
  return {
    slotId: `T-${topic}`,
    topic,
    semanticAuthority: topic.toUpperCase(),
    evidence: values.map((value, index) => ({ id: `F${String(index + 1).padStart(3, "0")}`, field, value })),
  };
}

function violations(view: SlotIsolationView): GenerationTopic[] {
  return collectSlotProjectionViolations([view]).flatMap((item) => item.visibleTopics);
}

// MUST PASS — operational context inside authorized operational evidence.
for (const [topic, text] of [
  ["returns", "Return shipping is at your cost."],
  ["returns", "Do not send the package back to the manufacturer."],
  ["shipping", "A refund is processed after the returned package reaches the facility."],
  ["returns", "Return shipping must be paid by the customer."],
  ["returns", "You must return the item to receive a refund at your cost within 14 days of approval."],
  ["shipping", "Canada: $12.50, 8-12 working days"],
  ["shipping", "Return shipping costs $6.95 and is deducted from your refund."],
] as const) {
  const found = violations(slot(topic, [text]));
  assert(found.length === 0, `PASS ${topic.toUpperCase()}: "${text}" -> [${found.join(",")}]`);
}

// MUST BLOCK — unauthorized assertions inside operational evidence.
for (const [topic, text, expected] of [
  ["returns", "The product costs $69 per bottle.", "pricing"],
  ["shipping", "The product costs $69 per bottle.", "pricing"],
  ["returns", "$69 per bottle.", "pricing"],
  ["returns", "Regular price is $89.", "pricing"],
  ["returns", "Example Labs manufactures the product.", "manufacturer"],
  ["shipping", "The product is manufactured by Example Labs.", "manufacturer"],
  ["returns", "Return shipping is $10 and the product costs $69.", "pricing"],
  ["returns", "Return the package to Example Labs, the manufacturer of the product.", "manufacturer"],
  ["shipping", "Orders ship within 2 business days; it costs $69 per bottle.", "pricing"],
  ["returns", "Returned bottles go to our GMP facility.", "manufacturer"],
] as const) {
  const found = violations(slot(topic, [text]));
  assert(found.includes(expected), `BLOCK ${topic.toUpperCase()}: "${text}" -> [${found.join(",")}]`);
}

// Refund basis uses "price" as the amount returned. That is returns, not an offer.
for (const text of [
  "You will get a full refund on the price of the bottles purchased.",
  "A refund of the purchase price is issued after the return arrives.",
  "We refund the amount paid when the bottles are returned.",
]) {
  const view = slot("returns", [text]);
  const visible = slotVisibleTopics(view);
  const found = violations(view);
  assert(!visible.includes("pricing") && !found.includes("pricing"), `RETURNS ONLY: "${text}" -> visible=[${visible.join(",")}] blocked=[${found.join(",")}]`);
  assert(visible.includes("returns"), `RETURNS ONLY stays returns: "${text}" -> [${visible.join(",")}]`);
}

for (const text of [
  "The price is $49 per bottle.",
  "The package price is $147.",
  "The current price is $59.",
]) {
  const found = violations(slot("returns", [text]));
  assert(found.includes("pricing"), `PRICING: "${text}" -> [${found.join(",")}]`);
}

{
  const text = "The product costs $59 and that purchase price is refundable.";
  const view = slot("returns", [text]);
  const visible = slotVisibleTopics(view);
  const found = violations(view);
  assert(visible.includes("pricing") && visible.includes("returns"), `BOTH: "${text}" -> [${visible.join(",")}]`);
  assert(found.includes("pricing"), `BOTH: offer price inside a returns slot still blocks -> [${found.join(",")}]`);
}

// Mixed evidence in one slot: the operational part does not hide the unauthorized part.
{
  const found = violations(slot("returns", ["Return shipping is at your cost.", "The product costs $69 per bottle."]));
  assert(found.includes("pricing"), `BLOCK mixed items: operational fee + product price -> [${found.join(",")}]`);
}

// Family limits: the family opens only returns/shipping, never other closed topics.
{
  const guarantee = violations(slot("returns", ["Every order has a 60-day money-back guarantee."]));
  assert(guarantee.includes("guarantee"), `BLOCK RETURNS: guarantee wording is not opened by the family -> [${guarantee.join(",")}]`);
  const usage = violations(slot("shipping", ["Take one capsule daily with water."]));
  assert(usage.includes("usage"), `BLOCK SHIPPING: usage wording is not opened by the family -> [${usage.join(",")}]`);
  const foreignField = violations(slot("returns", ["Orders ship worldwide."], "features"));
  assert(foreignField.includes("shipping"), `BLOCK RETURNS: non-operational evidence gets no family compatibility -> [${foreignField.join(",")}]`);
}

// Non-operational slots: lexical detection unchanged.
for (const [topic, text, expected] of [
  ["features", "The price is $69.", "pricing"],
  ["features", "Return shipping is at your cost.", "pricing"],
  ["features", "Do not send the package back to the manufacturer.", "manufacturer"],
  ["features", "A refund is processed after the returned package reaches the facility.", "returns"],
  ["usage", "The manufacturer is Example Labs. The price is $30.", "manufacturer"],
  ["usage", "The manufacturer is Example Labs. The price is $30.", "pricing"],
] as const) {
  const view = slot(topic, [text]);
  const found = violations(view);
  assert(found.includes(expected), `UNCHANGED ${topic.toUpperCase()}: "${text}" -> [${found.join(",")}]`);
  assert(
    JSON.stringify([...slotVisibleTopics(view)].sort()) === JSON.stringify([...visibleSemanticTopics(text)].sort()),
    `UNCHANGED ${topic.toUpperCase()}: slot topics equal lexical topics for "${text}"`,
  );
}

// Grounding still rejects unsupported product prices in generated copy.
function base(): ProductFacts {
  const facts = emptyProductFacts("Fernwick Trail Flask", "https://fernwick.example/flask", "IMPORTED");
  facts.confidence.productName = "DIRECT_SOURCE";
  facts.features = ["Double-Wall Steel", "Leakproof Lid", "Keeps Drinks Cold"];
  facts.confidence.features = "DIRECT_SOURCE";
  facts.importQuality = "SUFFICIENT";
  return facts;
}
const returnsFact = (statement: string): ReturnsInformationFact => ({
  statement,
  kind: "RETURN_CONDITION",
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://fernwick.example/help/returns",
  sourcePageCategory: "RETURNS",
});
const shippingFact = (statement: string): ShippingInformationFact => ({
  statement,
  kind: "PROCESSING",
  provenance: "DIRECT_SOURCE",
  copyEligibility: "YES",
  policyFindings: [],
  sourceUrl: "https://fernwick.example/help/shipping",
  sourcePageCategory: "SHIPPING",
});
{
  const price = validateGrounding("The product costs $69 per bottle.", base());
  assert(price.unsupportedClaims.some((item) => item.severity === "hard"), "GROUNDING: unsupported product price remains a hard failure");
}

// Full pipeline: projection, slot plan, closed-claim firewall.
function pipeline(returns: string[], shipping: string[]) {
  const facts = base();
  facts.returnsInformation = returns.map(returnsFact);
  facts.shippingInformation = shipping.map(shippingFact);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  return { plan, firewall: closedClaimFirewall(projection, plan), violations: collectSlotProjectionViolations(slotPlan.slots) };
}
{
  const ok = pipeline(
    ["Return shipping is at your cost.", "Do not send the package back to the manufacturer.", "Return shipping must be paid by the customer."],
    ["Orders ship within 2 business days.", "A refund is processed after the returned package reaches the facility."],
  );
  assert(ok.plan.closedTopics.includes("pricing") && ok.plan.closedTopics.includes("manufacturer"), "PIPELINE: pricing and manufacturer are CLOSED");
  assert(ok.violations.length === 0, `PIPELINE: operational evidence passes slot isolation -> ${JSON.stringify(ok.violations.map((v) => v.visibleTopics))}`);
  assert(ok.firewall.TOTAL_VISIBLE_CLOSED_CLAIMS === 0, `PIPELINE: firewall sees no closed claim in operational context -> ${ok.firewall.TOTAL_VISIBLE_CLOSED_CLAIMS}`);

  const priced = pipeline(["Return shipping is $10 and the product costs $69."], ["Orders ship within 2 business days."]);
  assert(priced.firewall.PRICING_VISIBLE > 0 && priced.firewall.TOTAL_VISIBLE_CLOSED_CLAIMS > 0, "PIPELINE: firewall still counts a product price inside returns evidence");
  assert(priced.violations.some((v) => v.visibleTopics.includes("pricing")), "PIPELINE: slot isolation still blocks a product price inside returns evidence");

  const maker = pipeline(["Return the package to Example Labs, the manufacturer of the product."], ["Orders ship within 2 business days."]);
  assert(maker.firewall.MANUFACTURER_VISIBLE > 0, "PIPELINE: firewall still counts a manufacturer identity inside returns evidence");
  assert(maker.violations.some((v) => v.visibleTopics.includes("manufacturer")), "PIPELINE: slot isolation still blocks a manufacturer identity inside returns evidence");
}

// POST-MODEL — generated slot copy uses the same operational contract as pre-model.
{
  const facts = base();
  facts.returnsInformation = [
    "Return shipping is at your cost.",
    "Do not send the package back to the manufacturer.",
    "Return shipping must be paid by the customer.",
  ].map(returnsFact);
  facts.shippingInformation = [
    "The returned product must arrive at the fulfillment facility.",
    "A refund is processed after the returned package reaches the facility.",
  ].map(shippingFact);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  const slotOf = (type: string) => slotPlan.slots.find((item) => item.type === type)!;
  const closedHits = (slotId: string, content: string) =>
    validateSlotFills([{ slotId, content }], slotPlan, facts)
      .filter((item) => item.code === "CLOSED_TOPIC" && (item.requiredField === "pricingInformation" || item.requiredField === "manufacturer"))
      .map((item) => (item.requiredField === "pricingInformation" ? "pricing" : "manufacturer"));
  const preModel = (topic: GenerationTopic, text: string) => violations(slot(topic, [text]));

  assert(Boolean(slotOf("RETURNS")) && Boolean(slotOf("SHIPPING")), "POST: fictional RETURNS and SHIPPING slots exist");
  assert(isOperationalContextSlot(slotOf("RETURNS")) && isOperationalContextSlot(slotOf("SHIPPING")), "POST: operational slots use operational context");
  assert(!isOperationalContextSlot(slotOf("FEATURE")), "POST: FEATURE slot does not use operational context");

  for (const [type, topic, text] of [
    ["RETURNS", "returns", "Return shipping is at your cost."],
    ["RETURNS", "returns", "Do not send the package back to the manufacturer."],
    ["SHIPPING", "shipping", "The returned product must arrive at the fulfillment facility."],
    ["SHIPPING", "shipping", "A refund is processed after the returned package reaches the facility."],
    ["RETURNS", "returns", "Return shipping must be paid by the customer."],
  ] as const) {
    const post = closedHits(slotOf(type).slotId, text);
    const pre = preModel(topic, text);
    assert(post.length === 0 && pre.length === 0, `POST PASS ${type}: "${text}" pre=[${pre.join(",")}] post=[${post.join(",")}]`);
  }

  for (const [type, topic, text, expected] of [
    ["RETURNS", "returns", "The product costs $69 per bottle.", "pricing"],
    ["RETURNS", "returns", "Example Labs manufactures the product.", "manufacturer"],
    ["SHIPPING", "shipping", "Return shipping is $10 and the product costs $69.", "pricing"],
    ["SHIPPING", "shipping", "Example Labs is the manufacturer of the product.", "manufacturer"],
    ["RETURNS", "returns", "Return the package to Example Labs, the manufacturer of the product.", "manufacturer"],
  ] as const) {
    const post = closedHits(slotOf(type).slotId, text);
    const pre = preModel(topic, text);
    assert(post.includes(expected) && pre.includes(expected), `POST BLOCK ${type}: "${text}" pre=[${pre.join(",")}] post=[${post.join(",")}]`);
  }

  const featureId = slotOf("FEATURE").slotId;
  for (const [text, expected] of [
    ["Return shipping is at your cost.", "pricing"],
    ["Everything ships from our fulfillment facility.", "manufacturer"],
  ] as const) {
    const post = closedHits(featureId, text);
    assert(post.includes(expected), `POST UNCHANGED FEATURE: "${text}" -> [${post.join(",")}]`);
  }
  for (const text of ["Return shipping is at your cost.", "The returned product must arrive at the fulfillment facility.", "Pricing is not provided."]) {
    const lexical = validateGenerationPlan(text, plan).violations.map((item) => item.topic);
    const explicit = validateGenerationPlan(text, plan, NAME_FOR_PLAN, { operationalSlot: false }).violations.map((item) => item.topic);
    assert(lexical.length > 0 && JSON.stringify(lexical) === JSON.stringify(explicit), `POST UNCHANGED default: "${text}" -> [${lexical.join(",")}]`);
  }
  const absence = validateGenerationPlan("Pricing is not provided.", plan, NAME_FOR_PLAN, { operationalSlot: true }).violations.map((item) => item.topic);
  assert(absence.includes("pricing"), `POST BLOCK operational absence claim: "Pricing is not provided." -> [${absence.join(",")}]`);
}

if (failures > 0) {
  console.log(`OPERATIONAL CONTEXT AUTHORITY V1: ${failures} FAILED`);
  process.exit(1);
}
console.log("ALL OPERATIONAL CONTEXT AUTHORITY V1 TESTS PASSED");
