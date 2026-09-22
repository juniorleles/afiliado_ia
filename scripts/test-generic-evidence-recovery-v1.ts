// npx tsx scripts/test-generic-evidence-recovery-v1.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractProductFacts } from "../src/lib/import-product.ts";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import { isFactualGuarantee, isPolicyNavigationCta } from "../src/lib/import-heuristics.ts";
import {
  buildGenerationFactManifest,
  getConsumerCopyEligibleFacts,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function page(inner: string): string {
  return `<html><head>
<meta name="description" content="A daily wellness supplement with a documented formula." />
</head><body>
<h1>Sample Wellness Capsule</h1>
${inner}
</body></html>`;
}

const a = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>How should I use it? Take one capsule daily with water.</li>
</ul>
`),
);
assert(a.usageInformation.some((u) => /take one capsule daily with water/i.test(u)), "A: USAGE promoted");
assert(a.confidence.usageInformation === "DIRECT_SOURCE", "A: USAGE DIRECT_SOURCE");
assert(
  a.sourceSnippets.some((s) => s.field === "usageInformation" && /how should i use it/i.test(s.question ?? "")),
  "A: usage snippet retains question context",
);

const b = extractProductFacts(
  page(`
<h2>Frequently Asked Questions</h2>
<p>When should I take the product?</p>
<p>Take two tablets each morning.</p>
`),
);
assert(b.usageInformation.some((u) => /take two tablets each morning/i.test(u)), "B: generic FAQ heading still promotes USAGE");

const c = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>How many servings are in the bottle? 30 servings.</li>
</ul>
`),
);
assert(!c.usageInformation.some((u) => /30 servings/i.test(u)), "C: serving count is not a usage instruction");
assert(c.usageInformation.length === 0, "C: no usage promotion");

const d = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>What is the return policy? Returns are accepted within 60 days of purchase.</li>
</ul>
`),
);
assert(/returns are accepted within 60 days/i.test(d.guaranteeInformation ?? ""), "D: return policy promoted");
assert(!/money-back/i.test(d.guaranteeInformation ?? ""), "D: terminology preserved (not rewritten to money-back)");
assert(d.confidence.guaranteeInformation === "DIRECT_SOURCE", "D: guarantee DIRECT_SOURCE");

const e = extractProductFacts(
  page(`
<p>Read our full refund policy</p>
<h2>FAQ</h2>
<ul>
  <li>What is the return policy? Returns are accepted within 60 days.</li>
</ul>
`),
);
assert(/returns are accepted within 60 days/i.test(e.guaranteeInformation ?? ""), "E: FAQ substantive policy wins");
assert(!/read our full refund policy/i.test(e.guaranteeInformation ?? ""), "E: CTA is not the guarantee fact");
assert(isPolicyNavigationCta("Read our full refund policy"), "E: CTA classifier recognizes navigation policy text");

const f = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>What is the return policy? 60-day return policy.</li>
</ul>
`),
);
assert(/60-day return policy/i.test(f.guaranteeInformation ?? ""), "F: 60-day return policy captured");
assert(!/money-back guarantee/i.test(f.guaranteeInformation ?? ""), "F: return policy is not strengthened into money-back guarantee");
assert(!/satisfaction/i.test(f.guaranteeInformation ?? ""), "F: satisfaction language is not invented");

const labeledPolicy = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>What is the return policy? Store confidence note: Returns are accepted within 45 days of purchase.</li>
</ul>
`),
);
assert(
  /returns are accepted within 45 days/i.test(labeledPolicy.guaranteeInformation ?? ""),
  "FAQ label prefix peel keeps the factual policy",
);
assert(
  !/store confidence note/i.test(labeledPolicy.guaranteeInformation ?? ""),
  "non-policy FAQ label is not stored as the guarantee fact",
);

const g = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>Who provides customer support? Support is provided by Company Alpha.</li>
</ul>
`),
);
assert(!g.manufacturer || !/company alpha/i.test(g.manufacturer), "G: support provider is not manufacturer");
assert(
  g.importWarnings.some((w) => /SCHEMA_RELATIONSHIP_LIMITATION/i.test(w)),
  "G: SCHEMA_RELATIONSHIP_LIMITATION reported",
);

const h = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>Who manufactures the product? The product is manufactured by Company Beta.</li>
</ul>
`),
);
assert(/company beta/i.test(h.manufacturer ?? ""), "H: explicit manufacturer may be promoted");
assert(/manufactured by/i.test(h.manufacturer ?? ""), "H: manufacturer relationship preserved");
assert(h.confidence.manufacturer === "DIRECT_SOURCE", "H: manufacturer DIRECT_SOURCE");

const i = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>What ingredients are included? Contains Ingredient A and Ingredient B.</li>
</ul>
`),
);
assert(i.ingredientsOrComponents.length === 0, "I: ingredients stay closed");
assert(i.confidence.ingredientsOrComponents === "NOT_FOUND", "I: ingredients provenance stays NOT_FOUND");

const j = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>Where is it produced? Produced in an FDA-inspected facility.</li>
</ul>
`),
);
assert(!j.manufacturer, "J: FDA facility text is not manufacturer identity");
assert(j.cautions.length === 0, "J: authority language is not promoted as a caution");
assert(!j.guaranteeInformation, "J: authority language is not a guarantee");

const k = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>Does it contain allergens? It is allergen-free.</li>
</ul>
`),
);
assert(k.cautions.length === 0, "K: absence claims stay closed");
assert(k.ingredientsOrComponents.length === 0, "K: allergen-free is not an ingredient");

const l = extractProductFacts(
  page(`
<h2>FAQ</h2>
<ul>
  <li>Is it easy to use? Designed for daily routines.</li>
</ul>
`),
);
assert(l.usageInformation.length === 0, "L: ambiguous ease-of-use is not a usage instruction");

const libFiles = [
  "src/lib/faq-field-promotion.ts",
  "src/lib/import-heuristics.ts",
  "src/lib/import-product.ts",
];
for (const rel of libFiles) {
  const src = readFileSync(path.join(process.cwd(), rel), "utf8");
  assert(!/Joint Genesis/i.test(src), `${rel} has no Joint Genesis extraction rule`);
  assert(!/Mobilee/i.test(src), `${rel} has no Mobilee extraction rule`);
  assert(!/BioDynamix/i.test(src), `${rel} has no BioDynamix extraction rule`);
  assert(!/180-day/i.test(src), `${rel} has no 180-day extraction rule`);
}

const before = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"),
    "utf8",
  ),
) as ProductFacts;
const after = applyGenericFaqRecovery(before);

assert(after.productName === before.productName, "replay preserves product name");
assert(after.description === before.description, "replay preserves description");
assert(JSON.stringify(after.features) === JSON.stringify(before.features), "replay preserves features");
assert(
  JSON.stringify(after.ingredientsOrComponents) === JSON.stringify(before.ingredientsOrComponents),
  "replay does not open ingredients",
);
assert(after.cautions.length === 0, "replay does not promote cautions/absence claims");
assert(after.usageInformation.some((u) => /take one capsule daily with water/i.test(u)), "replay recovers usage");
assert(after.confidence.usageInformation === "DIRECT_SOURCE", "replay usage provenance DIRECT_SOURCE");
assert(/180-day return policy/i.test(after.guaranteeInformation ?? ""), "replay recovers return policy");
assert(!/meaningful/i.test(after.guaranteeInformation ?? ""), "replay does not keep the FAQ evaluative label in the fact");
assert(!/buyer protection/i.test(after.guaranteeInformation ?? ""), "replay does not store buyer-protection characterization as the policy");
assert(!/money-back guarantee/i.test(after.guaranteeInformation ?? ""), "replay does not strengthen return policy");
assert(!/read the full refund policy/i.test(after.guaranteeInformation ?? ""), "replay CTA does not remain guarantee");
assert(after.confidence.guaranteeInformation === "DIRECT_SOURCE", "replay guarantee provenance DIRECT_SOURCE");
assert(!after.manufacturer, "replay does not mislabel support provider as manufacturer");
assert(
  after.importWarnings.some((w) => /SCHEMA_RELATIONSHIP_LIMITATION/i.test(w)),
  "replay reports SCHEMA_RELATIONSHIP_LIMITATION for support provider",
);
assert(!after.sourceSnippets.some((s) => /fda/i.test(s.field) && s.field !== "faq"), "replay does not promote FDA out of FAQ");

const planBefore = createGenerationPlan(before);
const planAfter = createGenerationPlan(after);
const eligibleBefore = getConsumerCopyEligibleFacts(before);
const eligibleAfter = getConsumerCopyEligibleFacts(after);
const manifestBefore = buildGenerationFactManifest(before);
const manifestAfter = buildGenerationFactManifest(after);
const projectionAfter = projectEvidenceClaims(after, planAfter);

assert(planBefore.coverage === "THIN", "coverage before is THIN");
assert(["ADEQUATE", "RICH"].includes(planAfter.coverage), "coverage after opens extra copy-eligible fields");
assert(eligibleBefore.usageInformation.length === 0, "usage was not copy-eligible before");
assert(eligibleAfter.usageInformation.length > 0, "usage is copy-eligible after");
assert(!eligibleBefore.guaranteeInformation, "guarantee was not copy-eligible before");
assert(Boolean(eligibleAfter.guaranteeInformation), "guarantee is copy-eligible after");
assert(manifestAfter.items.filter((item) => item.copyEligible).length > manifestBefore.items.filter((item) => item.copyEligible).length, "copy-eligible fact count increased");
assert(planAfter.allowedTopics.includes("usage"), "usage topic opens after recovery");
assert(planAfter.allowedTopics.includes("guarantee"), "guarantee topic opens after recovery");
assert(planAfter.closedTopics.includes("ingredients"), "ingredients topic stays closed");
assert(planAfter.closedTopics.includes("manufacturer"), "manufacturer topic stays closed");
assert(planAfter.generationRoute === "DETERMINISTIC_THIN" || planAfter.generationRoute === "MODEL", "generation route enum unchanged");
assert(projectionAfter.claims.length > 0, "claim projection still runs on recovered facts");
assert(isFactualGuarantee(after.guaranteeInformation ?? ""), "recovered guarantee remains a factual seller policy");

console.log("COVERAGE_BEFORE", planBefore.coverage);
console.log("COVERAGE_AFTER", planAfter.coverage);
console.log("COPY_ELIGIBLE_FACTS_BEFORE", manifestBefore.items.filter((item) => item.copyEligible).length);
console.log("COPY_ELIGIBLE_FACTS_AFTER", manifestAfter.items.filter((item) => item.copyEligible).length);
console.log("OPEN_TOPICS_BEFORE", planBefore.allowedTopics.join(","));
console.log("OPEN_TOPICS_AFTER", planAfter.allowedTopics.join(","));
console.log("CLOSED_TOPICS_BEFORE", planBefore.closedTopics.join(","));
console.log("CLOSED_TOPICS_AFTER", planAfter.closedTopics.join(","));
console.log("RECOVERED_USAGE", after.usageInformation[0]);
console.log("RECOVERED_GUARANTEE", after.guaranteeInformation);
console.log("GENERATION_ROUTE_AFTER", planAfter.generationRoute);
