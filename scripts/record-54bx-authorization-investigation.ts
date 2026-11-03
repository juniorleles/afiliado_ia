import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { readGeneration, readGenerationModel } from "../src/lib/lp-generator/store.ts";
import { applySandboxToModel } from "../src/lib/sandbox/cta.ts";
import { applyQualityPatch, readQualityPatch } from "../src/lib/presell-quality/patch.ts";
import { disableCommercialCta } from "../src/lib/presell-quality/content-safety.ts";
import { readAffiliateProgram } from "../src/lib/affiliate-program.ts";
import { readUserAssetDeclaration } from "../src/lib/presell-quality/user-asset-declaration.ts";
import {
  listOfferImagesEligibleForApproval,
  offerImageApprovalEligibility,
  offerImageIsPublishable,
  readOfferImageInventory,
} from "../src/lib/presell-quality/offer-images.ts";
import { approvedOffersFromManifest } from "../src/lib/presell-quality/approved-offers.ts";
import { readCommercialReuse } from "../src/lib/presell-quality/commercial-reuse.ts";

const CAMPAIGN_ID = 237;
const GENERATION_ID = "lp-mvs7mja3-0d690e7c";
const REQUESTED = ["asset-1301445c", "asset-1d63be79", "asset-ad4ed3f0"] as const;
const PACKSHOT = "/media/product/cc835ef78e894f7645c4556b.png";
const AFFILIATES_PAGE = path.join(process.cwd(), "data/presell-quality/237/stored-pages/6097dd117c6a6706.json");
const EVIDENCE = path.join(process.cwd(), "data/evidence/execution-54bx-offer-image-authorization");
const NOW = new Date().toISOString();

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const affiliatesStored = existsSync(AFFILIATES_PAGE)
  ? (JSON.parse(readFileSync(AFFILIATES_PAGE, "utf8")) as { url?: string; html?: string; fetchedAt?: string })
  : null;
const affiliatesHtml = affiliatesStored?.html ?? "";
const permittedClause =
  affiliatesHtml.match(/You are permitted to use the following imagery[\s\S]{0,400}?Save Image As/i)?.[0]?.replace(/\s+/g, " ").trim() ??
  null;
const permittedFiles = [...affiliatesHtml.matchAll(/src="\/assets\/img\/([^"]+)"/gi)]
  .map((match) => match[1])
  .filter((name) => /person3|person6/i.test(name));
const uniquePermitted = [...new Set(permittedFiles)];
const packageFilesOnAffiliates = ["SUGARDEFENDERx2-500px.webp", "SUGARDEFENDERx3-500px.webp", "SUGARDEFENDERx6-500px.webp"].filter(
  (name) => affiliatesHtml.includes(name),
);

const inventory = readOfferImageInventory(CAMPAIGN_ID);
if (!inventory) throw new Error("offer-image inventory missing");
const declaration = readUserAssetDeclaration(CAMPAIGN_ID);
const program = readAffiliateProgram(CAMPAIGN_ID);
const requested = REQUESTED.map((assetId) => {
  const asset = inventory.assets.find((item) => item.assetId === assetId);
  if (!asset) throw new Error(`missing ${assetId}`);
  return {
    assetId: asset.assetId,
    bottleCount: asset.bottleCount,
    sourceUrl: asset.sourceUrl,
    sourcePageUrl: asset.sourcePageUrl,
    evidenceStatus: asset.evidenceStatus,
    usageAuthorization: asset.usageAuthorization,
    reviewStatus: asset.reviewStatus,
    publishable: offerImageIsPublishable(asset),
    eligibleForHumanApproval: offerImageApprovalEligibility(asset).ok,
    inUserDeclaration: Boolean(declaration?.assetIds.includes(asset.assetId)),
    listedOnAffiliatePermittedBanners: packageFilesOnAffiliates.includes(asset.sourceUrl.split("/").pop() || ""),
    sha256: asset.sha256,
    localFile: asset.localFile,
  };
});

const permissionProven = requested.every(
  (item) => item.listedOnAffiliatePermittedBanners || item.inUserDeclaration,
);
const reuse = readCommercialReuse(CAMPAIGN_ID);
const offers = reuse
  ? approvedOffersFromManifest({
      manifest: reuse,
      image: { assetId: "asset-cbc045ab", src: PACKSHOT, productName: "Sugar Defender" },
      navigationAllowed: false,
      offerImages: inventory,
    })
  : [];

const record = readGeneration(GENERATION_ID);
const storedModel = readGenerationModel(GENERATION_ID);
let markup = "";
if (record && storedModel) {
  const patch = readQualityPatch(GENERATION_ID);
  const patched = patch ? applyQualityPatch(storedModel, patch) : storedModel;
  const sandboxed = record.sandbox?.enabled ? applySandboxToModel(patched, { href: record.sandbox.ctaPath }) : patched;
  markup = renderToStaticMarkup(
    createElement(V4Page, { model: disableCommercialCta(sandboxed), candidate: "54BX", campaignId: CAMPAIGN_ID }),
  );
}

const investigation = {
  recordedAt: NOW,
  actor: "lab-operator",
  campaignId: CAMPAIGN_ID,
  generationId: GENERATION_ID,
  officialOriginPage: inventory.sourcePageUrl,
  affiliateResourcesPage: affiliatesStored?.url ?? null,
  affiliateResourcesFetchedAt: affiliatesStored?.fetchedAt ?? null,
  affiliateProgramRecord: program,
  userDeclaration: declaration
    ? {
        declaredAt: declaration.declaredAt,
        verificationStatus: declaration.verificationStatus,
        independentlyVerifiedLicense: declaration.independentlyVerifiedLicense,
        authorizationScope: declaration.authorizationScope,
        assetIds: declaration.assetIds,
        declarationText: declaration.declarationText,
      }
    : null,
  affiliateTerms: {
    permittedImageryClause: permittedClause,
    permittedBannerFiles: uniquePermitted,
    packageFilesListedOnAffiliatePage: packageFilesOnAffiliates,
    note: "The stored affiliate resources page permits only the listed banner images and forbids other imagery from that site. Presence on the producer offer page is not reuse authorization.",
  },
  requestedAssets: requested,
  permissionProven,
  approvalPerformed: false,
  reasonApprovalNotPerformed: permissionProven
    ? null
    : "Affiliate terms do not list the 2/3/6 package photographs as permitted promotional imagery, and the existing PRESELL_USE declaration does not include these asset IDs. Operator attestation in chat is not an independently verified license. The three files remain PENDING for explicit human approval in the admin review flow.",
  remainingPending: inventory.assets.filter((item) => !REQUESTED.includes(item.assetId as (typeof REQUESTED)[number])).length,
  liveInventoryStillPending: inventory.assets.every((item) => item.usageAuthorization === "PENDING"),
  landingPage: {
    regenerated: false,
    usesApprovedPackshotFallback: offers.every((item) => item.productImageSrc === PACKSHOT && item.imageRole === "PRODUCT_ILLUSTRATION"),
    markupContainsPackshot: markup.includes(PACKSHOT),
    markupContainsPackageMedia: /\/media\/product\/(2a162cfc|5526fedd|949c410c)/.test(markup),
    publicableCount: inventory.assets.filter((item) => offerImageIsPublishable(item)).length,
  },
  adminReviewUrl: `/admin/lab/lp-generator/${GENERATION_ID}/offer-images?evidence=VERIFIED`,
  eligibleForHumanApproval: listOfferImagesEligibleForApproval(inventory).map((item) => ({
    assetId: item.assetId,
    bottleCount: item.bottleCount,
    sourceUrl: item.sourceUrl,
  })),
};

writeJson(path.join(EVIDENCE, "authorization-investigation.json"), investigation);

if (permissionProven) throw new Error("investigation expected permission to remain unproven");
if (!investigation.liveInventoryStillPending) throw new Error("inventory was mutated");
if (!investigation.landingPage.usesApprovedPackshotFallback) throw new Error("pending images leaked onto offer cards");
if (investigation.landingPage.markupContainsPackageMedia) throw new Error("package files were published without approval");
if (!existsSync(path.join(process.cwd(), "src/app/admin/lab/lp-generator/[id]/offer-images/actions.ts"))) {
  throw new Error("admin decide flow missing");
}

console.log(JSON.stringify(investigation, null, 2));
console.log("PASS investigation recorded; no approval written");
