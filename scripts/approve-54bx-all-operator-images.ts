/**
 * System-owner OPERATOR_APPROVED for all eligible campaign 237 offer images.
 * Uses recordOperatorOfferImageAttestation only. Does not invent rights-holder licenses.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  offerImageIsPublishable,
  offerImageOperatorAttestationEligibility,
  readOfferImageInventory,
  recordOperatorOfferImageAttestation,
  withOfferImageAuthDefaults,
  writeOfferImageInventory,
  type OfferImageAsset,
} from "../src/lib/presell-quality/offer-images.ts";

const CAMPAIGN_ID = 237;
const ACTOR = "system-owner";
const NOW = new Date().toISOString();
const DECLARATION =
  "System owner administratively approves OPERATOR_APPROVED for all Sugar Defender campaign 237 offer-image inventory assets that meet official attestation eligibility. Scope: indefinite administrative/presell laboratory use within this campaign. This is operator attestation only and does not prove rights-holder license, does not set usageAuthorization APPROVED, and does not authorize public publication.";

function summarize(asset: OfferImageAsset) {
  const current = withOfferImageAuthDefaults(asset);
  const eligibility = offerImageOperatorAttestationEligibility(current);
  return {
    assetId: current.assetId,
    bottleCount: current.bottleCount,
    classification: current.classification,
    evidenceStatus: current.evidenceStatus,
    operatorAttestation: current.operatorAttestation,
    usageAuthorization: current.usageAuthorization,
    reviewStatus: current.reviewStatus,
    rightsHolderLicenseStatus: current.rightsHolderLicenseStatus ?? "UNPROVEN",
    eligible: eligibility.ok,
    reasons: eligibility.reasons,
    publishable: offerImageIsPublishable(current),
  };
}

function main() {
  const inventory = readOfferImageInventory(CAMPAIGN_ID);
  if (!inventory) throw new Error("missing inventory for campaign 237");

  const before = inventory.assets.map(summarize);
  const alreadyApproved = before.filter((row) => row.operatorAttestation === "OPERATOR_APPROVED").map((row) => row.assetId);
  const candidates = before.filter((row) => row.eligible).map((row) => row.assetId);
  const blocked = before.filter((row) => !row.eligible && row.operatorAttestation !== "OPERATOR_APPROVED");

  const result =
    candidates.length === 0
      ? { inventory, attested: [] as string[], promoted: [] as string[], skipped: [] as Array<{ assetId: string; reasons: string[] }>, error: undefined }
      : recordOperatorOfferImageAttestation({
          inventory,
          assetIds: candidates,
          actor: ACTOR,
          declarationText: DECLARATION,
          evidenceNote: `Definitive system-owner decision recorded ${NOW} for campaign 237. Assets already OPERATOR_APPROVED were left unchanged to avoid duplicate attestation events.`,
          now: NOW,
          affiliateProgramAudit: inventory.affiliateProgramAudit ?? null,
        });

  if (result.error) throw new Error(result.error);

  const written = writeOfferImageInventory(CAMPAIGN_ID, result.inventory);
  const reloaded = readOfferImageInventory(CAMPAIGN_ID);
  if (!reloaded) throw new Error("inventory missing after write");

  const after = reloaded.assets.map(summarize);
  const approvedAfter = after.filter((row) => row.operatorAttestation === "OPERATOR_APPROVED");
  const packageMap = [2, 3, 6].map((n) => {
    const asset = reloaded.assets.find((item) => item.bottleCount === n && item.operatorAttestation === "OPERATOR_APPROVED");
    return { bottleCount: n, assetId: asset?.assetId ?? null, operatorAttestation: asset?.operatorAttestation ?? null };
  });

  const newlyAttested = result.attested;
  const totalAssets = after.length;
  const approvedCount = approvedAfter.length;
  const status = approvedCount === totalAssets && newlyAttested.every((id) => approvedAfter.some((row) => row.assetId === id)) ? "PASS" : "BLOCKED";

  const report = {
    status,
    recordedAt: NOW,
    actor: ACTOR,
    campaignId: CAMPAIGN_ID,
    inventoryPath: "data/presell-quality/237/offer-images.json",
    totalAssets,
    approvedCount,
    acceptance: `${approvedCount}/${totalAssets}`,
    alreadyApprovedBefore: alreadyApproved,
    newlyAttested,
    promoted: result.promoted,
    attestationSkipped: result.skipped,
    blockedByOfficialGate: blocked,
    packageMappingsPreserved: packageMap,
    rightsStillUnproven: after.every((row) => row.rightsHolderLicenseStatus === "UNPROVEN"),
    nonePublishable: after.every((row) => !row.publishable),
    persistedReloadApprovedCount: reloaded.assets.filter((a) => withOfferImageAuthDefaults(a).operatorAttestation === "OPERATOR_APPROVED").length,
    note:
      status === "PASS"
        ? "All inventory assets carry OPERATOR_APPROVED."
        : "Official attestation eligibility blocks some assets; states were not falsified. OPERATOR_APPROVED requires VERIFIED package-image mapping and disk integrity among other gates.",
  };

  const out = path.join(process.cwd(), "data/evidence/execution-54bx-admin-approve-all");
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, "approval-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(out, "before-eligibility.json"), `${JSON.stringify(before, null, 2)}\n`);
  writeFileSync(path.join(out, "after-status.json"), `${JSON.stringify(after, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (status !== "PASS") process.exit(2);
}

main();
