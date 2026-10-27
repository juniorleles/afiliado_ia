// npx tsx scripts/test-presell-generation-54w.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createCampaign, getCampaignById } from "../src/lib/campaigns.ts";
import { upsertCampaignSource } from "../src/lib/campaign-sources/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { writeProductResearchRun } from "../src/lib/product-research/store.ts";
import { selectReviewMedia } from "../src/lib/product-research/media-contract.ts";
import { acceptedProposals, productFactsFromAcceptedReview } from "../src/lib/product-research/approved-facts.ts";
import { loadApprovedReviewGeneration, runApprovedReviewGeneration } from "../src/lib/lp-generator/from-approved-review.ts";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import type { ProductResearchRun } from "../src/lib/product-research/types.ts";
import type { DiscoveredAffiliateAsset } from "../src/lib/affiliate-policy/types.ts";

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

function campaign(name: string, slug: string) {
  return createCampaign({
    name,
    slug,
    headline: name,
    body: name,
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
}

function proposal(field: ProductResearchRun["proposals"][number]["field"], status: ProductResearchRun["proposals"][number]["status"], value: string): ProductResearchRun["proposals"][number] {
  return {
    field,
    currentValue: value,
    suggestedValue: value,
    status,
    evidenceIds: value ? [`ev-${field}`] : [],
    sourceUrl: "https://shop.novalis.example/core",
    sourceClass: "OFFICIAL_SALES",
    verification: "SELLER_STATED",
    restriction: null,
    collectedAt: "2026-10-26T00:00:00.000Z",
    eligibleForBatch: false,
    notes: [],
  };
}

function asset(url: string, status: DiscoveredAffiliateAsset["status"], kind: DiscoveredAffiliateAsset["galleryKind"], hero = false): DiscoveredAffiliateAsset {
  return {
    assetUrl: url,
    sourceUrl: "https://shop.novalis.example/core",
    assetType: kind === "BANNER" ? "BANNER" : kind === "LOGO" ? "LOGO" : "IMAGE",
    context: kind ?? "other",
    declaredAuthorization: "UNSTATED",
    usageRestrictions: [],
    status,
    galleryKind: kind,
    hero,
    decidedAt: status === "USER_APPROVED" || status === "REJECTED" ? "2026-10-26T00:00:00.000Z" : null,
  };
}

function fakeRun(campaignId: number, name: string, proposals: ProductResearchRun["proposals"], assets: DiscoveredAffiliateAsset[]): ProductResearchRun {
  const accepted = proposals.filter((item) => item.status === "ACCEPTED").length;
  return writeProductResearchRun({
    version: 1,
    runId: `pr-54w-${campaignId}`,
    campaignId,
    productName: name,
    status: "COMPLETED",
    stage: "DONE",
    createdAt: "2026-10-26T00:00:00.000Z",
    startedAt: "2026-10-26T00:00:00.000Z",
    finishedAt: "2026-10-26T00:00:01.000Z",
    seeds: ["https://shop.novalis.example/core"],
    seedRejection: null,
    limitations: [],
    sources: [{ url: "https://shop.novalis.example/core", ok: true, sourceClass: "OFFICIAL_SALES", sourceType: "SALES_PAGE" }],
    discoveredAssets: assets,
    coverageTotal: 40,
    coverageMax: 100,
    reviewAccepted: accepted,
    reviewTotal: Math.max(accepted, 1),
    publicationReadiness: "BLOCKED",
    publicationReason: "Publication approval is human.",
    grounding: "NOT_EVALUATED",
    neutrality: "NOT_EVALUATED",
    contentQuality: "NOT_EVALUATED",
    commercialAuthorization: "BLOCKED",
    proposals,
    decisions: [],
    error: null,
  });
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const before237 = snapshotProductResearch(237);
  const beforeStatuses = (before237.latest?.proposals ?? []).map((item) => `${item.field}:${item.status}`).join("|");
  const beforeAssets = (before237.latest?.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.hero ? "1" : "0"}`).join("|");
  const accepted237 = acceptedProposals(before237.latest);
  const media237 = selectReviewMedia({
    assets: before237.latest?.discoveredAssets,
    productName: before237.latest?.productName || "Sugar Defender",
    campaignId: 237,
  });

  assert(Boolean(before237.latest), "campaign 237 has a research run");
  assert(accepted237.length === 2, `237 has 2 accepted facts, got ${accepted237.length}`);
  assert(accepted237.every((item) => item.field === "ingredients" || item.field === "guarantee"), "237 accepted facts are ingredients and guarantee");
  assert(media237.approvedCount === 5, `237 has 5 approved assets, got ${media237.approvedCount}`);
  assert((before237.latest?.discoveredAssets ?? []).length === 8, "237 still has 8 discovered assets");
  assert(media237.approved.every((item) => item.approvalStatus === "USER_APPROVED"), "adapter only lists approved images as approved");
  assert(media237.used.every((item) => item.approvalStatus === "USER_APPROVED"), "used images are approved");
  assert(!media237.used.some((item) => item.approvalStatus !== "USER_APPROVED"), "pending images are not used");

  const packshot = media237.approved.find((item) => item.galleryKind === "PRODUCT_PACKSHOT");
  if (packshot) {
    assert(media237.heroStatus === "SELECTED", "packshot can become hero");
  } else {
    assert(media237.heroStatus === "HERO_IMAGE_MISSING", "no packshot evidence keeps HERO_IMAGE_MISSING");
  }

  const isolated = campaign("Novalis 54W Presell", `novalis-54w-${Date.now()}`);
  upsertCampaignSource(isolated.id, "SALES_PAGE", "https://shop.novalis.example/core");
  const pack = "https://cdn.novalis.example/bottle-packshot.png";
  const ingredient = "https://cdn.novalis.example/ingredient-maca.png";
  const banner = "https://cdn.novalis.example/banner-promo.png";
  const pending = "https://cdn.novalis.example/pending.png";
  fakeRun(
    isolated.id,
    "Novalis Core",
    [
      proposal("ingredients", "ACCEPTED", "Maca Root, Harbor leaf"),
      proposal("guarantee", "ACCEPTED", "The seller states customers may request a refund within 60 days."),
      proposal("description", "NOT_FOUND", ""),
      proposal("benefits", "REJECTED", "Clinically proven results"),
    ],
    [
      asset(pack, "USER_APPROVED", "PRODUCT_PACKSHOT", true),
      asset(ingredient, "USER_APPROVED", "INGREDIENT"),
      asset(banner, "USER_APPROVED", "BANNER"),
      asset(pending, "REVIEW_REQUIRED", "OTHER"),
    ],
  );
  const isolatedMedia = selectReviewMedia({
    assets: snapshotProductResearch(isolated.id).latest?.discoveredAssets,
    productName: "Novalis Core",
    campaignId: isolated.id,
  });
  assert(isolatedMedia.heroStatus === "SELECTED", "isolated packshot is selected as hero");
  assert(isolatedMedia.hero?.src === pack, "hero src is the approved packshot");
  assert(isolatedMedia.used.some((item) => item.assetUrl === ingredient && item.role === "ingredient"), "ingredient stays ingredient, not packshot");
  assert(!isolatedMedia.used.some((item) => item.assetUrl === banner), "promotional banner is not used");
  assert(!isolatedMedia.used.some((item) => item.assetUrl === pending), "pending image is not used");

  const generated = await runApprovedReviewGeneration({ campaignId: isolated.id });
  assert(Boolean(generated.generationId && generated.previewPath), "isolated generation writes a real artifact");
  assert(generated.previewPath === `/admin/lab/lp-generator/${generated.generationId}/preview`, "preview path is the existing V4 route");
  assert(generated.publicationReadiness === "BLOCKED", "publication stays blocked after generation");
  assert(generated.commercialAuthorization === "BLOCKED", "commercial stays blocked after generation");
  const model = readGenerationModel(generated.generationId!);
  const record = readGeneration(generated.generationId!);
  assert(Boolean(model), "V4 model.json exists");
  assert(record?.campaignId === isolated.id, "generation belongs to the isolated campaign");
  assert(record?.researchRunId === `pr-54w-${isolated.id}`, "research run id is stored");
  assert(Boolean(record?.sandbox?.ctaPath?.startsWith("/admin/lab/sandbox/")), "sandbox CTA is the local simulation path");
  assert(!JSON.stringify(model).includes("hop.clickbank.net"), "model does not contain a ClickBank hop");
  assert(!JSON.stringify(model).includes("Clinically proven"), "rejected efficacy claim is not invented into the page");
  assert(JSON.stringify(model).toLowerCase().includes("maca root"), "approved ingredients appear in the model");
  assert(JSON.stringify(model).toLowerCase().includes("60 days") || JSON.stringify(model).toLowerCase().includes("refund"), "approved guarantee appears in the model");
  assert(model?.commercialImage?.src === pack, "rendered hero is the approved packshot");
  assert(!(model?.galleryImages ?? []).some((item) => item.src === pending || item.src === banner), "pending and banner stay out of the gallery");
  assert(record?.ai?.status !== "USED", "paid AI was not used");
  assert(record?.copy?.aiUsed !== true, "copy producer is not paid AI");

  const reloaded = loadApprovedReviewGeneration(isolated.id);
  assert(reloaded?.generationId === generated.generationId, "generation pointer survives reload");

  const insufficient = campaign("Novalis 54W Thin", `novalis-54w-thin-${Date.now()}`);
  upsertCampaignSource(insufficient.id, "SALES_PAGE", "https://shop.novalis.example/core");
  fakeRun(insufficient.id, "Novalis Thin", [proposal("description", "NOT_FOUND", "")], [asset(ingredient, "USER_APPROVED", "INGREDIENT")]);
  const thin = await runApprovedReviewGeneration({ campaignId: insufficient.id });
  assert(thin.status === "INSUFFICIENT_APPROVED_CONTENT", "no accepted facts returns INSUFFICIENT_APPROVED_CONTENT");
  assert(!thin.previewPath, "insufficient content does not fake a finished page");

  const noPack = campaign("Novalis 54W NoPack", `novalis-54w-nopack-${Date.now()}`);
  upsertCampaignSource(noPack.id, "SALES_PAGE", "https://shop.novalis.example/core");
  fakeRun(
    noPack.id,
    "Novalis NoPack",
    [proposal("ingredients", "ACCEPTED", "Harbor leaf"), proposal("guarantee", "ACCEPTED", "The seller states a 60-day refund.")],
    [asset(ingredient, "USER_APPROVED", "INGREDIENT"), asset(banner, "USER_APPROVED", "BANNER")],
  );
  const noPackGen = await runApprovedReviewGeneration({ campaignId: noPack.id });
  const noPackModel = readGenerationModel(noPackGen.generationId ?? "");
  assert(noPackGen.heroImageStatus === "HERO_IMAGE_MISSING", "ingredient-only approved set is HERO_IMAGE_MISSING");
  assert(!noPackModel?.commercialImage, "no invented packshot is attached");
  assert(noPackGen.status === "INSUFFICIENT_APPROVED_CONTENT", "thin accepted facts stay insufficient, not publication-ready");
  assert(Boolean(noPackGen.previewPath && noPackModel), "honest partial V4 artifact is still written when facts exist");

  const failed = await runApprovedReviewGeneration({ campaignId: 9_999_991 });
  assert(failed.status === "FAILED", "missing campaign fails generation");

  const facts237 = productFactsFromAcceptedReview({
    run: before237.latest,
    productName: before237.latest?.productName || "Sugar Defender",
    sourceUrl: "https://sugardefender.com/",
  });
  assert(facts237.ingredientsOrComponents.join(" ").includes("Maca Root"), "237 approved ingredients become ProductFacts");
  assert(Boolean(facts237.guaranteeInformation?.includes("60 days")), "237 approved guarantee becomes ProductFacts");
  assert(!facts237.description, "missing description is not invented");
  assert(facts237.features.length === 0, "missing benefits are not invented");

  const sugar = await runApprovedReviewGeneration({ campaignId: 237 });
  assert(Boolean(sugar.generationId && sugar.previewPath), "237 produces a real SANDBOX artifact");
  assert(sugar.publicationReadiness === "BLOCKED", "237 publication stays blocked");
  assert(sugar.commercialAuthorization === "BLOCKED", "237 commercial stays blocked");
  const sugarModel = readGenerationModel(sugar.generationId!);
  const sugarRecord = readGeneration(sugar.generationId!);
  assert(sugarRecord?.campaignId === 237, "237 generation is scoped to campaign 237");
  assert(!JSON.stringify(sugarModel).includes("hop.clickbank.net"), "237 model does not use the hop as CTA");
  assert(Boolean(sugarRecord?.sandbox?.ctaPath?.startsWith("/admin/lab/sandbox/")), "237 CTA is sandbox-only");
  assert(sugar.heroImageStatus === media237.heroStatus, "237 hero decision matches the adapter");
  assert(sugar.approvedFacts.includes("ingredients") && sugar.approvedFacts.includes("guarantee"), "237 uses the two approved facts");
  assert(!JSON.stringify(sugarModel).toLowerCase().includes("clinically proven"), "237 page does not invent clinical proof");
  const isolatedAfter = loadApprovedReviewGeneration(isolated.id);
  assert(isolatedAfter?.generationId === generated.generationId, "237 generation does not replace the isolated pointer");
  assert(loadApprovedReviewGeneration(237)?.generationId === sugar.generationId, "237 pointer stays on the 237 artifact");

  const after237 = snapshotProductResearch(237);
  assert((after237.latest?.proposals ?? []).map((item) => `${item.field}:${item.status}`).join("|") === beforeStatuses, "237 fact approvals unchanged");
  assert((after237.latest?.discoveredAssets ?? []).map((item) => `${item.assetUrl}:${item.status}:${item.hero ? "1" : "0"}`).join("|") === beforeAssets, "237 asset approvals unchanged");
  assert(getCampaignById(237)?.name.includes("Sugar Defender"), "237 remains Sugar Defender");

  const v4 = fileHash(path.join(process.cwd(), "src/components/product-showcase/v4/page.tsx"));
  assert(v4 !== null, "Renderer V4 page stays readable");
  assert(fileHash(path.join(process.cwd(), "src/components/product-showcase/v4/shell.tsx")) !== null, "Renderer V4 shell stays readable");
  const reportDir = path.join("data/evidence/execution-54w-real-presell-generation/reports");
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    path.join(reportDir, "isolated-review.json"),
    `${JSON.stringify({
      isolatedCampaignId: isolated.id,
      insufficientId: insufficient.id,
      noPackId: noPack.id,
      isolatedGenerationId: generated.generationId,
      sugarGenerationId: sugar.generationId,
      previewPath: sugar.previewPath,
    }, null, 2)}\n`,
  );
  console.log(`PASS test-presell-generation-54w.ts (${passed} OK) isolated=${isolated.id} sugar=${sugar.generationId} preview=${sugar.previewPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
