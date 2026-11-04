/**
 * System-owner ADMINISTRATIVE OPERATOR_APPROVED for all campaign 237 offer images.
 * Separates administrative approval from technical eligibility. Never invents licenses.
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  offerImageIsPublishable,
  offerImageLocalPreviewEligible,
  offerImageOperatorAttestationEligibility,
  readOfferImageInventory,
  recordOperatorOfferImageAttestation,
  selectLocalPreviewOfferImage,
  withOfferImageAuthDefaults,
  writeOfferImageInventory,
} from "../src/lib/presell-quality/offer-images.ts";
import { readRendererCandidateSelection } from "../src/lib/presell-quality/renderer-candidate.ts";

const CAMPAIGN_ID = 237;
const ACTOR = "system-owner";
const NOW = new Date().toISOString();
const DECLARATION =
  "System owner definitive administrative approval (OPERATOR_APPROVED) for all Sugar Defender campaign 237 offer-image inventory assets. Administrative approval is independent of technical integrity. It does not prove rights-holder license, does not materialize missing files, does not invent evidence, and does not authorize public publication by itself.";

function main() {
  const evidenceDir = path.join(process.cwd(), "data/evidence/execution-54bx-administrative-approve-all");
  mkdirSync(evidenceDir, { recursive: true });
  const inventoryFile = path.join(process.cwd(), "data/presell-quality/237/offer-images.json");
  const rollbackCopy = path.join(evidenceDir, "offer-images.pre-admin-approval.json");
  copyFileSync(inventoryFile, rollbackCopy);
  let stashOid: string | null = null;
  try {
    stashOid = execSync("git stash create", { cwd: process.cwd(), encoding: "utf8" }).trim() || null;
  } catch {
    stashOid = null;
  }
  writeFileSync(
    path.join(evidenceDir, "rollback.txt"),
    `inventory_backup=${rollbackCopy}\nstash_oid=${stashOid ?? ""}\nrestore_inventory=copy backup over data/presell-quality/237/offer-images.json\n`,
  );

  const inventory = readOfferImageInventory(CAMPAIGN_ID);
  if (!inventory) throw new Error("missing inventory");
  const beforeTechnical = inventory.assets.map((raw) => {
    const asset = withOfferImageAuthDefaults(raw);
    return {
      assetId: asset.assetId,
      evidenceStatus: asset.evidenceStatus,
      bottleCount: asset.bottleCount,
      sha256: asset.sha256,
      localFile: asset.localFile,
      rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus ?? "UNPROVEN",
      operatorAttestation: asset.operatorAttestation,
      technicalEligible: offerImageOperatorAttestationEligibility(asset).ok,
      localPreviewEligible: offerImageLocalPreviewEligible(asset),
      publishable: offerImageIsPublishable(asset),
    };
  });

  const allIds = inventory.assets.map((asset) => asset.assetId);
  const result = recordOperatorOfferImageAttestation({
    inventory,
    assetIds: allIds,
    actor: ACTOR,
    declarationText: DECLARATION,
    evidenceNote: `Administrative approval batch ${NOW}. Technical evidence/quantity/file/rights fields preserved verbatim.`,
    now: NOW,
    mode: "ADMINISTRATIVE",
    affiliateProgramAudit: inventory.affiliateProgramAudit ?? null,
  });
  if (result.error) throw new Error(result.error);

  const written = writeOfferImageInventory(CAMPAIGN_ID, result.inventory);
  const reloaded = readOfferImageInventory(CAMPAIGN_ID);
  if (!reloaded) throw new Error("reload failed");

  const after = reloaded.assets.map((raw) => {
    const asset = withOfferImageAuthDefaults(raw);
    const prior = beforeTechnical.find((row) => row.assetId === asset.assetId)!;
    return {
      assetId: asset.assetId,
      operatorAttestation: asset.operatorAttestation,
      operatorAttestedBy: asset.operatorAttestedBy,
      operatorAttestedAt: asset.operatorAttestedAt,
      evidenceStatus: asset.evidenceStatus,
      bottleCount: asset.bottleCount,
      sha256: asset.sha256,
      localFile: asset.localFile,
      rightsHolderLicenseStatus: asset.rightsHolderLicenseStatus ?? "UNPROVEN",
      usageAuthorization: asset.usageAuthorization,
      technicalFieldsUnchanged:
        prior.evidenceStatus === asset.evidenceStatus &&
        prior.bottleCount === asset.bottleCount &&
        prior.sha256 === asset.sha256 &&
        prior.localFile === asset.localFile &&
        prior.rightsHolderLicenseStatus === (asset.rightsHolderLicenseStatus ?? "UNPROVEN"),
      localPreviewEligible: offerImageLocalPreviewEligible(asset),
      publishable: offerImageIsPublishable(asset),
      lastHistoryAction: (asset.authorizationHistory ?? []).at(-1)?.action ?? null,
    };
  });

  const approvedCount = after.filter((row) => row.operatorAttestation === "OPERATOR_APPROVED").length;
  const technicalBlocked = after.filter((row) => !row.localPreviewEligible && !row.publishable);
  const packagePreview = [2, 3, 6].map((n) => ({
    bottleCount: n,
    selected: selectLocalPreviewOfferImage({ inventory: reloaded, bottleCount: n })?.assetId ?? null,
  }));
  const live = readRendererCandidateSelection(CAMPAIGN_ID);

  const idempotent = recordOperatorOfferImageAttestation({
    inventory: reloaded,
    assetIds: allIds,
    actor: ACTOR,
    declarationText: DECLARATION,
    now: NOW,
    mode: "ADMINISTRATIVE",
  });

  const status =
    approvedCount === 35 &&
    after.every((row) => row.operatorAttestation === "OPERATOR_APPROVED" && row.technicalFieldsUnchanged) &&
    after.every((row) => !row.publishable) &&
    after.every((row) => row.rightsHolderLicenseStatus === "UNPROVEN") &&
    packagePreview.every((row) => row.selected != null) &&
    live.activeExecutionId === "54BI" &&
    idempotent.attested.length === 0 &&
    idempotent.skipped.every((item) => item.reasons.includes("already-operator-approved")) &&
    result.promoted.length === 0
      ? "PASS"
      : "BLOCKED";

  const report = {
    status,
    recordedAt: NOW,
    actor: ACTOR,
    mode: "ADMINISTRATIVE",
    totalAssets: after.length,
    approvedCount,
    acceptance: `${approvedCount}/${after.length}`,
    newlyAttested: result.attested,
    skippedAlreadyApproved: result.skipped,
    promoted: result.promoted,
    technicalBlockedForPreviewOrPublish: technicalBlocked.map((row) => ({
      assetId: row.assetId,
      evidenceStatus: row.evidenceStatus,
      bottleCount: row.bottleCount,
      hasSha256: Boolean(row.sha256),
      hasLocalFile: Boolean(row.localFile),
      localPreviewEligible: row.localPreviewEligible,
      publishable: row.publishable,
    })),
    packagePreview,
    liveActiveExecutionId: live.activeExecutionId,
    rightsStillUnproven: after.every((row) => row.rightsHolderLicenseStatus === "UNPROVEN"),
    nonePublishable: after.every((row) => !row.publishable),
    idempotentSecondPassAttested: idempotent.attested,
    rollbackCopy,
    stashOid,
  };

  writeFileSync(path.join(evidenceDir, "approval-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(evidenceDir, "after-status.json"), `${JSON.stringify(after, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (written.assets.length !== 35) throw new Error("unexpected inventory size");
  if (status !== "PASS") process.exit(2);
}

main();
