/**
 * Generates the three authorized decorative plates for one campaign slug.
 * Skips a plate when its file and provenance already exist.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { buildDecorativePlatePrompt, DECORATIVE_PLATE_PROMPT_VERSION } from "../../src/lib/visual-concept/asset-production.ts";
import { visualConceptConfig } from "../../src/lib/visual-concept/config.ts";
import { createOpenAiImageProvider } from "../../src/lib/visual-concept/provider.ts";
import { readPersistedVisualIdentity } from "../../src/lib/visual-identity/persist.ts";
import { motifFromAuthorizedCopy } from "../../src/lib/premium/section-art-director.ts";

const CANDIDATE_ID = "cand_a5a9a7e22e5e410e";
const SLUG = `validation-${CANDIDATE_ID}`;
const PLATES = [
  { assetId: "hero-atmosphere-v1", purpose: "HERO_ATMOSPHERE", section: "hero", role: "HERO_ATMOSPHERE" },
  { assetId: "feature-texture-v1", purpose: "FEATURE_TEXTURE", section: "features", role: "FEATURE_VISUAL" },
  { assetId: "closing-light-v1", purpose: "CLOSING_LIGHT", section: "closing", role: "DECISION_BACKGROUND" },
] as const;

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
  return Boolean(key && ignored);
}

async function main() {
  if (!loadKey()) {
    console.log("BLOCKED_MISSING_API_KEY");
    process.exit(1);
  }
  const db = new Database(path.join("data", "presell-os.db"), { readonly: true, fileMustExist: true });
  const row = db.prepare("select factsJson, pageCompositionJson from validation_candidates where id = ?").get(CANDIDATE_ID) as
    | { factsJson: string; pageCompositionJson: string }
    | undefined;
  db.close();
  if (!row) {
    console.log("CANDIDATE_MISSING");
    process.exit(1);
  }
  const facts = JSON.parse(row.factsJson) as { sourceUrl?: string };
  const page = JSON.parse(row.pageCompositionJson) as {
    hero?: { headline?: string; summary?: string; subheadline?: string };
    sections?: Array<{ title?: string; paragraphs?: string[]; bullets?: string[] }>;
  };
  const copy = [
    page.hero?.headline,
    page.hero?.summary,
    page.hero?.subheadline,
    ...(page.sections ?? []).flatMap((section) => [section.title, ...(section.paragraphs ?? []), ...(section.bullets ?? [])]),
  ]
    .filter(Boolean)
    .join(" ");
  const identity = readPersistedVisualIdentity(facts.sourceUrl);
  const palette = identity
    ? [identity.applied.background, identity.applied.accent, identity.applied.accentStrong, identity.applied.text]
    : [];
  const motif = motifFromAuthorizedCopy(copy);
  const config = visualConceptConfig();
  const root = path.join("data", "visual-design", SLUG, "visual-master", "assets");
  const generatedDir = path.join(root, "generated");
  const provenanceDir = path.join(root, "provenance");
  mkdirSync(generatedDir, { recursive: true });
  mkdirSync(provenanceDir, { recursive: true });
  const provider = createOpenAiImageProvider();
  let calls = 0;
  for (const plate of PLATES) {
    const imageFile = path.join(generatedDir, `${plate.assetId}.png`);
    const provenanceFile = path.join(provenanceDir, `${plate.assetId}.json`);
    if (existsSync(imageFile) && existsSync(provenanceFile)) {
      console.log(`${plate.purpose}=REUSED`);
      continue;
    }
    const prompt = buildDecorativePlatePrompt({ purpose: plate.purpose, motif, palette });
    const bytes = await provider.create({
      model: config.conceptModel,
      prompt,
      size: "1536x1024",
      quality: config.quality,
      outputFormat: "png",
      idempotencyKey: `${DECORATIVE_PLATE_PROMPT_VERSION}:${SLUG}:${plate.assetId}`,
      operation: "generations",
    });
    calls += 1;
    writeFileSync(imageFile, bytes);
    writeFileSync(
      provenanceFile,
      JSON.stringify(
        {
          assetId: plate.assetId,
          semanticRoles: [plate.role],
          section: plate.section,
          purpose: plate.purpose,
          assetType: "DECORATIVE_GENERATED",
          provider: "openai-images",
          model: config.conceptModel,
          quality: config.quality,
          size: "1536x1024",
          promptVersion: DECORATIVE_PLATE_PROMPT_VERSION,
          motif,
          factualAuthority: "NONE",
          containsProduct: false,
          containsPerson: false,
          textAllowed: false,
          generatedAssetIsEvidence: false,
          evidenceAuthority: false,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(`${plate.purpose}=GENERATED bytes=${bytes.length}`);
  }
  console.log(`AI_IMAGE_CALLS=${calls}`);
  console.log(`MODEL=${config.conceptModel}`);
  console.log(`MOTIF=${motif}`);
  console.log(`SLUG=${SLUG}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "generation failed";
  console.log(`ERROR=${message.replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]")}`);
  process.exit(1);
});
