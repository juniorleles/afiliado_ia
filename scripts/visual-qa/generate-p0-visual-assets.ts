import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodePng } from "../../src/lib/visual-concept/compose.ts";
import { visualConceptConfig } from "../../src/lib/visual-concept/config.ts";
import {
  buildProductionAssetRequest,
  p0ProductionGroups,
  productionAssetRoles,
  PRODUCTION_ASSET_MODEL,
  PRODUCTION_ASSET_QUALITY,
  PRODUCTION_ASSET_SIZE,
  VISUAL_ASSET_PROMPT_VERSION,
} from "../../src/lib/visual-concept/asset-production.ts";
import { validateVisualAssetManifest, type VisualAssetManifest } from "../../src/lib/visual-concept/asset-manifest.ts";
import { createOpenAiImageProvider, type ConceptImageRequest } from "../../src/lib/visual-concept/provider.ts";

const SLUG = "joint-genesis-controlled-ready-13";
const ROOT = path.join("data", "visual-design", SLUG, "visual-master");
const IDS: Record<string, string> = {
  "open-ground": "open-ground-v1",
  "tactile-stone": "stone-material-v1",
  "photographic-pause": "photographic-pause-v1",
};
const WORLD = [
  "Unhurried natural light and warm restrained daylight.",
  "Open physical space, tactile natural materials, and matte surfaces.",
  "Quiet premium editorial photography with a subtle natural landscape character.",
  "Soft shadows and restrained vegetation.",
].join(" ");

function parseEnv(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[name] = value;
  }
  return values;
}

function redact(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function loadKey(): boolean {
  const local = parseEnv(path.join(process.cwd(), ".env.local"));
  const key = (process.env.OPENAI_API_KEY || local.OPENAI_API_KEY || "").trim();
  if (key && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = key;
  let ignored = false;
  try {
    execSync("git check-ignore -q .env.local", { stdio: "ignore" });
    ignored = true;
  } catch {
    ignored = false;
  }
  if (!key || !ignored) return false;
  const listed = execSync("git ls-files -z", { encoding: "buffer" });
  for (const name of listed.toString("utf8").split("\0").filter(Boolean)) {
    try {
      if (readFileSync(name).includes(Buffer.from(key))) return false;
    } catch {
      // unreadable tracked path
    }
  }
  return true;
}

async function main() {
  const lines: Record<string, string> = {
    OPENAI_API_KEY_CONFIGURED: loadKey() ? "YES" : "NO",
    MANIFEST_FOUND: "NO",
    MANIFEST_VERSION: "",
    VISUAL_MASTER_FOUND: existsSync(path.join(ROOT, "master.png")) ? "YES" : "NO",
    ART_DIRECTION_FOUND: existsSync(path.join(ROOT, "art-direction.json")) ? "YES" : "NO",
    MODEL_AVAILABLE: "NO",
    MODEL: "",
    QUALITY: "",
    SIZE_SUPPORTED: "NO",
    PLANNED_ASSETS: "0",
    PLANNED_REAL_API_CALLS: "0",
    DRY_RUN: "FAIL",
    REAL_API_CALLS: "0",
    OPEN_GROUND: "NOT_SENT",
    STONE_MATERIAL: "NOT_SENT",
    PHOTOGRAPHIC_PAUSE: "NOT_SENT",
    AUTOMATIC_RETRIES: "0",
    PAID_FALLBACK: "NO",
    GO_NO_GO: "P0_VISUAL_ASSET_PRODUCTION_INCOMPLETE",
    FINAL_STATUS: "NEEDS_FIX",
    ERROR_MESSAGE: "",
  };
  const finish = () => {
    for (const [name, value] of Object.entries(lines)) {
      if (name === "ERROR_MESSAGE" && !value) continue;
      console.log(`${name}=${value}`);
    }
  };

  const manifestPath = path.join(ROOT, "assets", "manifest.json");
  const generatedDir = path.join(ROOT, "assets", "generated");
  const provenanceDir = path.join(ROOT, "assets", "provenance");
  lines.MANIFEST_FOUND = existsSync(manifestPath) ? "YES" : "NO";
  if (!existsSync(manifestPath)) {
    finish();
    return;
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as VisualAssetManifest;
  const metadata = JSON.parse(readFileSync(path.join(ROOT, "metadata.json"), "utf8")) as {
    campaignId: number;
    masterVersion: string;
    artDirectorVersion: string;
  };
  lines.MANIFEST_VERSION = manifest.manifestVersion;
  const config = visualConceptConfig();
  lines.MODEL = config.masterModel;
  lines.QUALITY = config.masterQuality;
  lines.MODEL_AVAILABLE = config.masterModel === PRODUCTION_ASSET_MODEL ? "YES" : "NO";
  lines.SIZE_SUPPORTED = config.masterQuality === PRODUCTION_ASSET_QUALITY && PRODUCTION_ASSET_SIZE === "1536x1024" ? "YES" : "NO";
  const groups = p0ProductionGroups(manifest);
  const jobs = groups.map((group) => ({ generationGroup: group, assetId: IDS[group] || "" }));
  lines.PLANNED_ASSETS = String(jobs.length);
  lines.PLANNED_REAL_API_CALLS = String(jobs.filter((job) => job.assetId && !existsSync(path.join(generatedDir, `${job.assetId}.png`))).length);
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(provenanceDir, { recursive: true });
  const contractOk = manifest.assets
    .filter((asset) => asset.priority === "P0")
    .every((asset) => !asset.containsProduct && !asset.containsPerson && !asset.textAllowed);
  lines.DRY_RUN =
    lines.OPENAI_API_KEY_CONFIGURED === "YES" &&
    lines.MANIFEST_FOUND === "YES" &&
    manifest.manifestVersion === "visual-asset-manifest-v1" &&
    validateVisualAssetManifest(manifest).length === 0 &&
    lines.VISUAL_MASTER_FOUND === "YES" &&
    lines.ART_DIRECTION_FOUND === "YES" &&
    lines.MODEL_AVAILABLE === "YES" &&
    lines.SIZE_SUPPORTED === "YES" &&
    existsSync(generatedDir) &&
    existsSync(provenanceDir) &&
    jobs.length === 3 &&
    jobs.every((job) => job.assetId) &&
    contractOk
      ? "PASS"
      : "FAIL";
  if (lines.DRY_RUN !== "PASS") {
    if (lines.MODEL_AVAILABLE !== "YES") lines.GO_NO_GO = "MASTER_MODEL_UNAVAILABLE";
    finish();
    return;
  }
  if (lines.PLANNED_REAL_API_CALLS === "0") {
    lines.GO_NO_GO = "P0_VISUAL_ASSETS_READY_FOR_HUMAN_REVIEW";
    lines.FINAL_STATUS = "READY";
    finish();
    return;
  }

  const provider = createOpenAiImageProvider();
  let paid = 0;
  const statusKey: Record<string, string> = {
    "open-ground-v1": "OPEN_GROUND",
    "stone-material-v1": "STONE_MATERIAL",
    "photographic-pause-v1": "PHOTOGRAPHIC_PAUSE",
  };
  try {
    for (const job of jobs) {
      const imagePath = path.join(generatedDir, `${job.assetId}.png`);
      const provenancePath = path.join(provenanceDir, `${job.assetId}.json`);
      if (existsSync(imagePath)) {
        lines[statusKey[job.assetId]!] = "EXISTING";
        continue;
      }
      const request = buildProductionAssetRequest({ manifest, job, world: WORLD });
      if (
        request.model !== PRODUCTION_ASSET_MODEL ||
        request.quality !== PRODUCTION_ASSET_QUALITY ||
        request.size !== PRODUCTION_ASSET_SIZE ||
        request.operation !== "generations" ||
        request.referenceImagePath
      ) {
        throw new Error("BLOCKED_BEFORE_FETCH");
      }
      paid += 1;
      if (paid > 3) throw new Error("BLOCKED_BEFORE_FETCH");
      const bytes = await provider.create(request satisfies ConceptImageRequest);
      writeFileSync(imagePath, bytes);
      let image: { width: number; height: number };
      try {
        image = decodePng(bytes);
      } catch (error) {
        lines.REAL_API_CALLS = String(paid);
        lines[statusKey[job.assetId]!] = "PERSISTED_UNVALIDATED";
        lines.GO_NO_GO = "ASSET_PERSISTENCE_FAILED";
        lines.ERROR_MESSAGE = redact(error instanceof Error ? error.message : "png decode failed");
        lines.FINAL_STATUS = "NEEDS_FIX";
        finish();
        return;
      }
      if (image.width !== 1536 || image.height !== 1024 || bytes.length < 1) {
        lines.REAL_API_CALLS = String(paid);
        lines[statusKey[job.assetId]!] = "PERSISTED_UNVALIDATED";
        lines.GO_NO_GO = "ASSET_PERSISTENCE_FAILED";
        lines.ERROR_MESSAGE = `unexpected dimensions ${image.width}x${image.height}`;
        lines.FINAL_STATUS = "NEEDS_FIX";
        finish();
        return;
      }
      writeFileSync(
        provenancePath,
        JSON.stringify(
          {
            assetId: job.assetId,
            semanticRoles: productionAssetRoles(manifest, job.generationGroup),
            campaignId: metadata.campaignId,
            manifestVersion: manifest.manifestVersion,
            visualMasterVersion: metadata.masterVersion,
            artDirectionVersion: metadata.artDirectorVersion,
            model: request.model,
            quality: request.quality,
            size: request.size,
            promptVersion: VISUAL_ASSET_PROMPT_VERSION,
            createdAt: new Date().toISOString(),
            containsProduct: false,
            containsPerson: false,
            textAllowed: false,
            generatedAssetIsEvidence: false,
            factualAuthority: false,
            evidenceAuthority: false,
            sourceVisualMaster: "visual-master/master.png",
            imageTextReimportAllowed: false,
            humanReview: "PENDING",
            approved: false,
          },
          null,
          2,
        ),
      );
      lines[statusKey[job.assetId]!] = "GENERATED";
    }
  } catch (error) {
    lines.REAL_API_CALLS = String(paid);
    const message = redact(error instanceof Error ? error.message : "asset generation failed");
    lines.ERROR_MESSAGE = message;
    lines.GO_NO_GO = message === "BLOCKED_BEFORE_FETCH" && paid === 0 ? "P0_VISUAL_ASSET_PRODUCTION_INCOMPLETE" : "OPENAI_API_ERROR";
    lines.FINAL_STATUS = paid > 0 ? "FAILED" : "NEEDS_FIX";
    finish();
    return;
  }

  lines.REAL_API_CALLS = String(paid);
  const persisted = jobs.every((job) => {
    const imagePath = path.join(generatedDir, `${job.assetId}.png`);
    const provenancePath = path.join(provenanceDir, `${job.assetId}.json`);
    return existsSync(imagePath) && statSync(imagePath).size > 0 && existsSync(provenancePath);
  });
  if (!persisted || paid !== Number(lines.PLANNED_REAL_API_CALLS)) {
    lines.GO_NO_GO = persisted ? "P0_VISUAL_ASSET_PRODUCTION_INCOMPLETE" : "PROVENANCE_FAILED";
    lines.FINAL_STATUS = "NEEDS_FIX";
    finish();
    return;
  }
  const planPath = path.join(provenanceDir, "plan.json");
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as { generatedFiles?: string[] };
  plan.generatedFiles = jobs.map((job) => `generated/${job.assetId}.png`);
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  lines.GO_NO_GO = "P0_VISUAL_ASSETS_READY_FOR_HUMAN_REVIEW";
  lines.FINAL_STATUS = "READY";
  finish();
  for (const job of jobs) {
    const imagePath = path.join(generatedDir, `${job.assetId}.png`);
    const provenancePath = path.join(provenanceDir, `${job.assetId}.json`);
    const image = decodePng(readFileSync(imagePath));
    const provenance = JSON.parse(readFileSync(provenancePath, "utf8")) as { semanticRoles: string[] };
    console.log(`ASSET_ID=${job.assetId}`);
    console.log(`SEMANTIC_ROLES=${provenance.semanticRoles.join(",")}`);
    console.log(`ARTIFACT_PATH=${imagePath}`);
    console.log(`PROVENANCE_PATH=${provenancePath}`);
    console.log(`DIMENSIONS=${image.width}x${image.height}`);
    console.log(`FILE_SIZE=${statSync(imagePath).size}`);
  }
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : "asset generation failed"));
  process.exit(1);
});
