/**
 * Generates the P0 decorative assets of a replay's visual manifest.
 * One paid image call per P0 generation group, hard-capped.
 *
 * Decorative only: the contract in asset-production.ts refuses any asset
 * that would carry the product, a person, or text.
 *
 * npx tsx scripts/visual-qa/generate-visual-assets-v1.ts --dir=<replay dir> [--max=3]
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodePng } from "../../src/lib/visual-concept/compose.ts";
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
import { createOpenAiImageProvider } from "../../src/lib/visual-concept/provider.ts";
import type { ArtDirectionBrief } from "../../src/lib/visual-concept/art-director.ts";

const dir = process.argv.find((item) => item.startsWith("--dir="))?.slice(6);
if (!dir) throw new Error("--dir is required");
const maxCalls = Number(process.argv.find((item) => item.startsWith("--max="))?.slice(6) ?? "3");
const root = path.join(dir, "visual-construction-v1");
const generatedDir = path.join(root, "generated");
const provenanceDir = path.join(root, "provenance");

function redact(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function parseEnvFile(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[trimmed.slice(0, eq).trim()] = value;
  }
  return values;
}
if (!process.env.OPENAI_API_KEY?.trim()) {
  const local = parseEnvFile(path.join(process.cwd(), ".env.local")).OPENAI_API_KEY;
  if (local) process.env.OPENAI_API_KEY = local;
}

const requirements = JSON.parse(readFileSync(path.join(root, "asset-requirements.json"), "utf8")) as { manifest: VisualAssetManifest };
const manifest = requirements.manifest;
const art = JSON.parse(readFileSync(path.join(root, "art-direction.json"), "utf8")) as ArtDirectionBrief;

/** The shared world of the set, taken from this product's own art direction. */
const world = [
  art.photographicLanguage,
  `Materials: ${art.materialVocabulary.join(", ")}.`,
  art.depthStrategy,
  `Mood: ${art.mood}`,
  `Avoid: ${art.avoidPatterns.join(", ")}.`,
].join(" ");

async function main() {
  const errors = validateVisualAssetManifest(manifest);
  if (errors.length > 0) {
    console.log(`STOP=MANIFEST_INVALID ${errors.join("; ")}`);
    return;
  }
  const groups = p0ProductionGroups(manifest);
  const jobs = groups.map((group) => ({ generationGroup: group, assetId: `${group}-v1` }));
  if (jobs.length > maxCalls) {
    console.log(`STOP=BUDGET_EXCEEDED groups=${jobs.length} max=${maxCalls}`);
    return;
  }
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(provenanceDir, { recursive: true });

  const provider = createOpenAiImageProvider();
  let paid = 0;
  for (const job of jobs) {
    const imagePath = path.join(generatedDir, `${job.assetId}.png`);
    if (existsSync(imagePath) && statSync(imagePath).size > 0) {
      console.log(`${job.assetId} EXISTING`);
      continue;
    }
    const request = buildProductionAssetRequest({ manifest, job, world });
    if (
      request.model !== PRODUCTION_ASSET_MODEL ||
      request.quality !== PRODUCTION_ASSET_QUALITY ||
      request.size !== PRODUCTION_ASSET_SIZE ||
      request.operation !== "generations" ||
      request.referenceImagePath
    ) {
      console.log("STOP=REQUEST_CONTRACT_REJECTED");
      return;
    }
    if (paid >= maxCalls) {
      console.log("STOP=BUDGET_EXCEEDED");
      return;
    }
    paid += 1;
    let bytes: Buffer;
    try {
      bytes = await provider.create(request);
    } catch (error) {
      console.log(`${job.assetId} FAILED ${redact(error instanceof Error ? error.message : "image generation failed")}`);
      console.log(`OPENAI_IMAGE_CALLS=${paid}`);
      return;
    }
    writeFileSync(imagePath, bytes);
    const image = decodePng(bytes);
    const roles = productionAssetRoles(manifest, job.generationGroup);
    writeFileSync(
      path.join(provenanceDir, `${job.assetId}.json`),
      `${JSON.stringify(
        {
          assetId: job.assetId,
          semanticRoles: roles,
          campaignSlug: manifest.campaignSlug,
          contentVersion: manifest.contentVersion,
          manifestVersion: manifest.manifestVersion,
          artDirectorVersion: art.artDirectorVersion,
          model: request.model,
          quality: request.quality,
          size: request.size,
          promptVersion: VISUAL_ASSET_PROMPT_VERSION,
          prompt: request.prompt,
          createdAt: new Date().toISOString(),
          provenance: "GENERATED_DECORATIVE",
          containsProduct: false,
          containsPerson: false,
          textAllowed: false,
          generatedAssetIsEvidence: false,
          factualAuthority: false,
          evidenceAuthority: false,
          imageTextReimportAllowed: false,
          sourcePackshotRedrawn: false,
          humanReview: "PENDING",
          approved: false,
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    console.log(`${job.assetId} GENERATED ${image.width}x${image.height} roles=${roles.join(",")} bytes=${bytes.length}`);
  }
  console.log(`OPENAI_IMAGE_CALLS=${paid}`);
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : "generation failed"));
  process.exit(1);
});
