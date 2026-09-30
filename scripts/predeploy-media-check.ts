// npx tsx scripts/predeploy-media-check.ts [--campaign <id>]... [--report <file>]
// Fails (exit 1) when media required by a published campaign or a named publication candidate is missing.
// Reads a read-only snapshot of the database; the live file is never opened for writing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { snapshotDatabase } from "./backup-presell-os.ts";
import { getDbPath, resetDbForTests } from "../src/lib/db.ts";
import { getCampaignById, listPublishedCampaigns } from "../src/lib/campaigns.ts";
import { campaignMediaReport, type CampaignMediaReport } from "../src/lib/deploy/media-contract.ts";
import { mediaStorageKind } from "../src/lib/env.ts";
import { localMediaRoot } from "../src/lib/storage/local.ts";
import { visualDesignRoot } from "../src/lib/visual-concept/store.ts";

function argValues(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === flag && process.argv[index + 1]) out.push(process.argv[index + 1]);
  });
  return out;
}

const candidateIds = argValues("--campaign").map((value) => Number(value));
const reportFile = argValues("--report")[0];
if (candidateIds.some((id) => !Number.isInteger(id) || id <= 0)) {
  console.error("--campaign expects a positive integer id");
  process.exit(2);
}

const persistentRoot = path.resolve(process.cwd(), "data");
const sourceDb = path.resolve(getDbPath());
const roots = { database: sourceDb, productImages: path.resolve(localMediaRoot()), visualDesign: path.resolve(visualDesignRoot()) };
const warnings = Object.entries(roots)
  .filter(([, dir]) => !(dir + path.sep).startsWith(persistentRoot + path.sep))
  .map(([name]) => `${name} resolves outside <app>/data; it must be on persistent storage and in backups`);
if (mediaStorageKind() !== "LOCAL") warnings.push("MEDIA_STORAGE is not LOCAL; first-release contract is LOCAL");

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "aia-predeploy-"));
const snapshot = path.join(stage, "snapshot.db");
let reports: CampaignMediaReport[] = [];
const unknownCandidates: number[] = [];
try {
  if (!fs.existsSync(sourceDb)) throw new Error("Database file not found");
  snapshotDatabase(sourceDb, snapshot);
  process.env.PRESELL_OS_DB = snapshot;
  resetDbForTests();
  const targets = new Map(listPublishedCampaigns().map((campaign) => [campaign.id, campaign]));
  for (const id of candidateIds) {
    const campaign = getCampaignById(id);
    if (campaign) targets.set(id, campaign);
    else unknownCandidates.push(id);
  }
  reports = [...targets.values()].sort((a, b) => a.id - b.id).map((campaign) => campaignMediaReport(campaign));
} finally {
  resetDbForTests();
  fs.rmSync(stage, { recursive: true, force: true });
}

const failing = reports.filter((report) => !report.ok);
const summary = {
  check: "PREDEPLOY_MEDIA_V1",
  persistentRoot: "<app>/data",
  roots: Object.fromEntries(Object.entries(roots).map(([name, dir]) => [name, path.relative(process.cwd(), dir).replace(/\\/g, "/")])),
  warnings,
  candidates: candidateIds,
  unknownCandidates,
  campaigns: reports.map((report) => ({
    campaignId: report.campaignId,
    slug: report.slug,
    presentation: report.presentation,
    required: report.requirements.length,
    present: report.requirements.length - report.missing.length,
    missing: report.missing,
  })),
  result: failing.length === 0 && unknownCandidates.length === 0 ? "PASS" : "FAIL",
};
const text = JSON.stringify(summary, null, 2);
if (reportFile) fs.writeFileSync(reportFile, `${text}\n`);
console.log(text);
process.exit(summary.result === "PASS" ? 0 : 1);
