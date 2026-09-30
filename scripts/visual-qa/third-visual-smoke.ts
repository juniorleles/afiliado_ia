import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { validateGrounding } from "../../src/lib/ai/grounding-validator.ts";
import { presellPageFaqAuthorityBindings } from "../../src/lib/ai/presell-faq-authority.ts";
import { ART_DIRECTION_VERSION, directVisualArt } from "../../src/lib/visual-concept/art-director.ts";
import { getCampaignBySlug } from "../../src/lib/campaigns.ts";
import { applyGenericFaqRecovery } from "../../src/lib/faq-field-promotion.ts";
import { lintCampaign } from "../../src/lib/policy-linter.ts";
import { consumerVisibleText, parsePresellPage } from "../../src/lib/presell-page.ts";
import { applyProductionCandidate } from "../../src/lib/production-candidate-view.ts";
import { resolvePublicationGate } from "../../src/lib/publication.ts";
import { buildVisualBrief, resolvePackshotPath } from "../../src/lib/visual-concept/brief.ts";
import { inspectPackshotFile } from "../../src/lib/visual-concept/compose.ts";
import { VISUAL_CONCEPT_PROMPT_VERSION } from "../../src/lib/visual-concept/config.ts";
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
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

function loadKey(): { configured: boolean; ignored: boolean; leaked: boolean; exposed: boolean } {
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
  }
  return { configured: Boolean(key), ignored, leaked, exposed };
}

function promptVersionAlreadyStored(root: string, slug: string, version: string): boolean {
  const runs = path.join(root, slug, "runs");
  if (!existsSync(runs)) return false;
  for (const generationId of readdirSync(runs)) {
    const metadataPath = path.join(runs, generationId, "concepts", "b", "metadata.json");
    if (!existsSync(metadataPath)) continue;
    try {
      const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { promptVersion?: string };
      if (metadata.promptVersion === version) return true;
    } catch {
      // ignore unreadable historical metadata
    }
  }
  return false;
}

async function main() {
  const checks = loadKey();
  const lines: Record<string, string> = {
    ART_DIRECTOR_VERSION: ART_DIRECTION_VERSION,
    PROMPT_VERSION: VISUAL_CONCEPT_PROMPT_VERSION,
    PRIMARY_ARCHETYPE: "",
    SECONDARY_INFLUENCE: "",
    VISUAL_NARRATIVE: "",
    HERO_STRATEGY: "",
    PRODUCT_STAGING: "",
    SECTION_CHOREOGRAPHY: "",
    TYPOGRAPHY_CHARACTER: "",
    PHOTOGRAPHIC_LANGUAGE: "",
    MATERIAL_VOCABULARY: "",
    DEPTH_STRATEGY: "",
    VISUAL_DENSITY_STRATEGY: "",
    OPENAI_API_KEY_CONFIGURED: checks.configured ? "YES" : "NO",
    CAMPAIGN_FOUND: "NO",
    VISUAL_BRIEF: "NO",
    ART_DIRECTION_BRIEF: "NO",
    ORIGINAL_PACKSHOT_FOUND: "NO",
    PACKSHOT_COMPOSITION_READY: "NO",
    OUTPUT_DIRECTORY_READY: "NO",
    DRY_RUN: "FAIL",
    REAL_API_CALLS: "0",
    MODEL: "",
    QUALITY: "",
    SIZE: "",
    DIRECTION: "PREMIUM_PRODUCT",
    API_REQUEST: "NOT_SENT",
    IMAGE_RETURNED: "NO",
    RAW_ARTIFACT_PATH: "",
    COMPOSITED_ARTIFACT_PATH: "",
    ART_DIRECTION_ARTIFACT_PATH: "",
    VISUAL_BRIEF_ARTIFACT_PATH: "",
    METADATA_ARTIFACT_PATH: "",
    MODEL_RECREATED_PACKSHOT: "NO",
    ORIGINAL_PACKSHOT_OVERLAY: "NO",
    SOURCE_PACKSHOT_REFERENCE: "",
    AUTOMATIC_RETRY: "NO",
    PAID_FALLBACK: "NO",
    A_GENERATED: "NO",
    B_GENERATED: "NO",
    C_GENERATED: "NO",
    MASTER_MODEL_USED: "NO",
    CONTENT_CHANGED: "NO",
    FACTUAL_COPY_DELTA: "0",
    PRODUCTFACTS_MUTATED: "NO",
    ART_DIRECTION_IS_EVIDENCE: "NO",
    GENERATED_VISUAL_IS_EVIDENCE: "NO",
    IMAGE_TEXT_REIMPORT_ALLOWED: "NO",
    GROUNDING: "",
    UNSUPPORTED_CLAIMS: "",
    POLICY: "",
    PUBLICATION_GATE: "",
    VISUAL_DIRECTION_SELECTED: "NO",
    HUMAN_VISUAL_REVIEW: "PENDING",
    HUMAN_APPROVAL: "NO",
    PUBLICATION_STATUS: "",
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
  lines.CAMPAIGN_FOUND = campaign ? "YES" : "NO";
  lines.PUBLICATION_STATUS = campaign?.publicationStatus ?? "";
  if (!campaign || campaign.publicationStatus !== "draft") {
    lines.GO_NO_GO = "CONTENT_SAFETY_REGRESSION";
    finish();
    return;
  }
  const factsBefore = campaign.sourceFactsJson;
  const presentationBefore = campaign.productionPresentation;
  const brief = buildVisualBrief(campaign);
  lines.VISUAL_BRIEF = brief && brief.allowedCopy.length > 0 && brief.forbiddenClaims.length > 0 ? "READY" : "NO";
  const art = brief ? directVisualArt(brief, "PREMIUM_PRODUCT") : null;
  if (art) {
    lines.ART_DIRECTION_BRIEF = art.artDirectorVersion === ART_DIRECTION_VERSION && art.artDirectionIsEvidence === false ? "READY" : "NO";
    lines.PRIMARY_ARCHETYPE = art.primaryArchetype;
    lines.SECONDARY_INFLUENCE = art.secondaryInfluence;
    lines.VISUAL_NARRATIVE = art.visualNarrative;
    lines.HERO_STRATEGY = art.heroComposition;
    lines.PRODUCT_STAGING = art.productStaging;
    lines.SECTION_CHOREOGRAPHY = art.sectionChoreography.join(" | ");
    lines.TYPOGRAPHY_CHARACTER = art.typographyCharacter;
    lines.PHOTOGRAPHIC_LANGUAGE = art.photographicLanguage;
    lines.MATERIAL_VOCABULARY = art.materialVocabulary.join(", ");
    lines.DEPTH_STRATEGY = art.depthStrategy;
    lines.VISUAL_DENSITY_STRATEGY = art.visualDensityStrategy;
  }
  const smokeEnv: NodeJS.ProcessEnv = {
    VISUAL_CONCEPT_MODEL: "gpt-image-2.5-flare",
    VISUAL_MASTER_MODEL: "gpt-image-2.5-sunburst",
    VISUAL_CONCEPT_QUALITY: "low",
    VISUAL_CONCEPT_SIZE: "1024x1536",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  const plan = planVisualConceptGeneration(campaign, smokeEnv, ["PREMIUM_PRODUCT"]);
  lines.MODEL = plan?.model ?? "";
  lines.QUALITY = plan?.quality ?? "";
  lines.SIZE = plan?.size ?? "";
  const packshot = brief?.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
  const packshotPath = packshot ? resolvePackshotPath(packshot.src) : null;
  let readable = false;
  if (packshotPath) {
    try {
      accessSync(packshotPath, constants.R_OK);
      readable = statSync(packshotPath).size > 0;
    } catch {
      readable = false;
    }
  }
  lines.ORIGINAL_PACKSHOT_FOUND = packshot && readable ? "YES" : "NO";
  lines.SOURCE_PACKSHOT_REFERENCE = packshot?.id ?? "";
  const inspection = packshotPath ? inspectPackshotFile(packshotPath) : null;
  lines.PACKSHOT_COMPOSITION_READY =
    inspection?.usableTransparency === true && plan?.compositionStrategy === "SOURCE_OVERLAY_ON_RESERVED_STAGE" ? "YES" : "NO";
  const prompt = brief && art ? buildVisualConceptPrompt(brief, "PREMIUM_PRODUCT", { reserveProductStage: true, artDirection: art }) : "";
  const promptReady =
    prompt.includes("visual-concept-prompt-v3") &&
    prompt.includes(art?.visualNarrative ?? "missing-narrative") &&
    prompt.includes(art?.primaryArchetype ?? "missing-archetype") &&
    prompt.includes("FULL-PAGE PREMIUM ECOMMERCE / DTC LANDING PAGE WEBSITE DESIGN MOCKUP") &&
    prompt.includes("must not look like an advertisement") &&
    prompt.includes("01 HERO") &&
    prompt.includes("09 FOOTER / DISCLOSURE AREA") &&
    prompt.includes("DO NOT CREATE NEW SLOGANS.") &&
    prompt.includes("Leave a blank product stage") &&
    !prompt.includes("PREMIUM_EDITORIAL") &&
    !prompt.includes("PREMIUM_CONVERSION");
  const out = visualDesignRoot();
  let writable = false;
  try {
    mkdirSync(out, { recursive: true });
    accessSync(out, constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  lines.OUTPUT_DIRECTORY_READY = writable ? "YES" : "NO";
  const rendered = applyProductionCandidate(campaign);
  const policy = lintCampaign(rendered).gate;
  const facts = campaign.sourceFactsJson ? JSON.parse(campaign.sourceFactsJson) : null;
  const recovered = facts ? applyGenericFaqRecovery(facts) : null;
  const page = parsePresellPage(rendered.pageComposition);
  const grounding = recovered
    ? validateGrounding(page ? consumerVisibleText(page) : "", recovered, {
        faqAuthorities: page ? presellPageFaqAuthorityBindings(page, recovered) : [],
      })
    : null;
  const gate = resolvePublicationGate(campaign);
  lines.POLICY = policy;
  lines.GROUNDING = grounding?.status ?? "";
  lines.UNSUPPORTED_CLAIMS = grounding ? String(grounding.unsupportedClaims.length) : "";
  lines.PUBLICATION_GATE = gate === "READY" ? "PASS" : gate;
  const configReady =
    plan?.model === "gpt-image-2.5-flare" &&
    plan.quality === "low" &&
    plan.size === "1024x1536" &&
    plan.estimatedCallCount === 1 &&
    plan.operation === "generations" &&
    VISUAL_CONCEPT_PROMPT_VERSION === "visual-concept-prompt-v3" &&
    ART_DIRECTION_VERSION === "visual-art-director-v1";
  const safetyReady = policy === "READY" && grounding?.status === "GROUNDED" && grounding.unsupportedClaims.length === 0 && gate === "READY";
  const already = promptVersionAlreadyStored(out, campaign.slug, VISUAL_CONCEPT_PROMPT_VERSION);
  const dryPass = Boolean(
    lines.VISUAL_BRIEF === "READY" &&
      lines.ART_DIRECTION_BRIEF === "READY" &&
      readable &&
      lines.PACKSHOT_COMPOSITION_READY === "YES" &&
      promptReady &&
      writable &&
      configReady &&
      safetyReady &&
      !already,
  );
  lines.DRY_RUN = dryPass ? "PASS" : "FAIL";
  if (!dryPass) {
    lines.GO_NO_GO = !configReady ? "API_CONFIGURATION_NEEDS_FIX" : !safetyReady ? "CONTENT_SAFETY_REGRESSION" : "VISUAL_ENGINE_NEEDS_FIX";
    finish();
    return;
  }

  let sent = 0;
  const real = createOpenAiImageProvider();
  try {
    const result = await generateVisualConcepts(
      {
        campaign,
        generationReason: "art-directed visual smoke b3",
        generationRequestId: randomUUID(),
        confirmGeneration: true,
        regenerate: true,
        directions: ["PREMIUM_PRODUCT"],
      },
      {
        root: out,
        env: smokeEnv,
        apiKeyConfigured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
        provider: {
          async create(input: ConceptImageRequest) {
            if (sent >= 1) throw new Error("blocked second image call");
            if (input.referenceImagePath) throw new Error("blocked packshot upload");
            if (input.operation !== "generations") throw new Error("blocked unexpected operation");
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
    const concept = result.run?.concepts[0];
    if (result.status !== "GENERATED" || result.providerCalls !== 1 || !concept) {
      lines.API_REQUEST = "NOT_SENT";
      lines.GO_NO_GO = "VISUAL_ENGINE_NEEDS_FIX";
      finish();
      return;
    }
    const runDir = path.resolve(concept.imageFile, "..", "..", "..");
    const conceptDir = path.dirname(concept.imageFile);
    const rawPath = path.join(conceptDir, concept.metadata.generatedPixelsArtifact);
    const compositedPath = concept.imageFile;
    const artPath = path.join(runDir, "art-direction.json");
    const briefPath = path.join(runDir, "brief.json");
    const metadataPath = path.join(conceptDir, "metadata.json");
    const rawSize = existsSync(rawPath) ? statSync(rawPath).size : 0;
    const compositedSize = existsSync(compositedPath) ? statSync(compositedPath).size : 0;
    const metadataText = readFileSync(metadataPath, "utf8");
    const secretInArtifact =
      metadataText.includes("sk-") ||
      readFileSync(artPath, "utf8").includes("sk-") ||
      metadataText.includes(process.env.OPENAI_API_KEY || "missing-key-sentinel");
    const factsChanged = campaign.sourceFactsJson !== factsBefore || campaign.productionPresentation !== presentationBefore;
    lines.API_REQUEST = "SUCCESS";
    lines.IMAGE_RETURNED = rawSize > 0 ? "YES" : "NO";
    lines.ORIGINAL_PACKSHOT_OVERLAY =
      compositedSize > 0 && concept.metadata.compositionStrategy === "SOURCE_OVERLAY_ON_RESERVED_STAGE" ? "YES" : "NO";
    lines.RAW_ARTIFACT_PATH = path.relative(process.cwd(), rawPath);
    lines.COMPOSITED_ARTIFACT_PATH = path.relative(process.cwd(), compositedPath);
    lines.ART_DIRECTION_ARTIFACT_PATH = path.relative(process.cwd(), artPath);
    lines.VISUAL_BRIEF_ARTIFACT_PATH = path.relative(process.cwd(), briefPath);
    lines.METADATA_ARTIFACT_PATH = path.relative(process.cwd(), metadataPath);
    lines.B_GENERATED = concept.metadata.direction === "PREMIUM_PRODUCT" && compositedSize > 0 ? "YES" : "NO";
    lines.A_GENERATED = existsSync(path.join(conceptDir, "..", "a")) ? "YES" : "NO";
    lines.C_GENERATED = existsSync(path.join(conceptDir, "..", "c")) ? "YES" : "NO";
    lines.CONTENT_CHANGED = factsChanged ? "YES" : "NO";
    lines.FACTUAL_COPY_DELTA = factsChanged ? "1" : "0";
    lines.PRODUCTFACTS_MUTATED = factsChanged ? "YES" : "NO";
    lines.GENERATED_VISUAL_IS_EVIDENCE = concept.metadata.generatedVisualIsEvidence ? "YES" : "NO";
    lines.IMAGE_TEXT_REIMPORT_ALLOWED = concept.metadata.imageTextReimportAllowed ? "YES" : "NO";
    const pipelineOk =
      rawSize > 0 &&
      compositedSize > 0 &&
      existsSync(artPath) &&
      existsSync(briefPath) &&
      !secretInArtifact &&
      !factsChanged &&
      concept.metadata.promptVersion === "visual-concept-prompt-v3" &&
      concept.metadata.artDirectorVersion === "visual-art-director-v1" &&
      concept.metadata.humanPublicationApproved === false &&
      lines.A_GENERATED === "NO" &&
      lines.C_GENERATED === "NO";
    lines.GO_NO_GO = pipelineOk
      ? "ART_DIRECTED_VISUAL_SMOKE_READY_FOR_HUMAN_REVIEW"
      : factsChanged
        ? "CONTENT_SAFETY_REGRESSION"
        : "VISUAL_ENGINE_NEEDS_FIX";
    lines.FINAL_STATUS = pipelineOk ? "READY" : "NEEDS_FIX";
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
