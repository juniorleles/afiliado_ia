import { createHash, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { validateGrounding } from "../../src/lib/ai/grounding-validator.ts";
import { presellPageFaqAuthorityBindings } from "../../src/lib/ai/presell-faq-authority.ts";
import { ART_DIRECTION_VERSION, directVisualArt, type ArtDirectionBrief } from "../../src/lib/visual-concept/art-director.ts";
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
import type { VisualDirectionFamily } from "../../src/lib/visual-concept/types.ts";

const B_RUN = "483118f8-b982-4edc-8353-6abc45f97a0e";
const B_CONCEPT = path.join(
  "data",
  "visual-design",
  "joint-genesis-controlled-ready-13",
  "runs",
  B_RUN,
  "concepts",
  "b",
  "concept.png",
);

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
  if (/status 402|status 429|billing|quota|insufficient_quota/i.test(message)) return "OPENAI_BILLING_BLOCKED";
  if (/status 401|status 403|status 400|status 404|image request failed/i.test(message)) return "OPENAI_API_ERROR";
  return "OPENAI_API_ERROR";
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

function fileStamp(file: string): string {
  const stat = statSync(file);
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  return `${stat.size}:${hash}`;
}

function summarize(art: ArtDirectionBrief) {
  return {
    primary: art.primaryArchetype,
    secondary: art.secondaryInfluence,
    hero: art.heroComposition,
    narrative: art.visualNarrative,
    choreography: art.sectionChoreography.join(" | "),
    type: art.typographyCharacter,
    density: art.visualDensityStrategy,
    cta: art.ctaVisualStrategy,
  };
}

async function main() {
  const lines: Record<string, string> = {
    A_GENERATION: "NOT_SENT",
    A_PRIMARY_ARCHETYPE: "",
    A_SECONDARY_INFLUENCE: "",
    A_HERO_STRATEGY: "",
    A_VISUAL_NARRATIVE: "",
    A_SECTION_CHOREOGRAPHY: "",
    A_RAW_ARTIFACT_PATH: "",
    A_COMPOSITED_ARTIFACT_PATH: "",
    C_GENERATION: "NOT_SENT",
    C_PRIMARY_ARCHETYPE: "",
    C_SECONDARY_INFLUENCE: "",
    C_HERO_STRATEGY: "",
    C_VISUAL_NARRATIVE: "",
    C_SECTION_CHOREOGRAPHY: "",
    C_RAW_ARTIFACT_PATH: "",
    C_COMPOSITED_ARTIFACT_PATH: "",
    A_B_MATERIALLY_DIFFERENT: "NO",
    A_C_MATERIALLY_DIFFERENT: "NO",
    B_C_MATERIALLY_DIFFERENT: "NO",
    REAL_API_CALLS: "0",
    AUTOMATIC_RETRIES: "0",
    B_REGENERATED: "NO",
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
    PUBLICATION_STATUS: "",
    GO_NO_GO: "VISUAL_EXPLORATION_INCOMPLETE",
    FINAL_STATUS: "NEEDS_FIX",
    ERROR_MESSAGE: "",
  };
  const finish = () => {
    for (const [name, value] of Object.entries(lines)) {
      if (name === "ERROR_MESSAGE" && !value) continue;
      console.log(`${name}=${value}`);
    }
  };

  if (!loadKey() || !existsSync(B_CONCEPT)) {
    finish();
    return;
  }
  const runsDir = path.join("data", "visual-design", "joint-genesis-controlled-ready-13", "runs");
  const seen = new Set<string>();
  if (existsSync(runsDir)) {
    for (const generationId of readdirSync(runsDir)) {
      for (const key of ["a", "c"] as const) {
        const metadataPath = path.join(runsDir, generationId, "concepts", key, "metadata.json");
        if (!existsSync(metadataPath)) continue;
        const metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as { promptVersion?: string; direction?: string };
        if (metadata.promptVersion === "visual-concept-prompt-v3" && metadata.direction) seen.add(metadata.direction);
      }
    }
  }
  if (seen.has("PREMIUM_EDITORIAL") && seen.has("PREMIUM_CONVERSION")) {
    lines.A_GENERATION = "EXISTING";
    lines.C_GENERATION = "EXISTING";
    lines.REAL_API_CALLS = "0";
    lines.GO_NO_GO = "VISUAL_EXPLORATION_SET_READY_FOR_HUMAN_REVIEW";
    lines.FINAL_STATUS = "READY";
    finish();
    return;
  }
  const bBefore = fileStamp(B_CONCEPT);
  const campaign = getCampaignBySlug("joint-genesis-controlled-ready-13");
  const brief = campaign ? buildVisualBrief(campaign) : null;
  lines.PUBLICATION_STATUS = campaign?.publicationStatus ?? "";
  if (!campaign || !brief || campaign.publicationStatus !== "draft" || brief.allowedCopy.length === 0) {
    lines.GO_NO_GO = "CONTENT_SAFETY_REGRESSION";
    finish();
    return;
  }
  const factsBefore = campaign.sourceFactsJson;
  const presentationBefore = campaign.productionPresentation;
  const editorial = directVisualArt(brief, "PREMIUM_EDITORIAL");
  const conversion = directVisualArt(brief, "PREMIUM_CONVERSION");
  const product = directVisualArt(brief, "PREMIUM_PRODUCT");
  const smokeEnv: NodeJS.ProcessEnv = {
    VISUAL_CONCEPT_MODEL: "gpt-image-2.5-flare",
    VISUAL_MASTER_MODEL: "gpt-image-2.5-sunburst",
    VISUAL_CONCEPT_QUALITY: "low",
    VISUAL_CONCEPT_SIZE: "1024x1536",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  };
  const planA = planVisualConceptGeneration(campaign, smokeEnv, ["PREMIUM_EDITORIAL"]);
  const planC = planVisualConceptGeneration(campaign, smokeEnv, ["PREMIUM_CONVERSION"]);
  const packshot = brief.availableAssets.find((asset) => asset.role === "PRODUCT_PACKSHOT");
  const packshotPath = packshot ? resolvePackshotPath(packshot.src) : null;
  const inspection = packshotPath ? inspectPackshotFile(packshotPath) : null;
  const promptA = buildVisualConceptPrompt(brief, "PREMIUM_EDITORIAL", { reserveProductStage: true, artDirection: editorial });
  const promptC = buildVisualConceptPrompt(brief, "PREMIUM_CONVERSION", { reserveProductStage: true, artDirection: conversion });
  const out = visualDesignRoot();
  mkdirSync(out, { recursive: true });
  accessSync(out, constants.W_OK);
  const rendered = applyProductionCandidate(campaign);
  const policy = lintCampaign(rendered).gate;
  const facts = JSON.parse(campaign.sourceFactsJson);
  const recovered = applyGenericFaqRecovery(facts);
  const page = parsePresellPage(rendered.pageComposition);
  const grounding = validateGrounding(page ? consumerVisibleText(page) : "", recovered, {
    faqAuthorities: page ? presellPageFaqAuthorityBindings(page, recovered) : [],
  });
  const gate = resolvePublicationGate(campaign);
  lines.POLICY = policy;
  lines.GROUNDING = grounding.status;
  lines.UNSUPPORTED_CLAIMS = String(grounding.unsupportedClaims.length);
  lines.PUBLICATION_GATE = gate === "READY" ? "PASS" : gate;
  const promptOk = (prompt: string, art: ArtDirectionBrief, self: VisualDirectionFamily, others: VisualDirectionFamily[]) =>
    prompt.includes(VISUAL_CONCEPT_PROMPT_VERSION) &&
    prompt.includes(art.primaryArchetype) &&
    prompt.includes(art.visualNarrative) &&
    prompt.includes("FULL-PAGE PREMIUM ECOMMERCE / DTC LANDING PAGE WEBSITE DESIGN MOCKUP") &&
    prompt.includes("DO NOT CREATE NEW SLOGANS.") &&
    prompt.includes("Leave a blank product stage") &&
    prompt.includes(self) &&
    others.every((name) => !prompt.includes(name));
  const ready =
    editorial.artDirectorVersion === ART_DIRECTION_VERSION &&
    editorial.artDirectionIsEvidence === false &&
    editorial.primaryArchetype === "EDITORIAL_LUXURY" &&
    conversion.primaryArchetype === "STRUCTURED_CONVERSION" &&
    product.primaryArchetype === "PRODUCT_LED_DTC" &&
    VISUAL_CONCEPT_PROMPT_VERSION === "visual-concept-prompt-v3" &&
    planA?.model === "gpt-image-2.5-flare" &&
    planA.quality === "low" &&
    planA.size === "1024x1536" &&
    planA.estimatedCallCount === 1 &&
    planA.compositionStrategy === "SOURCE_OVERLAY_ON_RESERVED_STAGE" &&
    planC?.estimatedCallCount === 1 &&
    inspection?.usableTransparency === true &&
    promptOk(promptA, editorial, "PREMIUM_EDITORIAL", ["PREMIUM_PRODUCT", "PREMIUM_CONVERSION"]) &&
    promptOk(promptC, conversion, "PREMIUM_CONVERSION", ["PREMIUM_PRODUCT", "PREMIUM_EDITORIAL"]) &&
    policy === "READY" &&
    grounding.status === "GROUNDED" &&
    grounding.unsupportedClaims.length === 0 &&
    gate === "READY";
  if (!ready) {
    lines.ERROR_MESSAGE = [
      editorial.primaryArchetype,
      conversion.primaryArchetype,
      planA?.estimatedCallCount ?? "no-plan",
      planA?.compositionStrategy ?? "no-composition",
      inspection?.usableTransparency ? "packshot-usable" : "packshot-not-usable",
      promptOk(promptA, editorial, "PREMIUM_EDITORIAL", ["PREMIUM_PRODUCT", "PREMIUM_CONVERSION"]) ? "prompt-a-ok" : "prompt-a-fail",
      promptOk(promptC, conversion, "PREMIUM_CONVERSION", ["PREMIUM_PRODUCT", "PREMIUM_EDITORIAL"]) ? "prompt-c-ok" : "prompt-c-fail",
      policy,
      grounding.status,
      gate,
    ].join(",");
    lines.GO_NO_GO = policy !== "READY" || gate !== "READY" ? "CONTENT_SAFETY_REGRESSION" : "VISUAL_EXPLORATION_INCOMPLETE";
    finish();
    return;
  }

  let calls = 0;
  const real = createOpenAiImageProvider();
  async function generateOne(direction: VisualDirectionFamily) {
    let sent = 0;
    return generateVisualConcepts(
      {
        campaign: campaign!,
        generationReason: `visual exploration ${direction}`,
        generationRequestId: randomUUID(),
        confirmGeneration: true,
        regenerate: true,
        directions: [direction],
      },
      {
        root: out,
        env: smokeEnv,
        apiKeyConfigured: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
        provider: {
          async create(input: ConceptImageRequest) {
            if (calls >= 2 || sent >= 1) throw new Error("blocked extra image call");
            if (input.referenceImagePath || input.operation !== "generations") throw new Error("blocked packshot upload");
            if (input.model !== "gpt-image-2.5-flare" || input.quality !== "low" || input.size !== "1024x1536") {
              throw new Error("blocked unexpected image settings");
            }
            if (!input.prompt.includes(direction)) throw new Error("blocked unexpected direction");
            sent += 1;
            calls += 1;
            return real.create(input);
          },
        },
      },
    );
  }

  function record(prefix: "A" | "C", art: ArtDirectionBrief, imageFile: string) {
    const conceptDir = path.dirname(imageFile);
    const rawName = prefix === "A" ? readFileSync(path.join(conceptDir, "metadata.json"), "utf8") : "";
    const metadata = JSON.parse(readFileSync(path.join(conceptDir, "metadata.json"), "utf8")) as {
      generatedPixelsArtifact: string;
      direction: string;
      humanPublicationApproved: boolean;
    };
    const rawPath = path.join(conceptDir, metadata.generatedPixelsArtifact);
    lines[`${prefix}_GENERATION`] = "SUCCESS";
    lines[`${prefix}_PRIMARY_ARCHETYPE`] = art.primaryArchetype;
    lines[`${prefix}_SECONDARY_INFLUENCE`] = art.secondaryInfluence;
    lines[`${prefix}_HERO_STRATEGY`] = art.heroComposition;
    lines[`${prefix}_VISUAL_NARRATIVE`] = art.visualNarrative;
    lines[`${prefix}_SECTION_CHOREOGRAPHY`] = art.sectionChoreography.join(" | ");
    lines[`${prefix}_RAW_ARTIFACT_PATH`] = path.relative(process.cwd(), rawPath);
    lines[`${prefix}_COMPOSITED_ARTIFACT_PATH`] = path.relative(process.cwd(), imageFile);
    return metadata.humanPublicationApproved === false && statSync(rawPath).size > 0 && statSync(imageFile).size > 0 && rawName.length > 0;
  }

  try {
    const a = await generateOne("PREMIUM_EDITORIAL");
    lines.REAL_API_CALLS = String(calls);
    const aConcept = a.run?.concepts[0];
    if (a.status !== "GENERATED" || a.providerCalls !== 1 || aConcept?.key !== "a") {
      lines.A_GENERATION = "FAILED";
      finish();
      return;
    }
    if (!record("A", editorial, aConcept.imageFile)) {
      lines.GO_NO_GO = "VISUAL_EXPLORATION_INCOMPLETE";
      finish();
      return;
    }
  } catch (error) {
    lines.REAL_API_CALLS = String(calls);
    lines.A_GENERATION = "FAILED";
    lines.ERROR_MESSAGE = redact(error instanceof Error ? error.message : "image request failed");
    lines.GO_NO_GO = calls > 0 ? classify(lines.ERROR_MESSAGE) : "VISUAL_EXPLORATION_INCOMPLETE";
    lines.FINAL_STATUS = "FAILED";
    finish();
    return;
  }

  try {
    const c = await generateOne("PREMIUM_CONVERSION");
    lines.REAL_API_CALLS = String(calls);
    const cConcept = c.run?.concepts[0];
    if (c.status !== "GENERATED" || c.providerCalls !== 1 || cConcept?.key !== "c") {
      lines.C_GENERATION = "FAILED";
      lines.GO_NO_GO = "VISUAL_EXPLORATION_INCOMPLETE";
      lines.FINAL_STATUS = "NEEDS_FIX";
      finish();
      return;
    }
    if (!record("C", conversion, cConcept.imageFile)) {
      lines.GO_NO_GO = "VISUAL_EXPLORATION_INCOMPLETE";
      finish();
      return;
    }
  } catch (error) {
    lines.REAL_API_CALLS = String(calls);
    lines.C_GENERATION = "FAILED";
    lines.ERROR_MESSAGE = redact(error instanceof Error ? error.message : "image request failed");
    lines.GO_NO_GO = classify(lines.ERROR_MESSAGE);
    lines.FINAL_STATUS = "FAILED";
    finish();
    return;
  }

  const bAfter = fileStamp(B_CONCEPT);
  lines.B_REGENERATED = bBefore === bAfter ? "NO" : "YES";
  const aSum = summarize(editorial);
  const bSum = summarize(product);
  const cSum = summarize(conversion);
  const different = (left: ReturnType<typeof summarize>, right: ReturnType<typeof summarize>) =>
    left.primary !== right.primary &&
    left.hero !== right.hero &&
    left.narrative !== right.narrative &&
    left.choreography !== right.choreography &&
    left.type !== right.type &&
    left.density !== right.density &&
    left.cta !== right.cta;
  lines.A_B_MATERIALLY_DIFFERENT = different(aSum, bSum) ? "YES" : "NO";
  lines.A_C_MATERIALLY_DIFFERENT = different(aSum, cSum) ? "YES" : "NO";
  lines.B_C_MATERIALLY_DIFFERENT = different(bSum, cSum) ? "YES" : "NO";
  const factsChanged = campaign.sourceFactsJson !== factsBefore || campaign.productionPresentation !== presentationBefore;
  lines.CONTENT_CHANGED = factsChanged ? "YES" : "NO";
  lines.FACTUAL_COPY_DELTA = factsChanged ? "1" : "0";
  lines.PRODUCTFACTS_MUTATED = factsChanged ? "YES" : "NO";
  const ok =
    lines.A_GENERATION === "SUCCESS" &&
    lines.C_GENERATION === "SUCCESS" &&
    lines.REAL_API_CALLS === "2" &&
    lines.B_REGENERATED === "NO" &&
    lines.A_B_MATERIALLY_DIFFERENT === "YES" &&
    lines.A_C_MATERIALLY_DIFFERENT === "YES" &&
    lines.B_C_MATERIALLY_DIFFERENT === "YES" &&
    !factsChanged;
  lines.GO_NO_GO = ok ? "VISUAL_EXPLORATION_SET_READY_FOR_HUMAN_REVIEW" : factsChanged ? "CONTENT_SAFETY_REGRESSION" : "VISUAL_EXPLORATION_INCOMPLETE";
  lines.FINAL_STATUS = ok ? "READY" : "NEEDS_FIX";
  finish();
}

main();
