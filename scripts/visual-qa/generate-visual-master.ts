import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { validateGrounding } from "../../src/lib/ai/grounding-validator.ts";
import { presellPageFaqAuthorityBindings } from "../../src/lib/ai/presell-faq-authority.ts";
import { getCampaignBySlug } from "../../src/lib/campaigns.ts";
import { applyGenericFaqRecovery } from "../../src/lib/faq-field-promotion.ts";
import { lintCampaign } from "../../src/lib/policy-linter.ts";
import { consumerVisibleText, parsePresellPage } from "../../src/lib/presell-page.ts";
import { applyProductionCandidate } from "../../src/lib/production-candidate-view.ts";
import { resolvePublicationGate } from "../../src/lib/publication.ts";
import { buildVisualBrief, resolvePackshotPath } from "../../src/lib/visual-concept/brief.ts";
import { decodePng, inspectPackshotFile } from "../../src/lib/visual-concept/compose.ts";
import { visualConceptConfig } from "../../src/lib/visual-concept/config.ts";
import { directVisualMaster } from "../../src/lib/visual-concept/master-art-director.ts";
import { generateVisualMaster, planVisualMaster } from "../../src/lib/visual-concept/master.ts";
import { buildVisualMasterPrompt } from "../../src/lib/visual-concept/master-prompt.ts";
import { inspectPackshotSeparation } from "../../src/lib/visual-concept/packshot-separation.ts";
import { createOpenAiImageProvider, type ConceptImageRequest } from "../../src/lib/visual-concept/provider.ts";
import { visualDesignRoot } from "../../src/lib/visual-concept/store.ts";

const SLUG = "joint-genesis-controlled-ready-13";
const REFERENCES = [
  { direction: "PREMIUM_EDITORIAL" as const, generationId: "ff3f7440-f6fd-45fd-aa2d-6ff7ef01537d", file: "concepts/a/concept.png" },
  { direction: "PREMIUM_PRODUCT" as const, generationId: "483118f8-b982-4edc-8353-6abc45f97a0e", file: "concepts/b/concept.png" },
  { direction: "PREMIUM_CONVERSION" as const, generationId: "98ba51cb-b14b-4a26-b3c6-d960ec0e9a6d", file: "concepts/c/concept.png" },
];

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

function stamp(file: string): string {
  const stat = statSync(file);
  return `${stat.size}:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

async function main() {
  const lines: Record<string, string> = {
    OPENAI_API_KEY_CONFIGURED: "NO",
    CAMPAIGN_FOUND: "NO",
    CONTENT_SOURCE: "",
    VISUAL_BRIEF: "NO",
    MASTER_ART_DIRECTION: "NO",
    A_REFERENCE_FOUND: "NO",
    B_REFERENCE_FOUND: "NO",
    C_REFERENCE_FOUND: "NO",
    SOURCE_PACKSHOT_FOUND: "NO",
    PRODUCT_ONLY_EXTRACTION: "",
    PACKSHOT_COMPOSITION_READY: "NO",
    MASTER_MODEL_AVAILABLE: "NO",
    MASTER_SIZE_SUPPORTED: "NO",
    OUTPUT_DIRECTORY_READY: "NO",
    DRY_RUN: "NO",
    REAL_API_CALLS: "0",
    MODEL: "",
    QUALITY: "",
    SIZE: "",
    API_REQUEST: "NOT_SENT",
    IMAGE_RETURNED: "NO",
    AUTOMATIC_RETRY: "NO",
    PAID_FALLBACK: "NO",
    EXPLORATION_REGENERATION: "NO",
    GO_NO_GO: "VISUAL_MASTER_PIPELINE_NEEDS_FIX",
    FINAL_STATUS: "NEEDS_FIX",
    ERROR_MESSAGE: "",
  };
  const finish = () => {
    for (const [name, value] of Object.entries(lines)) {
      if (name === "ERROR_MESSAGE" && !value) continue;
      console.log(`${name}=${value}`);
    }
  };

  lines.OPENAI_API_KEY_CONFIGURED = loadKey() ? "YES" : "NO";
  const campaign = getCampaignBySlug(SLUG);
  lines.CAMPAIGN_FOUND = campaign ? "YES" : "NO";
  const frozen = existsSync(path.join("data", "web-anatomy-lab", "v1", "controlled-rich-replay-v4"));
  lines.CONTENT_SOURCE = campaign?.productionPresentation === "premium-final-candidate-v2" && frozen ? "FROZEN_V4" : "NO";
  const brief = campaign ? buildVisualBrief(campaign) : null;
  lines.VISUAL_BRIEF = brief && brief.allowedCopy.length > 0 ? "READY" : "NO";
  const art = brief ? directVisualMaster(brief) : null;
  lines.MASTER_ART_DIRECTION =
    art?.masterDirection === "HYBRID_A_B_C" && art.baseVisualLanguage === "A_EDITORIAL" ? "READY" : "NO";
  const runRoot = path.join("data", "visual-design", SLUG, "runs");
  const refFiles = REFERENCES.map((item) => path.join(runRoot, item.generationId, item.file));
  lines.A_REFERENCE_FOUND = existsSync(refFiles[0]!) ? "YES" : "NO";
  lines.B_REFERENCE_FOUND = existsSync(refFiles[1]!) ? "YES" : "NO";
  lines.C_REFERENCE_FOUND = existsSync(refFiles[2]!) ? "YES" : "NO";
  const packshot = brief?.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
  const packshotPath = packshot ? resolvePackshotPath(packshot.src) : null;
  lines.SOURCE_PACKSHOT_FOUND = packshotPath ? "YES" : "NO";
  const separation = packshotPath ? inspectPackshotSeparation(decodePng(readFileSync(packshotPath))) : null;
  lines.PRODUCT_ONLY_EXTRACTION = separation?.classification ?? "NO";
  const inspection = packshotPath ? inspectPackshotFile(packshotPath) : null;
  lines.PACKSHOT_COMPOSITION_READY = inspection?.usableTransparency ? "YES" : "NO";
  const config = visualConceptConfig();
  lines.MASTER_MODEL_AVAILABLE = config.masterModel === "gpt-image-2.5-sunburst" ? "YES" : "NO";
  lines.MASTER_SIZE_SUPPORTED = config.masterSize === "1024x1536" && config.masterQuality === "high" ? "YES" : "NO";
  lines.MODEL = config.masterModel;
  lines.QUALITY = config.masterQuality;
  lines.SIZE = config.masterSize;
  const out = visualDesignRoot();
  try {
    mkdirSync(out, { recursive: true });
    accessSync(out, constants.W_OK);
    lines.OUTPUT_DIRECTORY_READY = "YES";
  } catch {
    lines.OUTPUT_DIRECTORY_READY = "NO";
  }
  const masterDir = path.join(out, SLUG, "visual-master");
  if (existsSync(path.join(masterDir, "master.png")) || existsSync(path.join(masterDir, "raw.png"))) {
    lines.DRY_RUN = "YES";
    lines.GO_NO_GO = "VISUAL_MASTER_PIPELINE_NEEDS_FIX";
    lines.ERROR_MESSAGE = "master artifacts already exist";
    finish();
    return;
  }
  const plan = campaign ? planVisualMaster(campaign) : null;
  const prompt = brief && art ? buildVisualMasterPrompt(brief, art) : "";
  const promptReady =
    prompt.includes("Leave one blank product stage") &&
    prompt.includes("Do not remove, inpaint, or reconstruct") &&
    !prompt.includes("gpt-image-2.5-flare") &&
    Boolean(campaign && !prompt.includes(campaign.affiliateUrl));
  lines.DRY_RUN =
    lines.OPENAI_API_KEY_CONFIGURED === "YES" &&
    lines.CAMPAIGN_FOUND === "YES" &&
    lines.CONTENT_SOURCE === "FROZEN_V4" &&
    lines.VISUAL_BRIEF === "READY" &&
    lines.MASTER_ART_DIRECTION === "READY" &&
    lines.A_REFERENCE_FOUND === "YES" &&
    lines.B_REFERENCE_FOUND === "YES" &&
    lines.C_REFERENCE_FOUND === "YES" &&
    lines.SOURCE_PACKSHOT_FOUND === "YES" &&
    lines.PRODUCT_ONLY_EXTRACTION === "NOT_SAFELY_SEPARABLE" &&
    lines.PACKSHOT_COMPOSITION_READY === "YES" &&
    lines.MASTER_MODEL_AVAILABLE === "YES" &&
    lines.MASTER_SIZE_SUPPORTED === "YES" &&
    lines.OUTPUT_DIRECTORY_READY === "YES" &&
    plan?.plannedImageCount === 1 &&
    promptReady
      ? "PASS"
      : "FAIL";
  if (lines.DRY_RUN !== "PASS" || !campaign || !brief) {
    if (lines.MASTER_MODEL_AVAILABLE !== "YES") lines.GO_NO_GO = "MASTER_MODEL_UNAVAILABLE";
    else if (lines.MASTER_SIZE_SUPPORTED !== "YES") lines.GO_NO_GO = "MASTER_CONFIGURATION_UNSUPPORTED";
    else if (lines.CONTENT_SOURCE !== "FROZEN_V4") lines.GO_NO_GO = "CONTENT_SAFETY_REGRESSION";
    finish();
    return;
  }

  const factsBefore = campaign.sourceFactsJson;
  const presentationBefore = campaign.productionPresentation;
  const explorationBefore = refFiles.map(stamp);
  const packshotBefore = stamp(packshotPath!);
  let paid = 0;
  const provider = createOpenAiImageProvider();
  try {
    const result = await generateVisualMaster(
      {
        campaign,
        confirmGeneration: true,
        explorationReferences: REFERENCES.map((item) => ({ direction: item.direction, generationId: item.generationId })),
        now: () => new Date().toISOString(),
      },
      {
        root: out,
        apiKeyConfigured: () => true,
        provider: {
          async create(input: ConceptImageRequest) {
            if (
              input.model !== "gpt-image-2.5-sunburst" ||
              input.quality !== "high" ||
              input.size !== "1024x1536" ||
              input.operation !== "generations" ||
              input.referenceImagePath ||
              input.outputFormat !== "png"
            ) {
              throw new Error("BLOCKED_BEFORE_FETCH");
            }
            paid += 1;
            if (paid > 1) throw new Error("BLOCKED_BEFORE_FETCH");
            return provider.create(input);
          },
        },
      },
    );
    lines.REAL_API_CALLS = String(paid);
    lines.API_REQUEST = paid === 1 ? "SENT" : "NOT_SENT";
    if (result.status === "API_ERROR") {
      lines.GO_NO_GO = result.errorMessage === "BLOCKED_BEFORE_FETCH" && paid === 0 ? "VISUAL_MASTER_PIPELINE_NEEDS_FIX" : "OPENAI_API_ERROR";
      lines.ERROR_MESSAGE = redact(result.errorMessage);
      lines.FINAL_STATUS = "FAILED";
      finish();
      return;
    }
    if (result.status === "COMPOSITION_FAILED") {
      lines.IMAGE_RETURNED = "YES";
      lines.GO_NO_GO = "PACKSHOT_COMPOSITION_FAILED";
      lines.FINAL_STATUS = "NEEDS_FIX";
      finish();
      return;
    }
    if (result.status !== "GENERATED" || paid !== 1) {
      lines.GO_NO_GO = "VISUAL_MASTER_PIPELINE_NEEDS_FIX";
      lines.ERROR_MESSAGE = result.status;
      finish();
      return;
    }
    lines.IMAGE_RETURNED = "YES";
    const rendered = applyProductionCandidate(campaign);
    const policy = lintCampaign(rendered).gate;
    const recovered = applyGenericFaqRecovery(JSON.parse(campaign.sourceFactsJson));
    const parsed = parsePresellPage(rendered.pageComposition);
    const grounding = validateGrounding(parsed ? consumerVisibleText(parsed) : "", recovered, {
      faqAuthorities: parsed ? presellPageFaqAuthorityBindings(parsed, recovered) : [],
    });
    const gate = resolvePublicationGate(campaign);
    const explorationSame = explorationBefore.every((value, index) => value === stamp(refFiles[index]!));
    const packshotSame = stamp(packshotPath!) === packshotBefore;
    const factsSame = campaign.sourceFactsJson === factsBefore && campaign.productionPresentation === presentationBefore;
    if (!explorationSame) lines.EXPLORATION_REGENERATION = "YES";
    if (!factsSame || !packshotSame || grounding.status !== "GROUNDED" || grounding.unsupportedClaims.length !== 0 || policy !== "READY" || gate !== "READY") {
      lines.GO_NO_GO = "CONTENT_SAFETY_REGRESSION";
      lines.FINAL_STATUS = "NEEDS_FIX";
      finish();
      return;
    }
    lines.GO_NO_GO = "VISUAL_MASTER_V1_READY_FOR_HUMAN_REVIEW";
    lines.FINAL_STATUS = "READY";
  } catch (error) {
    lines.REAL_API_CALLS = String(paid);
    lines.API_REQUEST = paid > 0 ? "SENT" : "NOT_SENT";
    lines.GO_NO_GO = paid > 0 ? "OPENAI_API_ERROR" : "VISUAL_MASTER_PIPELINE_NEEDS_FIX";
    lines.FINAL_STATUS = paid > 0 ? "FAILED" : "NEEDS_FIX";
    lines.ERROR_MESSAGE = redact(error instanceof Error ? error.message : "master generation failed");
  }
  finish();
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : "master generation failed"));
  process.exit(1);
});
