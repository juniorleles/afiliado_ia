import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../../src/lib/campaigns.ts";
import { buildVisualBrief, resolvePackshotPath } from "../../src/lib/visual-concept/brief.ts";
import { generateVisualConcepts, planVisualConceptGeneration } from "../../src/lib/visual-concept/engine.ts";
import { buildVisualConceptPrompt } from "../../src/lib/visual-concept/prompt.ts";
import { createOpenAiImageProvider, type ConceptImageRequest } from "../../src/lib/visual-concept/provider.ts";
import { visualDesignRoot } from "../../src/lib/visual-concept/store.ts";

function parseEnv(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[name] = value;
  }
  return values;
}

function redact(message: string): string {
  return message.replace(/sk-[A-Za-z0-9_\-]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function classify(message: string): string {
  if (/status 401|authentication|invalid_api_key/i.test(message)) return "OPENAI_AUTHENTICATION_FAILED";
  if (/status 403|permission|insufficient permissions/i.test(message)) return "OPENAI_PERMISSION_FAILED";
  if (/status 402|status 429|billing|quota|insufficient_quota/i.test(message)) return "OPENAI_BILLING_BLOCKED";
  if (/status 400|status 404|model/i.test(message)) return "API_CONFIGURATION_NEEDS_FIX";
  return "FAILED";
}

function keyChecks(): { configured: boolean; ignored: boolean; leaked: boolean; exposed: boolean } {
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
  let leaked = false;
  let exposed = false;
  if (key) {
    const listed = execSync("git ls-files -z", { encoding: "buffer" });
    for (const name of listed.toString("utf8").split("\0").filter(Boolean)) {
      try {
        if (readFileSync(name).includes(Buffer.from(key))) leaked = true;
      } catch {
        // unreadable tracked path
      }
    }
    const surfaces = execSync("git ls-files -z src", { encoding: "buffer" });
    for (const name of surfaces.toString("utf8").split("\0").filter(Boolean)) {
      const text = readFileSync(name, "utf8");
      if (text.includes("NEXT_PUBLIC_OPENAI") || text.includes(key)) exposed = true;
    }
    if (existsSync(".env.example") && readFileSync(".env.example").includes(Buffer.from(key))) exposed = true;
  }
  return { configured: Boolean(key), ignored, leaked, exposed };
}

async function main() {
  const checks = keyChecks();
  const lines: Record<string, string> = {
    OPENAI_API_KEY_CONFIGURED: checks.configured ? "YES" : "NO",
    CONCEPT_SIZE: "1024x1536",
    SINGLE_DIRECTION_GENERATION_SUPPORTED: "YES",
    DRY_RUN: "FAIL",
    REAL_API_CALLS: "0",
    API_REQUEST: "NOT_SENT",
    IMAGE_RETURNED: "NO",
    IMAGE_PERSISTED: "NO",
    ARTIFACT_PATH: "",
    GO_NO_GO: "VISUAL_ENGINE_NEEDS_FIX",
    FINAL_STATUS: "NEEDS_FIX",
  };
  const finish = () => {
    for (const [name, value] of Object.entries(lines)) console.log(`${name}=${value}`);
  };
  if (!checks.configured || !checks.ignored || checks.leaked || checks.exposed) {
    lines.GO_NO_GO = checks.leaked || checks.exposed ? "CONTENT_SAFETY_REGRESSION" : "VISUAL_ENGINE_NEEDS_FIX";
    finish();
    return;
  }

  const campaign = getCampaignBySlug("joint-genesis-controlled-ready-13");
  const factsBefore = campaign?.sourceFactsJson ?? null;
  const brief = campaign ? buildVisualBrief(campaign) : null;
  const smokeEnv: NodeJS.ProcessEnv = {
    VISUAL_CONCEPT_MODEL: "gpt-image-2.5-flare",
    VISUAL_MASTER_MODEL: "gpt-image-2.5-sunburst",
    VISUAL_CONCEPT_QUALITY: "low",
    VISUAL_CONCEPT_SIZE: "1024x1536",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  const plan = campaign ? planVisualConceptGeneration(campaign, smokeEnv, ["PREMIUM_PRODUCT"]) : null;
  const packshot = brief?.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
  const packshotPath = packshot ? resolvePackshotPath(packshot.src) : null;
  let packshotReadable = false;
  if (packshotPath) {
    try {
      accessSync(packshotPath, constants.R_OK);
      packshotReadable = statSync(packshotPath).size > 0;
    } catch {
      packshotReadable = false;
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
  const dryPass = Boolean(
    campaign &&
      brief &&
      brief.allowedCopy.length > 0 &&
      brief.forbiddenClaims.length > 0 &&
      packshotReadable &&
      prompt.includes("PREMIUM_PRODUCT") &&
      !prompt.includes("PREMIUM_EDITORIAL") &&
      !prompt.includes("PREMIUM_CONVERSION") &&
      writable &&
      plan &&
      plan.model === "gpt-image-2.5-flare" &&
      plan.quality === "low" &&
      plan.size === "1024x1536" &&
      plan.estimatedCallCount === 1 &&
      plan.operation === "edits" &&
      plan.masterModel === "gpt-image-2.5-sunburst",
  );
  lines.CONCEPT_SIZE = plan?.size ?? "MISSING";
  lines.DRY_RUN = dryPass ? "PASS" : "FAIL";
  if (!dryPass || !campaign) {
    lines.GO_NO_GO = "API_CONFIGURATION_NEEDS_FIX";
    finish();
    return;
  }

  let sent = 0;
  const real = createOpenAiImageProvider();
  try {
    const result = await generateVisualConcepts(
      {
        campaign,
        generationReason: "controlled visual engine smoke test",
        generationRequestId: randomUUID(),
        confirmGeneration: true,
        directions: ["PREMIUM_PRODUCT"],
      },
      {
        root: out,
        env: smokeEnv,
        apiKeyConfigured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
        provider: {
          async create(input: ConceptImageRequest) {
            if (sent >= 1) throw new Error("blocked second image call");
            if (input.model !== "gpt-image-2.5-flare" || input.quality !== "low" || input.size !== "1024x1536") {
              throw new Error("blocked unexpected image settings");
            }
            sent += 1;
            return real.create(input);
          },
        },
      },
    );
    lines.REAL_API_CALLS = String(sent);
    if (result.status !== "GENERATED" || result.providerCalls !== 1 || !result.run) {
      lines.API_REQUEST = "NOT_SENT";
      lines.GO_NO_GO = "VISUAL_ENGINE_NEEDS_FIX";
      lines.FINAL_STATUS = "NEEDS_FIX";
      finish();
      return;
    }
    const concept = result.run.concepts[0];
    const bytes = concept ? statSync(concept.imageFile).size : 0;
    const metadataOk = Boolean(
      concept &&
        concept.metadata.direction === "PREMIUM_PRODUCT" &&
        concept.metadata.model === "gpt-image-2.5-flare" &&
        concept.metadata.quality === "low" &&
        concept.metadata.size === "1024x1536" &&
        concept.metadata.generatedVisualIsEvidence === false &&
        concept.metadata.campaignId === campaign.id,
    );
    const metadataText = concept ? readFileSync(path.join(path.dirname(concept.imageFile), "metadata.json"), "utf8") : "";
    const secretInArtifact = metadataText.includes("sk-") || metadataText.includes(process.env.OPENAI_API_KEY || "missing-key-sentinel");
    lines.API_REQUEST = "SUCCESS";
    lines.IMAGE_RETURNED = bytes > 0 ? "YES" : "NO";
    lines.IMAGE_PERSISTED = bytes > 0 && metadataOk && !secretInArtifact ? "YES" : "NO";
    lines.ARTIFACT_PATH = concept ? path.relative(process.cwd(), concept.imageFile) : "";
    const factsChanged = campaign.sourceFactsJson !== factsBefore;
    if (factsChanged || secretInArtifact || bytes === 0 || !metadataOk) {
      lines.GO_NO_GO = factsChanged ? "CONTENT_SAFETY_REGRESSION" : "VISUAL_ENGINE_NEEDS_FIX";
      lines.FINAL_STATUS = "NEEDS_FIX";
    } else {
      lines.GO_NO_GO = "OPENAI_VISUAL_SMOKE_TEST_PASSED";
      lines.FINAL_STATUS = "READY";
    }
    finish();
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : "image request failed");
    lines.REAL_API_CALLS = String(sent);
    lines.API_REQUEST = sent > 0 ? "FAILED" : "NOT_SENT";
    lines.GO_NO_GO = sent > 0 ? classify(message) : "VISUAL_ENGINE_NEEDS_FIX";
    lines.FINAL_STATUS = "FAILED";
    finish();
    console.log("ERROR_MESSAGE=" + message);
  }
}

main();
