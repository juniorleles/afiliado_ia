import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { readLatestProductResearch } from "../src/lib/product-research/store.ts";
import { loadEvidenceReviewWorkspace } from "../src/lib/presell-quality/review-workspace.ts";
import { candidateSupportsGap, primaryOperationalTheme, buildOperationalReviewCard } from "../src/lib/presell-quality/operational-theme.ts";
import { evaluateRegenerationGate, snapshotProductContract } from "../src/lib/presell-quality/regeneration-gate.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";

const ROOT = path.join(process.cwd(), "data/evidence/execution-54ap-approval-regeneration");

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const campaignId = 237;
  const run = readLatestProductResearch(campaignId);
  const accepted = acceptedProposals(run);
  snapshotProductContract({ campaignId, run, reason: "54ap-before-human-review" });
  const workspace = loadEvidenceReviewWorkspace(campaignId);
  const ready = workspace.queue.filter((item) => item.state === "READY_FOR_REVIEW");
  const audit = ready.map((item) => {
    const card = buildOperationalReviewCard(item);
    return {
      candidateId: item.candidateId,
      field: item.field,
      theme: card.theme,
      title: card.title,
      summary: card.summary,
      originalExcerpt: item.originalExcerpt,
      sourceUrl: sanitizeSharedUrl(item.sourceUrl),
      sourceHost: item.sourceHost,
      declarationType: card.declarationType,
      identity: item.sourceIdentity,
      conditions: card.conditions,
      contradictions: item.blocker,
      relevance: card.pageUse,
      eligibility: item.state,
      eligible: item.eligible,
      supports: {
        quantity: candidateSupportsGap("quantity", item),
        shipping: candidateSupportsGap("shipping", item),
        returnsProcess: candidateSupportsGap("returnsProcess", item),
        sellerContact: candidateSupportsGap("sellerContact", item),
        benefits: candidateSupportsGap("benefits", item),
        faq: candidateSupportsGap("faq", item),
      },
    };
  });
  const clusters = Object.entries(audit.reduce<Record<string, string[]>>((acc, item) => {
    acc[item.theme] = [...(acc[item.theme] ?? []), item.candidateId];
    return acc;
  }, {})).map(([theme, ids]) => ({ theme, candidateIds: ids, count: ids.length }));
  const gaps = workspace.gaps.map((gap) => ({
    field: gap.field,
    relatedCandidateIds: gap.relatedCandidateIds,
    relatedStates: gap.relatedStates,
    resolutionPossible: gap.resolutionPossible,
    requiredNextAction: gap.requiredNextAction,
    falsePositiveGuard: {
      quantityLinkedToShippingOnly: gap.field === "quantity" ? gap.relatedCandidateIds.every((id) => audit.find((item) => item.candidateId === id)?.supports.quantity) : true,
      contactLinkedToReturnsOnly: gap.field === "sellerContact" ? gap.relatedCandidateIds.every((id) => audit.find((item) => item.candidateId === id)?.supports.sellerContact) : true,
    },
  }));
  const gate = evaluateRegenerationGate({ campaignId, run });
  const generationPlan = {
    referenceGeneration: "lp-mvr3pp2f-ea2a99d2",
    referenceExecution: "54AJ",
    referenceScore: 82,
    discardedReference: "54AK evaluator disagreement",
    executed: false,
    reason: gate.status,
    intendedStructure: [
      "Hero with authorized real product image",
      "Approved description, ingredients, usage, and guarantee",
      "Seller-stated shipping and returns only after human approval",
      "Affiliate disclosure",
      "No medical benefits, testimonials, prices, or unverified manufacturer",
    ],
  };
  writeJson(path.join(ROOT, "candidate-audit.json"), { ready: audit.length, clusters, candidates: audit });
  writeJson(path.join(ROOT, "gap-remap.json"), gaps);
  writeJson(path.join(ROOT, "regeneration-gate.json"), gate);
  writeJson(path.join(ROOT, "generation-plan.json"), generationPlan);
  writeJson(path.join(ROOT, "contract-snapshot.json"), {
    accepted: accepted.map((item) => ({
      field: item.field,
      value: item.currentValue || item.suggestedValue,
      sourceUrl: sanitizeSharedUrl(item.sourceUrl || ""),
      verification: item.verification,
    })),
    changed: false,
  });
  writeFileSync(path.join(ROOT, "execution-summary.md"), [
    "# Execution 54AP — evidence approval gate",
    "",
    `- Ready candidates audited: ${audit.length}`,
    `- Clusters: ${clusters.map((item) => `${item.theme}=${item.count}`).join(", ")}`,
    `- Quantity false positives: ${gaps.find((item) => item.field === "quantity")?.relatedCandidateIds.length ?? 0}`,
    `- Contact false positives: ${gaps.find((item) => item.field === "sellerContact")?.relatedCandidateIds.length ?? 0}`,
    `- Regeneration gate: ${gate.status}`,
    `- Real facts approved: 0`,
    `- Product contract changed: no`,
    `- OpenAI calls: 0`,
    `- Next action: human review of READY operational candidates. Do not auto-accept. Do not start research.`,
    "",
  ].join("\n"));
  console.log(`Ready audited: ${audit.length}`);
  console.log(`Themes: ${clusters.map((item) => `${item.theme}:${item.count}`).join(" ")}`);
  console.log(`Gate: ${gate.status}`);
  console.log(primaryOperationalTheme(ready[0]?.extractedValue ?? "", "faq"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
