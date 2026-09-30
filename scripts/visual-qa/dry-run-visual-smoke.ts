import { accessSync, constants, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../../src/lib/campaigns.ts";
import { resolvePublicationGate } from "../../src/lib/publication.ts";
import { buildVisualBrief, resolvePackshotPath } from "../../src/lib/visual-concept/brief.ts";
import { visualConceptConfig } from "../../src/lib/visual-concept/config.ts";
import { planVisualConceptGeneration } from "../../src/lib/visual-concept/engine.ts";
import { buildVisualConceptPrompt } from "../../src/lib/visual-concept/prompt.ts";
import { visualDesignRoot } from "../../src/lib/visual-concept/store.ts";

const stored = getCampaignBySlug("joint-genesis-controlled-ready-13");
console.log("CAMPAIGN_FOUND=" + (stored ? "YES" : "NO"));
if (!stored) process.exit(0);
const beforeFacts = stored.sourceFactsJson;
const beforePresentation = stored.productionPresentation;
const brief = buildVisualBrief(stored);
const plan = planVisualConceptGeneration(stored);
const config = visualConceptConfig();
const packshot = brief?.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
const packshotPath = packshot ? resolvePackshotPath(packshot.src) : null;
let readable = false;
let bytes = 0;
let signature = "none";
if (packshotPath) {
  try {
    accessSync(packshotPath, constants.R_OK);
    const stat = statSync(packshotPath);
    bytes = stat.size;
    readable = bytes > 0;
    const head = readFileSync(packshotPath).subarray(0, 8);
    signature =
      head[0] === 0x89 && head[1] === 0x50
        ? "png"
        : head[0] === 0xff && head[1] === 0xd8
          ? "jpeg"
          : head[0] === 0x52 && head[1] === 0x49
            ? "webp"
            : "other";
  } catch {
    readable = false;
  }
}
const prompt = brief ? buildVisualConceptPrompt(brief, "PREMIUM_PRODUCT") : "";
const out = visualDesignRoot();
let writable = false;
try {
  mkdirSync(out, { recursive: true });
  accessSync(out, constants.W_OK);
  writable = true;
} catch {
  writable = false;
}
console.log("PUBLICATION_STATUS=" + stored.publicationStatus);
console.log("PRESENTATION=" + beforePresentation);
console.log("GATE=" + resolvePublicationGate(stored));
console.log("FACTS_UNCHANGED=" + (stored.sourceFactsJson === beforeFacts ? "YES" : "NO"));
console.log("VISUAL_BRIEF=" + (brief ? "YES" : "NO"));
console.log("ALLOWED_COPY_COUNT=" + (brief?.allowedCopy.length ?? 0));
console.log("FORBIDDEN_CLAIMS_COUNT=" + (brief?.forbiddenClaims.length ?? 0));
console.log("PACKSHOT_FOUND=" + (packshot ? "YES" : "NO"));
console.log("PACKSHOT_READABLE=" + (readable ? "YES" : "NO"));
console.log("PACKSHOT_BYTES=" + bytes);
console.log("PACKSHOT_SIGNATURE=" + signature);
console.log("PROMPT_READY=" + (prompt.includes("PREMIUM_PRODUCT") && prompt.includes("VISUAL OBJECTIVE") ? "YES" : "NO"));
console.log("PROMPT_CHARS=" + prompt.length);
console.log("OUTPUT_DIRECTORY_READY=" + (writable ? "YES" : "NO"));
console.log("OUTPUT_DIRECTORY=" + path.relative(process.cwd(), out));
console.log("MODEL=" + config.conceptModel);
console.log("QUALITY=" + config.quality);
console.log("SIZE=" + config.size);
console.log("OPERATION=" + plan?.operation);
console.log("ESTIMATED_CALL_COUNT=" + plan?.estimatedCallCount);
console.log("OPENAI_API_KEY_CONFIGURED=" + (process.env.OPENAI_API_KEY?.trim() ? "YES" : "NO"));
console.log("PROMPT_HAS_REQUIRED_SECTIONS=" + (prompt.includes("FORBIDDEN CLAIMS") && prompt.includes("OUTPUT INTENT") ? "YES" : "NO"));
