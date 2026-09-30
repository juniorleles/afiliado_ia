// npx tsx scripts/test-optional-final-thoughts.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { applyGenericFaqRecovery } from "../src/lib/faq-field-promotion.ts";
import {
  buildGenerationFactManifest,
  emptyProductFacts,
  type ProductFacts,
} from "../src/lib/product-facts.ts";
import { createGenerationPlan } from "../src/lib/ai/generation-plan.ts";
import { projectEvidenceClaims } from "../src/lib/ai/claim-projection.ts";
import { createEvidenceSlotPlan, PRIMARY_FACTUAL_BODY_SLOT_TYPES } from "../src/lib/ai/evidence-slot-plan.ts";
import { propositionsForSlot, validatePropositionBindings } from "../src/lib/ai/authorized-propositions.ts";
import { validateStructuredPage, type StructuredGenerationPage } from "../src/lib/ai/structured-generation.ts";
import { lintCampaign } from "../src/lib/policy-linter.ts";
import type { Campaign } from "../src/lib/campaigns.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const recovered = applyGenericFaqRecovery(
  JSON.parse(
    readFileSync(path.join(process.cwd(), "data/controlled-ready-13/2026-09-21-controlled-visual-13/import-facts.json"), "utf8"),
  ) as ProductFacts,
);
const plan = createGenerationPlan(recovered);
const manifest = buildGenerationFactManifest(recovered);
const projection = projectEvidenceClaims(recovered, plan, manifest);
const slotPlan = createEvidenceSlotPlan(recovered, plan, manifest, projection);
const featureSlots = slotPlan.slots.filter((slot) => slot.type === "FEATURE");
const closing = slotPlan.slots.find((slot) => slot.type === "FINAL_THOUGHTS");
const featurePropositions = featureSlots.flatMap((slot) => propositionsForSlot(slot).map((item) => item.propositionId));
const featureEvidence = new Set(featureSlots.flatMap((slot) => slot.allowedEvidenceIds));

assert(plan.generationRoute === "MODEL", "recovered facts stay MODEL");
assert(featureSlots.length === 2, "feature slots still own both feature items");
assert(!closing, "FINAL_THOUGHTS slot omitted when its propositions are already in the body");
assert(
  featurePropositions.length > 0 && new Set(featurePropositions).size === featurePropositions.length,
  "feature propositions stay on their feature slots",
);
assert(
  !slotPlan.slots.some(
    (slot) => slot.type === "FINAL_THOUGHTS" && slot.allowedEvidenceIds.some((id) => featureEvidence.has(id)),
  ),
  "feature evidence is not copied into FINAL_THOUGHTS",
);

const stub: StructuredGenerationPage = {
  headline: { text: "Joint Genesis", evidenceIds: [] },
  summary: { text: "Joint Genesis supports lubrication, flexibility and comfortable movement.", evidenceIds: [] },
  blocks: [
    {
      id: "B001",
      type: "OVERVIEW",
      evidenceIds: [],
      content: "Joint Genesis supports lubrication, flexibility and comfortable movement.",
    },
  ],
  cta: { label: "Learn More" },
};
const derived = validateStructuredPage(stub, recovered);
assert(
  !derived.violations.some((item) => item.reason === "required FINAL_THOUGHTS block is missing"),
  "page validator does not require an omitted FINAL_THOUGHTS slot",
);

const facts = emptyProductFacts("Sample Daily", "https://example.test/sample-daily", "IMPORTED");
facts.description = "Sample Daily supports daytime comfort.";
facts.confidence.description = "DIRECT_SOURCE";
facts.usageInformation = ["Take one tablet with water."];
facts.confidence.usageInformation = "DIRECT_SOURCE";
facts.confidence.features = "NOT_FOUND";
facts.confidence.ingredientsOrComponents = "NOT_FOUND";
facts.confidence.cautions = "NOT_FOUND";
facts.confidence.pricingInformation = "NOT_FOUND";
facts.confidence.guaranteeInformation = "NOT_FOUND";
facts.confidence.manufacturer = "NOT_FOUND";
facts.importQuality = "PARTIAL";
const distinctPlan = createGenerationPlan(facts);
const distinctManifest = buildGenerationFactManifest(facts);
const extraId = "F099";
const withExtra = {
  ...distinctManifest,
  items: [
    ...distinctManifest.items,
    {
      id: extraId,
      field: "description",
      value: "Sample Daily supports evening flexibility.",
      provenance: "DIRECT_SOURCE" as const,
      sourceUrl: facts.sourceUrl,
      copyEligible: true,
    },
  ],
};
const distinctProjection = projectEvidenceClaims(facts, distinctPlan, withExtra);
const distinctSlots = createEvidenceSlotPlan(facts, distinctPlan, withExtra, distinctProjection);
const distinctClosing = distinctSlots.slots.find((slot) => slot.type === "FINAL_THOUGHTS");
const bodyIds = new Set(
  distinctSlots.slots
    .filter((slot) => (PRIMARY_FACTUAL_BODY_SLOT_TYPES as readonly string[]).includes(slot.type))
    .flatMap((slot) => propositionsForSlot(slot).map((item) => item.propositionId)),
);
const closingIds = distinctClosing ? propositionsForSlot(distinctClosing).map((item) => item.propositionId) : [];
assert(distinctPlan.generationRoute === "MODEL", "distinct fixture is MODEL");
assert(Boolean(distinctClosing), "FINAL_THOUGHTS slot created for an unassigned proposition");
assert(distinctClosing?.allowedEvidenceIds.join(",") === extraId, "closing slot receives only the unassigned description");
assert(closingIds.length > 0 && closingIds.every((id) => !bodyIds.has(id)), "closing propositions are absent from primary body slots");

function page(includeClosing: boolean): StructuredGenerationPage {
  return {
    headline: { text: "Sample Daily", evidenceIds: [] },
    summary: { text: "Sample Daily supports daytime comfort.", evidenceIds: [] },
    blocks: [
      {
        id: "B001",
        type: "OVERVIEW",
        evidenceIds: [],
        content: "Sample Daily supports daytime comfort.",
      },
      {
        id: "B002",
        type: "USAGE",
        evidenceIds: [],
        content: "Take one tablet with water.",
      },
      ...(includeClosing
        ? [
            {
              id: "B003",
              type: "FINAL_THOUGHTS",
              evidenceIds: [extraId],
              content: "Sample Daily supports evening flexibility.",
            },
          ]
        : []),
    ],
    cta: { label: "Learn More" },
  };
}
const missing = validateStructuredPage(page(false), facts, distinctSlots);
const present = validateStructuredPage(page(true), facts, distinctSlots);
assert(
  missing.violations.some((item) => item.reason === "required FINAL_THOUGHTS block is missing"),
  "omitting a planned FINAL_THOUGHTS block fails validation",
);
assert(
  !present.violations.some((item) => item.reason === "required FINAL_THOUGHTS block is missing"),
  "a planned FINAL_THOUGHTS block satisfies validation",
);

const faq = slotPlan.slots.find(
  (slot) =>
    slot.type === "FAQ" &&
    propositionsForSlot(slot).some((item) => featurePropositions.includes(item.propositionId)),
);
const feature = featureSlots.find((slot) =>
  propositionsForSlot(slot).some((item) =>
    faq ? propositionsForSlot(faq).some((row) => row.propositionId === item.propositionId) : false,
  ),
);
if (!faq || !feature || faq.type !== "FAQ") throw new Error("expected FAQ reuse of a feature proposition");
const shared = propositionsForSlot(faq).find((item) => featurePropositions.includes(item.propositionId));
if (!shared) throw new Error("shared proposition missing");
const faqBinding = validatePropositionBindings({
  fill: { slotId: faq.slotId, question: "What is described?", answerPropositions: [{ propositionIds: [shared.propositionId], wording: shared.sourceText }] },
  slot: faq,
  slots: slotPlan.slots,
  plan,
  productName: recovered.productName,
});
const featureBinding = validatePropositionBindings({
  fill: { slotId: feature.slotId, propositions: [{ propositionIds: [shared.propositionId], wording: shared.sourceText }] },
  slot: feature,
  slots: slotPlan.slots,
  plan,
  productName: recovered.productName,
});
const overview = slotPlan.slots.find((slot) => slot.type === "OVERVIEW");
if (!overview) throw new Error("overview missing");
const stolen = validatePropositionBindings({
  fill: { slotId: overview.slotId, propositions: [{ propositionIds: [shared.propositionId], wording: shared.sourceText }] },
  slot: overview,
  slots: slotPlan.slots,
  plan,
  productName: recovered.productName,
});
assert(faqBinding.length === 0, "FAQ may cite a proposition its slot already owns");
assert(featureBinding.length === 0, "feature slot may cite the same proposition");
assert(stolen.some((item) => item.reason === "CROSS_SLOT_PROPOSITION"), "a body slot cannot cite a proposition it does not own");

const thin = emptyProductFacts("Thin Sample", "https://example.test/thin-sample", "IMPORTED");
thin.description = "Thin Sample supports daily comfort.";
thin.confidence.description = "DIRECT_SOURCE";
thin.features = ["Thin Sample focuses on a simple daily routine."];
thin.confidence.features = "DIRECT_SOURCE";
thin.confidence.ingredientsOrComponents = "NOT_FOUND";
thin.confidence.usageInformation = "NOT_FOUND";
thin.confidence.cautions = "NOT_FOUND";
thin.confidence.pricingInformation = "NOT_FOUND";
thin.confidence.guaranteeInformation = "NOT_FOUND";
thin.confidence.manufacturer = "NOT_FOUND";
thin.importQuality = "PARTIAL";
const thinPlan = createGenerationPlan(thin);
const thinSlots = createEvidenceSlotPlan(thin);
assert(thinPlan.generationRoute === "DETERMINISTIC_THIN", "thin route unchanged");
assert(thinSlots.slots.find((slot) => slot.type === "FINAL_THOUGHTS")?.required === false, "thin FINAL_THOUGHTS stays optional");

const sentence = "Joint Genesis focuses on steady joint wellness rather than dramatic overnight promises.";
const campaign = {
  id: 0,
  name: "Sample",
  slug: "sample",
  headline: "Sample",
  body: `${sentence}\n\n${sentence}`,
  ctaLabel: "Learn More",
  affiliateUrl: "https://example.com/hop",
  headScript: null,
  adHeadline: null,
  publicationStatus: "draft",
  publishedAt: null,
  createdAt: "",
  updatedAt: "",
} as Campaign;
const repeated = lintCampaign(campaign).findings.find((item) => item.ruleId === "content.repetition");
const once = lintCampaign({ ...campaign, body: sentence }).findings.find((item) => item.ruleId === "content.repetition");
assert(repeated?.status === "warn", "content.repetition still warns on an exact duplicate");
assert(once?.status === "pass", "content.repetition still passes a single sentence");

console.log("FEATURE_PROPOSITIONS=" + featurePropositions.join(","));
console.log("FINAL_THOUGHTS_DISTINCT_PROPOSITIONS=0");
console.log("DISTINCT_CLOSING_PROPOSITIONS=" + closingIds.join(","));
console.log("PRIMARY_BODY_SLOT_TYPES=" + PRIMARY_FACTUAL_BODY_SLOT_TYPES.join(","));
console.log("ANTHROPIC_CALLS=0");
console.log("OPTIONAL_FINAL_THOUGHTS_V1=PASS");
