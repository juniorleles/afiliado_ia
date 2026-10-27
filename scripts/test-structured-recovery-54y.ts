// npx tsx scripts/test-structured-recovery-54y.ts
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignById } from "../src/lib/campaigns.ts";
import { upsertCampaignSource } from "../src/lib/campaign-sources/store.ts";
import { neutralizeEditorialText } from "../src/lib/editorial-neutrality/neutralize.ts";
import { recoverOperationalSegments } from "../src/lib/editorial-neutrality/segment.ts";
import { classifyEditorialText } from "../src/lib/editorial-neutrality/classify.ts";
import { mergeFieldDecisions, derivedNeutralDescription } from "../src/lib/product-research/adapter.ts";
import { applyEditorialRecovery, classifyFaqEntry, factualFaqEligible } from "../src/lib/product-research/recover.ts";
import { productFactsFromAcceptedReview } from "../src/lib/product-research/approved-facts.ts";
import { proposeGalleryKind, decorateDiscoveredAssets, galleryKindFromAsset } from "../src/lib/product-research/asset-display.ts";
import { decideDiscoveredAsset } from "../src/lib/product-research/assets.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { writeProductResearchRun, readProductResearchRun } from "../src/lib/product-research/store.ts";
import { decideProductResearchFields } from "../src/lib/product-research/review.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { runApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readGenerationModel } from "../src/lib/lp-generator/store.ts";
import type { FieldProposal, ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { DiscoveredAffiliateAsset } from "../src/lib/affiliate-policy/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const MIXED = "Take two full droppers every morning and enjoy amazing results.";
const SUGAR_USAGE =
  "Take two full droppers under your tongue in the morning before breakfast... Hold the tincture under your tongue for 30 seconds before swallowing to maximize absorption. If the taste is too potent or prefer another method, dissolve two full droppers in a glass of water and drink it either in one go or split into two servings. You will love the results and feel the difference with each drop.";

function proposal(field: FieldProposal["field"], status: FieldProposal["status"], value: string, extras: Partial<FieldProposal> = {}): FieldProposal {
  return {
    field,
    currentValue: status === "ACCEPTED" ? value : "",
    suggestedValue: value,
    status,
    evidenceIds: value ? [`ev-${field}`] : [],
    sourceUrl: value ? "https://shop.novalis.example/core" : null,
    sourceClass: value ? "OFFICIAL_SALES" : null,
    sourceType: value ? "SALES_PAGE" : null,
    verification: value ? "SELLER_STATED" : null,
    restriction: null,
    collectedAt: "2026-10-26T00:00:00.000Z",
    eligibleForBatch: false,
    notes: [],
    ...extras,
  };
}

function asset(url: string, status: DiscoveredAffiliateAsset["status"], kind: DiscoveredAffiliateAsset["galleryKind"] = "OTHER"): DiscoveredAffiliateAsset {
  return {
    assetUrl: url,
    sourceUrl: "https://shop.novalis.example/core",
    assetType: "IMAGE",
    context: "Public image discovered on a researched page. Approval is still required.",
    declaredAuthorization: "UNSTATED",
    usageRestrictions: [],
    status,
    galleryKind: kind,
    hero: false,
    decidedAt: status === "USER_APPROVED" ? "2026-10-26T00:00:00.000Z" : null,
  };
}

function emptyRun(campaignId: number, productName: string, proposals: FieldProposal[], assets: DiscoveredAffiliateAsset[] = []): ProductResearchRun {
  return {
    version: 1,
    runId: `pr-54y-${campaignId}`,
    campaignId,
    productName,
    status: "COMPLETED",
    stage: "review",
    createdAt: "2026-10-26T00:00:00.000Z",
    startedAt: "2026-10-26T00:00:00.000Z",
    finishedAt: "2026-10-26T00:00:00.000Z",
    seeds: ["https://shop.novalis.example/core"],
    seedRejection: null,
    limitations: [],
    sources: [{ url: "https://shop.novalis.example/core", ok: true, sourceClass: "OFFICIAL_SALES", sourceType: "SALES_PAGE" }],
    coverageTotal: 40,
    coverageMax: 100,
    reviewAccepted: proposals.filter((item) => item.status === "ACCEPTED").length,
    reviewTotal: Math.max(proposals.filter((item) => item.suggestedValue.trim() || item.status === "ACCEPTED").length, 1),
    publicationReadiness: "BLOCKED",
    publicationReason: "Publication approval is human.",
    grounding: "PASS",
    neutrality: "PASS",
    contentQuality: "PASS",
    commercialAuthorization: "BLOCKED",
    proposals,
    decisions: [],
    error: null,
    discoveredAssets: assets,
    evidenceRegistry: {
      entries: [
        { id: "ev-ingredients", field: "INGREDIENTS", originalText: "Harbor leaf", url: "https://shop.novalis.example/core", collectedAt: null, verification: "SELLER_STATED", sourceType: "SALES_PAGE" },
        { id: "ev-howItWorks", field: "HOW_TO_USE", originalText: SUGAR_USAGE, url: "https://shop.novalis.example/core", collectedAt: null, verification: "SELLER_STATED", sourceType: "SALES_PAGE" },
        { id: "ev-faq-health", field: "FAQ", originalText: "Does it treat blood sugar? Clinically proven to treat diabetes.", url: "https://shop.novalis.example/core", collectedAt: null, verification: "PROHIBITED", sourceType: "SALES_PAGE" },
      ],
    },
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const before237 = snapshotProductResearch(237);
  const beforeFacts = (before237.latest?.proposals ?? []).filter((item) => item.status === "ACCEPTED").map((item) => item.field).sort().join(",");
  const beforeAssets = (before237.latest?.discoveredAssets ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.assetUrl).sort().join("|");

  const usageClass = classifyEditorialText({ text: "Take two full droppers under your tongue daily.", role: "USAGE" });
  assert(usageClass.classification === "SELLER_STATED_FACT", "1. usage directions classify as seller-stated, not mechanism-of-action");

  const mixed = recoverOperationalSegments({ text: MIXED, role: "USAGE" });
  assert(mixed.kept.some((item) => /two full droppers every morning/i.test(item.text)), "2. operational clause is kept");
  assert(mixed.omitted.some((item) => /amazing results/i.test(item.text)), "2. promotional clause is omitted");
  assert(mixed.originalText.includes("enjoy amazing results"), "3. original evidence text is preserved");
  assert(mixed.recoveredText.includes("droppers") && !/amazing results/i.test(mixed.recoveredText), "4. recovered text does not invent a new meaning");

  const sugar = recoverOperationalSegments({ text: SUGAR_USAGE, role: "USAGE" });
  assert(/two full droppers/i.test(sugar.recoveredText), "4. Sugar Defender operational remainder stays");
  assert(!/you will love the results/i.test(sugar.recoveredText), "4. promotional tail is not kept");

  const health = neutralizeEditorialText({ text: "Clinically proven to treat diabetes and prevent disease.", role: "FEATURE" });
  assert(health.action === "OMIT" && health.classification === "MEDICAL_OR_HEALTH_CLAIM", "5. health claims are omitted");

  const derived = derivedNeutralDescription({
    productName: "Novalis Core",
    ingredientsText: "Harbor leaf, River malt",
    evidenceNames: ["Harbor leaf", "River malt"],
  });
  assert(/Novalis Core/.test(derived ?? "") && /Harbor leaf/.test(derived ?? "") && !/blood sugar|weight loss|clinically/i.test(derived ?? ""), "6. derived description uses name and composition only");
  assert(derivedNeutralDescription({ productName: "Novalis Core", ingredientsText: "", evidenceNames: [] }) === null, "7. no derived description without composition evidence");

  const faqOps = classifyFaqEntry({ question: "How long is shipping?", answer: "Orders ship within two business days." });
  assert(faqOps === "DELIVERY" && factualFaqEligible(faqOps), "8. factual delivery FAQ is eligible");
  const faqHealth = classifyFaqEntry({ question: "Does it treat blood sugar?", answer: "Clinically proven to treat diabetes." });
  assert(faqHealth === "HEALTH" && !factualFaqEligible(faqHealth), "9. promotional or health FAQ is rejected");

  const pendingRun = emptyRun(0, "Novalis Core", [
    proposal("description", "NOT_FOUND", ""),
    proposal("ingredients", "ACCEPTED", "Harbor leaf, River malt"),
    proposal("howItWorks", "SELLER_STATED", SUGAR_USAGE),
    proposal("benefits", "NOT_FOUND", ""),
    proposal("faq", "NOT_FOUND", ""),
  ], [asset("https://cdn.novalis.example/2bootle-fruits.png", "USER_APPROVED")]);
  const recoveredPending = applyEditorialRecovery(pendingRun);
  const pendingUsage = recoveredPending.proposals.find((item) => item.field === "howItWorks");
  const pendingFacts = productFactsFromAcceptedReview({ run: recoveredPending, productName: "Novalis Core", sourceUrl: "https://shop.novalis.example/core" });
  assert(!pendingFacts.usageInformation.join(" ").includes("droppers"), "10. pending recovered usage is not used in generation facts");
  assert(!pendingFacts.description, "10. pending derived description is not used in generation facts");

  const acceptedClone = {
    ...recoveredPending,
    proposals: recoveredPending.proposals.map((item) =>
      item.field === "howItWorks" ? { ...item, status: "ACCEPTED" as const, currentValue: item.suggestedValue } : item,
    ),
  };
  const acceptedFacts = productFactsFromAcceptedReview({ run: acceptedClone, productName: "Novalis Core", sourceUrl: "https://shop.novalis.example/core" });
  assert(acceptedFacts.usageInformation.join(" ").includes("droppers"), "11. accepted recovered usage is used");
  assert(!acceptedFacts.usageInformation.join(" ").toLowerCase().includes("love the results"), "11. accepted usage still excludes promo");

  const rejected = mergeFieldDecisions(
    [proposal("howItWorks", "REJECTED", SUGAR_USAGE)],
    [proposal("howItWorks", "SELLER_STATED", "Take two full droppers every morning.")],
  );
  assert(rejected[0].status === "REJECTED", "12. rejected usage is not turned into a new pending approval");

  const locked = mergeFieldDecisions(
    [proposal("ingredients", "ACCEPTED", "Harbor leaf, River malt"), proposal("guarantee", "ACCEPTED", "60-day refund")],
    [proposal("ingredients", "SELLER_STATED", "changed"), proposal("guarantee", "SELLER_STATED", "changed")],
  );
  assert(locked.find((item) => item.field === "ingredients")?.suggestedValue === "Harbor leaf, River malt", "13. existing ingredient approval is preserved");
  assert(locked.find((item) => item.field === "guarantee")?.status === "ACCEPTED", "13. existing guarantee approval is preserved");

  const bottle = decorateDiscoveredAssets([asset("https://cdn.novalis.example/2bootle-fruits.png", "USER_APPROVED")])[0];
  assert(bottle.galleryKind === "OTHER", "14. approved bottle image stays OTHER without a human kind confirmation");
  assert(bottle.kindProposal?.proposedKind === "PRODUCT_PACKSHOT" && bottle.kindProposal.status === "PENDING", "15. packshot classification is proposed, not applied");
  assert(galleryKindFromAsset(bottle) !== "PRODUCT_PACKSHOT" || bottle.galleryKind === "OTHER", "16. visual class does not auto-promote the misspelled bottle filename");
  assert(proposeGalleryKind({ ...bottle, galleryKind: "PRODUCT_PACKSHOT" }) === null, "16. already-packshot images do not get a new auto proposal");

  const isolatedA = createCampaign({
    name: "Novalis 54Y A",
    slug: `novalis-54y-a-${Date.now()}`,
    headline: "Novalis 54Y A",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  const isolatedB = createCampaign({
    name: "Novalis 54Y B",
    slug: `novalis-54y-b-${Date.now()}`,
    headline: "Novalis 54Y B",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  upsertCampaignSource(isolatedA.id, "SALES_PAGE", "https://shop.novalis.example/core");
  const runA = writeProductResearchRun(emptyRun(isolatedA.id, "Novalis Core", [
    proposal("description", "NOT_FOUND", ""),
    proposal("ingredients", "ACCEPTED", "Harbor leaf"),
    proposal("howItWorks", "SELLER_STATED", SUGAR_USAGE),
    proposal("faq", "NOT_FOUND", ""),
    proposal("guarantee", "ACCEPTED", "60-day refund"),
  ], [
    asset("https://cdn.novalis.example/2bootle-fruits.png", "USER_APPROVED"),
    asset("https://cdn.novalis.example/i-maca-root.jpg", "USER_APPROVED"),
  ]));
  const runB = writeProductResearchRun(emptyRun(isolatedB.id, "Other Product", [
    proposal("ingredients", "ACCEPTED", "Amber gill"),
    proposal("howItWorks", "NOT_FOUND", ""),
  ], [asset("https://cdn.other.example/other.png", "REVIEW_REQUIRED")]));
  const recoveredA = writeProductResearchRun(applyEditorialRecovery(runA));
  assert(recoveredA.proposals.find((item) => item.field === "howItWorks")?.suggestedValue.includes("droppers"), "18. recovered usage persists on campaign A");
  const reloadedA = readProductResearchRun(isolatedA.id, recoveredA.runId);
  assert(reloadedA?.proposals.find((item) => item.field === "howItWorks")?.proposalKind === "RECOVERED_OPERATIONAL", "18. recovered lineage persists after refresh");
  assert(readProductResearchRun(isolatedB.id, runB.runId)?.proposals.find((item) => item.field === "ingredients")?.suggestedValue === "Amber gill", "17. campaign B is unchanged");
  assert(reloadedA?.proposals.find((item) => item.field === "ingredients")?.status === "ACCEPTED", "13. isolated accepted ingredients remain");
  assert(reloadedA?.discoveredAssets?.every((item) => item.status === "USER_APPROVED") && reloadedA.discoveredAssets?.every((item) => item.galleryKind !== "PRODUCT_PACKSHOT"), "14/16. isolated approved images stay approved and are not auto-promoted");

  const confirmed = decideDiscoveredAsset({
    campaignId: isolatedA.id,
    runId: recoveredA.runId,
    assetUrl: "https://cdn.novalis.example/2bootle-fruits.png",
    action: "CONFIRM_KIND",
  });
  assert(confirmed.discoveredAssets?.find((item) => item.assetUrl.includes("2bootle"))?.galleryKind === "PRODUCT_PACKSHOT", "15. human confirmation can set packshot");
  assert(confirmed.discoveredAssets?.find((item) => item.assetUrl.includes("2bootle"))?.hero !== true, "16. confirming kind does not set hero");

  decideProductResearchFields({ campaignId: isolatedA.id, runId: recoveredA.runId, fields: ["howItWorks"], action: "ACCEPT" });
  const afterAccept = readProductResearchRun(isolatedA.id, recoveredA.runId);
  const used = productFactsFromAcceptedReview({ run: afterAccept, productName: "Novalis Core", sourceUrl: "https://shop.novalis.example/core" });
  assert(used.usageInformation.join(" ").includes("droppers"), "11. accepted usage enters ProductFacts");

  const rejectedFaq = applyEditorialRecovery(emptyRun(isolatedB.id, "Other Product", [
    proposal("faq", "NOT_FOUND", ""),
    proposal("ingredients", "NOT_FOUND", ""),
  ]));
  assert(rejectedFaq.proposals.find((item) => item.field === "faq")?.status === "NOT_FOUND", "9. health-only FAQ stays NOT_FOUND when no documented operational question remains after filter");
  const factualFaqRun = applyEditorialRecovery({
    ...emptyRun(isolatedB.id, "Other Product", [proposal("faq", "NOT_FOUND", "")]),
    evidenceRegistry: {
      entries: [
        { id: "ev-faq-ops", field: "FAQ", originalText: "How long is shipping? Orders ship within two business days.", url: "https://shop.novalis.example/core", collectedAt: null, verification: "SELLER_STATED", sourceType: "SALES_PAGE" },
      ],
    },
  });
  assert(factualFaqRun.proposals.find((item) => item.field === "faq")?.status === "SELLER_STATED", "8. documented operational FAQ can be proposed");
  assert(factualFaqRun.proposals.find((item) => item.field === "faq")?.faqKind === "DELIVERY", "8. recovered FAQ is classified as delivery");

  const gen = await runApprovedReviewGeneration({ campaignId: isolatedA.id, runId: recoveredA.runId });
  const model = readGenerationModel(gen.generationId ?? "");
  assert(gen.publicationReadiness === "BLOCKED" && gen.commercialAuthorization === "BLOCKED", "20. commercial authorization stays blocked");
  assert(Boolean(gen.record?.sandbox?.ctaPath?.startsWith("/admin/lab/sandbox/")), "20. CTA stays sandbox-only");
  assert(Boolean(model?.copy?.sections?.length || model?.hero || model?.theme), "19. Renderer V4 model is produced");
  const pendingDesc = recoveredA.proposals.find((item) => item.field === "description");
  assert(pendingDesc?.descriptionKind === "DERIVED_NEUTRAL_DESCRIPTION" && pendingDesc.status !== "ACCEPTED", "6. derived description stays pending");
  assert(!JSON.stringify(model ?? {}).toLowerCase().includes("clinically proven"), "5/19. generated page does not invent health claims");

  const media = selectReviewMedia({
    assets: before237.latest?.discoveredAssets,
    productName: "Sugar Defender",
    campaignId: 237,
  });
  assert(media.heroStatus === "HERO_IMAGE_MISSING", "14. campaign 237 still has no packshot hero");

  const after237 = snapshotProductResearch(237);
  assert((after237.latest?.proposals ?? []).filter((item) => item.status === "ACCEPTED").map((item) => item.field).sort().join(",") === beforeFacts, "13. live 237 accepted facts were not modified by isolated tests");
  assert((after237.latest?.discoveredAssets ?? []).filter((item) => item.status === "USER_APPROVED").map((item) => item.assetUrl).sort().join("|") === beforeAssets, "13. live 237 approved assets were not modified by isolated tests");
  assert(getCampaignById(237)?.name.includes("Sugar Defender"), "17. campaign 237 remains Sugar Defender");

  const reportDir = path.join("data/evidence/execution-54y-structured-content-recovery/reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    path.join(reportDir, "isolated-review.json"),
    `${JSON.stringify({
      isolatedA: isolatedA.id,
      isolatedB: isolatedB.id,
      recoveredUsage: pendingUsage?.suggestedValue,
      originalUsage: SUGAR_USAGE,
      omitted: sugar.omitted.map((item) => item.text),
      derived,
      generationId: gen.generationId,
      previewPath: gen.previewPath,
    }, null, 2)}\n`,
  );
  console.log(`PASS test-structured-recovery-54y.ts (${passed} OK) isolatedA=${isolatedA.id} isolatedB=${isolatedB.id}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
