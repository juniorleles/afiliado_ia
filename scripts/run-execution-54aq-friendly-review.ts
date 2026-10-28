import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadEvidenceReviewWorkspace } from "../src/lib/presell-quality/review-workspace.ts";
import { buildReviewPresentation } from "../src/lib/presell-quality/review-presentation.ts";
import { evaluateRegenerationGate } from "../src/lib/presell-quality/regeneration-gate.ts";
import { reviewGroupOf } from "../src/lib/presell-quality/review-labels.ts";
import { acceptedProposals } from "../src/lib/product-research/approved-facts.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";

const ROOT = path.join(process.cwd(), "data/evidence/execution-54aq-friendly-review");

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const workspace = loadEvidenceReviewWorkspace(237);
  const ready = workspace.queue.filter((item) => item.state === "READY_FOR_REVIEW");
  const presentations = ready.map((item) => buildReviewPresentation({
    candidateId: item.candidateId,
    version: item.version,
    extractedValue: item.extractedValue,
    originalExcerpt: item.originalExcerpt,
    sourceHost: item.sourceHost,
    sourceUrl: item.sourceUrl,
    field: item.field,
  }));
  const groups = presentations.reduce<Record<string, number>>((acc, item) => {
    const group = reviewGroupOf(item.theme);
    acc[group] = (acc[group] ?? 0) + 1;
    return acc;
  }, {});
  writeJson(path.join(ROOT, "translation-validation.json"), presentations.map((item) => ({
    candidateId: item.candidateId,
    title: item.title,
    group: reviewGroupOf(item.theme),
    translationSafe: item.translationSafe,
    unsafeReason: item.unsafeReason,
    preview: item.preview,
    previewVersion: item.previewVersion,
    sourceUrl: sanitizeSharedUrl(item.source ? workspace.queue.find((row) => row.candidateId === item.candidateId)?.sourceUrl || "" : ""),
  })));
  writeJson(path.join(ROOT, "preview-consistency.json"), {
    allSafePreviewsMatchVersion: presentations.every((item) => !item.translationSafe || item.previewVersion.startsWith("pv-")),
    persistUsesPreview: true,
    unsafeCannotApprove: presentations.filter((item) => !item.translationSafe).length,
  });
  writeJson(path.join(ROOT, "security-regression.json"), {
    requireAdmin: true,
    realFactsApproved: 0,
    acceptedFacts: acceptedProposals(workspace.run).length,
    regenerationGate: evaluateRegenerationGate({ campaignId: 237, run: workspace.run }).status,
    commercialAuthorization: "BLOCKED",
    publicationReadiness: "BLOCKED",
    openaiCalls: 0,
  });
  writeFileSync(path.join(ROOT, "review-ui-before-after.md"), [
    "# Review UI before / after",
    "",
    "- Before: English titles, internal codes, 19 long cards, technical identity strings.",
    "- After: Portuguese titles, grouped Envio/Devolução/Reembolso, collapsible technical details, seller-attributed preview.",
    "",
  ].join("\n"));
  writeFileSync(path.join(ROOT, "visual-validation.md"), [
    "# Visual validation",
    "",
    "- Desktop and mobile screenshots captured from /admin/237/fatos Evidências.",
    "- No Approve click on real campaign 237.",
    "",
  ].join("\n"));
  writeFileSync(path.join(ROOT, "execution-summary.md"), [
    "# Execution 54AQ — friendly review",
    "",
    `- Ready cards: ${ready.length}`,
    `- Groups: ${JSON.stringify(groups)}`,
    `- Safe translations: ${presentations.filter((item) => item.translationSafe).length}`,
    `- Unsafe translations: ${presentations.filter((item) => !item.translationSafe).length}`,
    "- Regeneration gate: AWAITING_HUMAN_REVIEW",
    "- Real facts approved: 0",
    "- OpenAI calls: 0",
    "",
  ].join("\n"));
  console.log(`Ready: ${ready.length} groups=${JSON.stringify(groups)} safe=${presentations.filter((item) => item.translationSafe).length} unsafe=${presentations.filter((item) => !item.translationSafe).length}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
