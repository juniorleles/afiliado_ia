import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodePng } from "../../src/lib/visual-concept/compose.ts";
import { visualConceptConfig } from "../../src/lib/visual-concept/config.ts";
import {
  buildUsageStillRequest,
  PRODUCTION_ASSET_MODEL,
  PRODUCTION_ASSET_QUALITY,
  USAGE_STILL_PROMPT_VERSION,
  USAGE_STILL_SIZE,
} from "../../src/lib/visual-concept/asset-production.ts";
import { validateVisualAssetManifest, type VisualAssetManifest } from "../../src/lib/visual-concept/asset-manifest.ts";
import { createOpenAiImageProvider } from "../../src/lib/visual-concept/provider.ts";

const SLUG = "joint-genesis-controlled-ready-13";
const ROOT = path.join("data", "visual-design", SLUG, "visual-master");
const ASSET_ID = "usage-visual-v1";
const WORLD = [
  "Warm restrained daylight on pale stone.",
  "A quiet editorial still life in the same campaign, not another landscape.",
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
  const generatedDir = path.join(ROOT, "assets", "generated");
  const provenanceDir = path.join(ROOT, "assets", "provenance");
  const imagePath = path.join(generatedDir, `${ASSET_ID}.png`);
  const provenancePath = path.join(provenanceDir, `${ASSET_ID}.json`);
  const manifestPath = path.join(ROOT, "assets", "manifest.json");
  const config = visualConceptConfig();
  const lines: Record<string, string> = {
    OPENAI_API_KEY_CONFIGURED: loadKey() ? "YES" : "NO",
    MANIFEST_FOUND: existsSync(manifestPath) ? "YES" : "NO",
    VISUAL_MASTER_FOUND: existsSync(path.join(ROOT, "master.png")) ? "YES" : "NO",
    ART_DIRECTION_FOUND: existsSync(path.join(ROOT, "art-direction.json")) ? "YES" : "NO",
    MODEL_AVAILABLE: config.masterModel === PRODUCTION_ASSET_MODEL ? "YES" : "NO",
    MODEL: config.masterModel,
    QUALITY: config.masterQuality,
    SIZE: USAGE_STILL_SIZE,
    DRY_RUN: "FAIL",
    REAL_API_CALLS: "0",
    ASSET_ID,
    SEMANTIC_ROLE: "USAGE_VISUAL",
    GENERATION: "NOT_SENT",
    AUTOMATIC_RETRY: "0",
    PAID_FALLBACK: "NO",
    GO_NO_GO: "USAGE_VISUAL_GENERATION_INCOMPLETE",
    FINAL_STATUS: "NEEDS_FIX",
    ERROR_MESSAGE: "",
  };
  const finish = () => {
    for (const [name, value] of Object.entries(lines)) {
      if (name === "ERROR_MESSAGE" && !value) continue;
      console.log(`${name}=${value}`);
    }
  };

  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(provenanceDir, { recursive: true });
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
  const usage = manifest.assets.find((asset) => asset.semanticRole === "USAGE_VISUAL");
  const sizeSupported = config.masterQuality === PRODUCTION_ASSET_QUALITY && USAGE_STILL_SIZE === "1024x1024";
  lines.DRY_RUN =
    lines.OPENAI_API_KEY_CONFIGURED === "YES" &&
    lines.MANIFEST_FOUND === "YES" &&
    manifest.manifestVersion === "visual-asset-manifest-v1" &&
    validateVisualAssetManifest(manifest).length === 0 &&
    lines.VISUAL_MASTER_FOUND === "YES" &&
    lines.ART_DIRECTION_FOUND === "YES" &&
    lines.MODEL_AVAILABLE === "YES" &&
    sizeSupported &&
    existsSync(generatedDir) &&
    existsSync(provenanceDir) &&
    usage?.recommendedGenerationSize === "1024x1024" &&
    usage.containsProduct === false &&
    usage.containsPerson === false &&
    usage.textAllowed === false
      ? "PASS"
      : "FAIL";
  if (lines.DRY_RUN !== "PASS") {
    if (lines.MODEL_AVAILABLE !== "YES") lines.GO_NO_GO = "MASTER_MODEL_UNAVAILABLE";
    finish();
    return;
  }
  if (existsSync(imagePath)) {
    lines.GENERATION = "EXISTING";
    lines.GO_NO_GO = "USAGE_VISUAL_GENERATION_INCOMPLETE";
    lines.ERROR_MESSAGE = "refusing to overwrite an existing usage asset";
    finish();
    return;
  }

  const request = buildUsageStillRequest({ manifest, assetId: ASSET_ID, world: WORLD });
  if (
    request.model !== PRODUCTION_ASSET_MODEL ||
    request.quality !== PRODUCTION_ASSET_QUALITY ||
    request.size !== USAGE_STILL_SIZE ||
    request.operation !== "generations" ||
    request.referenceImagePath
  ) {
    lines.ERROR_MESSAGE = "BLOCKED_BEFORE_FETCH";
    finish();
    return;
  }

  let paid = 0;
  try {
    paid = 1;
    const bytes = await createOpenAiImageProvider().create(request);
    writeFileSync(imagePath, bytes);
    const image = decodePng(bytes);
    if (image.width !== 1024 || image.height !== 1024 || bytes.length < 1) {
      lines.REAL_API_CALLS = "1";
      lines.GENERATION = "PERSISTED_UNVALIDATED";
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
          assetId: ASSET_ID,
          semanticRole: "USAGE_VISUAL",
          semanticRoles: ["USAGE_VISUAL"],
          campaignId: metadata.campaignId,
          manifestVersion: manifest.manifestVersion,
          visualMasterVersion: metadata.masterVersion,
          artDirectionVersion: metadata.artDirectorVersion,
          model: request.model,
          quality: request.quality,
          size: request.size,
          promptVersion: USAGE_STILL_PROMPT_VERSION,
          createdAt: new Date().toISOString(),
          containsProduct: false,
          containsPerson: false,
          textAllowed: false,
          generatedAssetIsEvidence: false,
          factualAuthority: false,
          evidenceAuthority: false,
          imageTextReimportAllowed: false,
          sourceVisualMaster: "visual-master/master.png",
          humanReview: "PENDING",
          approved: false,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    lines.REAL_API_CALLS = String(paid);
    lines.ERROR_MESSAGE = redact(error instanceof Error ? error.message : "usage asset generation failed");
    lines.GO_NO_GO = "OPENAI_API_ERROR";
    lines.FINAL_STATUS = "FAILED";
    finish();
    return;
  }

  if (!existsSync(provenancePath) || statSync(imagePath).size < 1) {
    lines.REAL_API_CALLS = "1";
    lines.GO_NO_GO = "ASSET_PERSISTENCE_FAILED";
    lines.FINAL_STATUS = "NEEDS_FIX";
    finish();
    return;
  }
  const planPath = path.join(provenanceDir, "plan.json");
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as { generatedFiles?: string[] };
  const listed = new Set(plan.generatedFiles ?? []);
  listed.add(`generated/${ASSET_ID}.png`);
  plan.generatedFiles = [...listed];
  writeFileSync(planPath, JSON.stringify(plan, null, 2));
  const image = decodePng(readFileSync(imagePath));
  lines.REAL_API_CALLS = "1";
  lines.GENERATION = "GENERATED";
  lines.GO_NO_GO = "USAGE_VISUAL_READY_FOR_HUMAN_REVIEW";
  lines.FINAL_STATUS = "READY";
  finish();
  console.log(`ARTIFACT_PATH=${imagePath}`);
  console.log(`PROVENANCE_PATH=${provenancePath}`);
  console.log(`DIMENSIONS=${image.width}x${image.height}`);
  console.log(`FILE_SIZE=${statSync(imagePath).size}`);
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : "usage asset generation failed"));
  process.exit(1);
});
