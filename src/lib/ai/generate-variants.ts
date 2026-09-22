/**
 * Generation of English presell variants.
 *
 * THIN/INSUFFICIENT: deterministic source-preserving copy. No Anthropic call.
 * RICH/ADEQUATE: existing slot-bound Claude generator.
 *
 * buildPrompt / parseVariantsResponse are pure. generateVariants is the
 * only network call, and only on the MODEL route.
 */

import type { ProductFacts } from "@/lib/product-facts";
import { emptyProductFacts, formatFactsForPrompt, buildGenerationFactManifest } from "@/lib/product-facts";
import type { Campaign } from "@/lib/campaigns";
import { lintCampaign, type LintResult, type PublicationGate } from "@/lib/policy-linter";
import { extractJsonText, JsonExtractError } from "@/lib/ai/parse-ai-json";
import { slugify } from "@/lib/slug";
import {
  composePublicationGate,
  validateGrounding,
  type GroundingResult,
  type GroundingStatus,
} from "@/lib/ai/grounding-validator";
import {
  createGenerationPlan,
  formatGenerationPlanForPrompt,
  validateGenerationPlan,
  type GenerationPlan,
  type GenerationPlanViolation,
} from "@/lib/ai/generation-plan";
import {
  adaptStructuredToVariantCopy,
  evaluateStructuredPage,
  type EvidenceTrace,
  type StructuralViolation,
  type StructuredGenerationPage,
} from "@/lib/ai/structured-generation";
import {
  createEvidenceSlotPlan,
  formatEvidenceSlotPlanForPrompt,
  type EvidenceSlotPlan,
} from "@/lib/ai/evidence-slot-plan";
import {
  projectEvidenceClaims,
} from "@/lib/ai/claim-projection";
import {
  createModelSlotAuthority,
  formatModelSlotAuthorityForPrompt,
} from "@/lib/ai/model-slot-authority";
import { formatModelWordingConstraintForPrompt } from "@/lib/ai/model-wording-constraint";
import {
  hydrateSlotFillsToPage,
  parseSlotFills,
  slotFillSchema,
  evaluateSlotGeneration,
  type SlotFill,
} from "@/lib/ai/slot-generation";
import { resolveGenerationRoute } from "@/lib/ai/generation-router";
import { generateDeterministicThinCopy } from "@/lib/ai/deterministic-thin-generation";
import { assertModelSlotProjectionIsolation } from "@/lib/ai/slot-projection-isolation";
import { formatSafeMarketContext } from "@/lib/market-research/signals";
import type { MarketResearchReport } from "@/lib/market-research/types";
import type { StrategyFamily } from "@/lib/strategy/types";

export const VARIANT_APPROACHES = ["REVIEW", "EDUCATIONAL", "BUYER_GUIDE"] as const;
export type VariantApproach = (typeof VARIANT_APPROACHES)[number];

export const DEFAULT_SAFE_CTA = "Learn More";
export const SAFE_CTA_LABELS = ["Learn More", "View Product Details", "Check Current Details"] as const;

export type Variant = {
  approach: VariantApproach;
  headline: string;
  body: string;
  ctaLabel: string;
  structured?: StructuredGenerationPage;
  slotFills?: SlotFill[];
  slotPlan?: EvidenceSlotPlan;
  generationRoute?: "DETERMINISTIC_THIN" | "MODEL";
  generationMethod?: "DETERMINISTIC_THIN" | "MODEL";
  anthropicCalls?: number;
};

export type GenerateVariantsInput = {
  productName: string;
  sourceUrl?: string;
  facts?: ProductFacts;
  /** @deprecated Phase 3 uses facts.features. Kept so older callers still compile. */
  extractedBullets?: string[];
  targetApproach?: VariantApproach;
  marketResearch?: MarketResearchReport;
  recommendedStrategy?: StrategyFamily;
};

export type VariantLintSummary = {
  gate: LintResult["gate"];
  warningCount: number;
  blockingCount: number;
  majorFindings: Array<{
    ruleId: string;
    status: LintResult["findings"][number]["status"];
    message: string;
    evidence?: string;
    category?: string;
  }>;
};

export type LintedVariant = Variant & {
  wordCount: number;
  preview: string;
  lint: VariantLintSummary;
  grounding: GroundingResult;
  finalGate: PublicationGate;
  generationPlan?: GenerationPlan;
  generationPlanViolations?: GenerationPlanViolation[];
  structuralViolations?: StructuralViolation[];
  evidenceTrace?: EvidenceTrace[];
};

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are a native English-speaking editorial writer filling
authorized presell blocks. You are not writing a complete free-form page.

You fill only the authorized blocks supplied by the system. You rewrite
SOURCE FACTS into original explanatory copy. You do not copy long source
passages. Short output is correct when evidence is sparse.

Hard rules:
- Write in natural, native English. This must NOT read like a translation
  from Portuguese or any other language — no awkward phrasing, no literal
  translation patterns, no "Portuguese sentence structure in English words."
- Never claim the page or ad has been "approved by Google" or any platform.
- SOURCE FACTS and AI-GENERATED COPY are different. Only the evidence
  manifest is evidence. Do not treat your own wording as a source.
- Use evidence only within its field authority.
- Use ONLY copy-eligible evidence IDs supplied in the user message.
  Do not add blocks. Do not invent IDs. Do not discuss missing fields.
  Do not explain absent information. Do not use outside knowledge.
- Do NOT use model world knowledge to add product, scientific, medical,
  category, pricing, safety, usage, efficacy, comparative, or historical
  facts. Do NOT invent ingredients, prices, discounts, guarantees, refund
  durations, clinical studies, statistics, testimonials, customer counts,
  medical outcomes, certifications, endorsements, awards, manufacturer
  identity, scarcity, countdowns, category-wide ranges, typical CFU counts,
  results timelines, drug interactions, pregnancy/nursing warnings, or
  "consult a doctor/healthcare professional" advice unless that exact
  caution is copy-eligible in SOURCE FACTS. Do not fill gaps from memory.
- Do not convert features into directions, guarantees, medical advice,
  manufacturer claims, pricing, or other field authority.
- Do not recombine tokens from different fields into a new fact. A duration
  in the description plus a refund mention elsewhere does NOT create a
  "N-day refund policy". "Five targeted ingredients" does not name those
  ingredients. "Daily support" is not a dosage.
- DIRECT_SOURCE and MANUAL mean "the source or operator supplied this
  text." They do NOT mean the claim is independently scientifically
  verified. Do not convert a seller claim into an editorial fact.
  HEURISTIC_EXTRACTION is stored for operator review only.
- For health, biological, efficacy, clinical, or scientific seller claims,
  either omit them or attribute them in readable prose (for example:
  "According to the product website..."). Do not prepend attribution to
  every sentence. Never strengthen wording: "may support" must not become
  "supports"; "designed to support" must not become "improves"; "backed by
  clinical research" must not become independent scientific consensus.
- Do not introduce "research shows", "research suggests", "studies
  demonstrate", "clinically proven", "scientifically proven", or
  "evidence shows" unless that exact claim is in the facts block — and
  even then, do not imply independent verification.
- Never write guaranteed outcomes, "works for everyone", fake urgency,
  fake scarcity, or fake countdowns.
- Never claim you personally tested, doctor-reviewed, or scientifically
  verified the product.
- Never invent awards, "#1" rankings, or "millions of customers".
- You may only make product-specific factual statements supported by the
  supplied eligible facts. If a field is absent, do not infer it.
  Absence of manufacturer, price, dosage, ingredients, guarantee, cautions,
  certification, medical category, facility or location means you must omit
  that subject.
- Do not write an encyclopedia of the product category or unsourced
  category science. Do not explain why a mechanism works unless that
  explanation is in eligible evidence.
- Follow the GENERATION PLAN and the Evidence Slot Plan. Fill only
  preassigned slots. Do not invent slot IDs. Do not choose evidence IDs
  or FAQ topics. Do not add blocks. Zero FAQs is valid. Optional FAQ slots
  may be omitted. Sparse copy is valid.
  Do not create INGREDIENTS, USAGE, CAUTIONS, PRICING,
  GUARANTEE, MANUFACTURER, RESULTS, or BACKGROUND_SCIENCE blocks unless
  authorized.
- CTA labels must be informational, not urgent. Prefer:
  "Learn More", "View Product Details", or "Check Current Details".
  Do NOT use "Visit Official Website" or "Official Website" unless
  SOURCE FACTS include copy-eligible manufacturer or official brand
  identity. Never imply an unconfirmed official destination.
- Respond with ONLY JSON matching the requested structured schema. Do not wrap it in markdown code fences.

Approaches:
1. REVIEW — balanced editorial review of supplied facts only.
2. EDUCATIONAL — explain how THIS item is described in the facts. Do not
   teach unsourced category science.
3. BUYER_GUIDE — comparison-style buying considerations using only supplied
   facts (not a fake ranking, not unsourced safety checklists).
Do not use artificial urgency as a generation angle.`;

const MODEL_SYSTEM_PROMPT = `You are a conservative wording engine filling preassigned evidence slots.
CODE owns authority. You own wording only.

You may compress, paraphrase conservatively, combine grammar-compatible
claims assigned to the SAME slot, improve readability, and use the product
name as a grammatical subject.

You may NOT invent predicates, invent relationships, infer manufacturer
authority, infer audience, infer purpose, infer recommendation, infer
comparison, infer superiority, invent editorial characterization, promote
evidence across fields, combine unrelated fields, introduce closed-topic
facts, or treat product identity as ingredient/composition evidence.

Hard rules:
- Write in natural, native English.
- Never claim the page or ad has been "approved by Google" or any platform.
- Use only the projected source text assigned to each slot.
- Do not choose evidence IDs, claim IDs, field authority, or topic authority.
- If a field is absent, do not infer it.
- Do not use model world knowledge to add product, scientific, medical,
  category, pricing, safety, usage, efficacy, comparative, or historical
  facts.
- Do not convert features into directions, guarantees, medical advice,
  manufacturer claims, pricing, or other field authority.
- Do not recombine tokens from different fields into a new fact.
- DIRECT_SOURCE and MANUAL mean the source or operator supplied the text.
  They do not mean independent scientific verification.
- Never write guaranteed outcomes, fake urgency, fake scarcity, or claim
  you personally tested the product.
- CTA labels must be informational. Prefer "Learn More", "View Product
  Details", or "Check Current Details".
- Respond with ONLY JSON matching the requested structured schema.

Approach is an editorial angle only. It must not add comparison,
audience, purpose, ranking, or superiority predicates.`;

export function factsFromInput(input: GenerateVariantsInput): ProductFacts {
  if (input.facts) {
    return {
      ...input.facts,
      productName: input.facts.productName || input.productName,
      sourceUrl: input.facts.sourceUrl || input.sourceUrl || "",
    };
  }

  const facts = emptyProductFacts(input.productName, input.sourceUrl ?? "", "MANUAL");
  if (input.extractedBullets && input.extractedBullets.length > 0) {
    facts.features = [...input.extractedBullets];
    facts.confidence.features = "DIRECT_SOURCE";
  }
  return facts;
}

export function buildPrompt(input: GenerateVariantsInput): { system: string; user: string } {
  const facts = factsFromInput(input);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  const projectedDescription = projection.authorized
    .filter((claim) => claim.field === "description")
    .map((claim) => claim.generationText)
    .join(" ");
  const projectedFeatures = [
    ...new Set(
      projection.authorized.filter((claim) => claim.field === "features").map((claim) => claim.generationText),
    ),
  ];
  const lines: string[] = [];
  if (plan.generationRoute === "MODEL") {
    const authorities = slotPlan.slots.map((slot) => createModelSlotAuthority(slot, plan));
    lines.push(
      `Product identity (grammatical subject only; not ingredient or composition evidence): ${facts.productName}`,
      "",
      formatGenerationPlanForPrompt(plan),
      "",
      formatEvidenceSlotPlanForPrompt(slotPlan),
      "",
      formatModelSlotAuthorityForPrompt(authorities),
      "",
      formatModelWordingConstraintForPrompt(),
      "",
      "PROJECTED CLAIMS are assigned per slot. Raw ProductFacts are not visible. Closed fields are not visible.",
      "Do not promote evidence across fields. If a field is absent, do not infer it.",
      "",
    );
  } else {
    lines.push(
      formatFactsForPrompt(facts, {
        description: projectedDescription,
        features: projectedFeatures,
        evidenceManifest:
          "PROJECTED CLAIMS — closed semantic spans were excluded. Restate only the authorized slot texts below. Do not restore omitted usage, guarantee, or composition claims.",
      }),
      "",
      formatGenerationPlanForPrompt(plan),
      "",
      formatEvidenceSlotPlanForPrompt(slotPlan),
      "",
    );
  }
  if (input.marketResearch) {
    lines.push(formatSafeMarketContext(input.marketResearch.signals));
    lines.push("");
  }
  if (input.targetApproach) {
    lines.push(
      `STRATEGY CONTEXT: recommended approach ${input.targetApproach}. This is an editorial angle, not a product fact.`,
      `Generate exactly one variant now using approach ${input.targetApproach}.`,
      "Fill only Evidence Slot Plan slots. Do not choose evidence IDs.",
      "Do not add blocks. Do not discuss missing fields. Do not use outside knowledge.",
      "Market context may influence angle and emphasis only.",
      "Market context may NOT introduce unsupported product facts, medical claims, rankings, prices, or conversion statistics.",
      "Market context may NOT open CLOSED_TOPICS or unauthorized blocks.",
    );
  } else {
    lines.push("Generate exactly three structured variants now (REVIEW, EDUCATIONAL, BUYER_GUIDE).");
    lines.push("Fill only Evidence Slot Plan slots. Do not choose evidence IDs.");
  }
  return {
    system: plan.generationRoute === "MODEL" ? MODEL_SYSTEM_PROMPT : SYSTEM_PROMPT,
    user: lines.join("\n"),
  };
}

export class VariantParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VariantParseError";
  }
}

const APPROACH_SET = new Set<string>(VARIANT_APPROACHES);

/** Wire schema for Anthropic `output_config.format`. Exactly-3 and field
 * presence are still enforced in `parseVariantsResponse`. Anthropic rejects
 * array `minItems`/`maxItems` other than 0 or 1 (HTTP 400). */
export const VARIANT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: {
    variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["approach", "headline", "body", "ctaLabel"],
        properties: {
          approach: { type: "string", enum: [...VARIANT_APPROACHES] },
          headline: { type: "string" },
          body: { type: "string" },
          ctaLabel: { type: "string" },
        },
      },
    },
  },
} as const;

export const SINGLE_VARIANT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["variants"],
  properties: {
    variants: {
      type: "array",
      items: VARIANT_JSON_SCHEMA.properties.variants.items,
    },
  },
} as const;

export function parseVariantsResponse(rawText: string, expectedCount = 3): Variant[] {
  let jsonText: string;
  try {
    jsonText = extractJsonText(rawText).jsonText;
  } catch (err) {
    if (err instanceof JsonExtractError) {
      throw new VariantParseError(err.message);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new VariantParseError("A resposta não é um JSON válido.");
  }

  const rows = coerceVariantRows(parsed);
  if (rows.length !== expectedCount) {
    throw new VariantParseError(`Esperava exatamente ${expectedCount} variante(s), vieram ${rows.length}.`);
  }

  const variants = rows.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new VariantParseError(`Variante ${index + 1} não é um objeto.`);
    }
    const obj = item as Record<string, unknown>;
    for (const field of ["headline", "body", "ctaLabel"] as const) {
      if (typeof obj[field] !== "string" || obj[field].trim() === "") {
        throw new VariantParseError(`Variante ${index + 1}: campo "${field}" ausente ou vazio.`);
      }
    }
    const fallback = VARIANT_APPROACHES[index];
    const rawApproach = typeof obj.approach === "string" ? obj.approach.trim().toUpperCase().replace(/['\s-]+/g, "_") : "";
    const approach = (APPROACH_SET.has(rawApproach) ? rawApproach : fallback) as VariantApproach;
    return {
      approach,
      headline: (obj.headline as string).trim(),
      body: (obj.body as string).trim(),
      ctaLabel: (obj.ctaLabel as string).trim(),
    };
  });

  return expectedCount === 1 ? variants : orderVariants(variants);
}

function coerceVariantRows(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && "variants" in parsed) {
    const rows = (parsed as { variants: unknown }).variants;
    if (Array.isArray(rows)) return rows;
  }
  throw new VariantParseError("A resposta deveria ser um array JSON, veio outra coisa.");
}

function orderVariants(variants: Variant[]): Variant[] {
  const unique = new Set(variants.map((v) => v.approach));
  if (unique.size !== 3) {
    throw new VariantParseError("Esperava as 3 abordagens REVIEW, EDUCATIONAL e BUYER_GUIDE.");
  }
  return VARIANT_APPROACHES.map((approach) => variants.find((v) => v.approach === approach)!);
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function variantPreview(body: string, maxChars = 240): string {
  const compact = body.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars).trim()}…`;
}

export function emptyHeadingTitles(body: string): string[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const empty: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith("## ")) continue;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === "") j += 1;
    if (j >= lines.length || lines[j].startsWith("## ")) {
      empty.push(lines[i].slice(3).trim());
    }
  }
  return empty;
}

export function longestSharedPhrase(generated: string, source: string, minWords = 12): string | null {
  const haystack = generated.toLowerCase().replace(/\s+/g, " ");
  const srcWords = source.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 80);
  if (srcWords.length < minWords) return null;

  let best = "";
  for (let i = 0; i <= srcWords.length - minWords; i += 1) {
    const maxLen = Math.min(40, srcWords.length - i);
    for (let length = maxLen; length >= minWords; length -= 1) {
      const slice = srcWords.slice(i, i + length).join(" ");
      if (slice.length > best.length && haystack.includes(slice)) {
        best = slice;
        break;
      }
    }
  }
  return best || null;
}

export function campaignFromVariant(
  variant: Variant,
  productName: string,
  affiliateUrl: string,
): Campaign {
  const slug = slugify(productName) || "generated-variant";
  return {
    id: 0,
    name: productName,
    slug,
    headline: variant.headline,
    body: variant.body,
    ctaLabel: variant.ctaLabel,
    affiliateUrl,
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "",
    updatedAt: "",
    pageTemplate: null,
    pageComposition: null,
    productImageSrc: null,
    productImageProvenance: null,
    subheadline: null,
    sourceFactsJson: null,
  };
}

export function summarizeLint(result: LintResult): VariantLintSummary {
  const major = result.findings.filter((f) => f.status !== "pass");
  return {
    gate: result.gate,
    warningCount: major.filter((f) => f.status === "warn").length,
    blockingCount: major.filter((f) => f.status === "fail" && f.blocking).length,
    majorFindings: major.slice(0, 8).map((f) => ({
      ruleId: f.ruleId,
      status: f.status,
      message: f.message,
      evidence: f.evidence,
      category: f.category,
    })),
  };
}

export function lintVariant(
  variant: Variant,
  productName: string,
  affiliateUrl: string,
  facts?: ProductFacts,
): LintedVariant {
  if (variant.slotFills && variant.slotPlan && facts) {
    const evaluation = evaluateSlotGeneration(
      { variants: [{ cta: { label: variant.ctaLabel }, slots: variant.slotFills }] },
      facts,
      productName,
      affiliateUrl,
      variant.slotPlan,
    );
    const adapted = evaluation.adapted || evaluation.inspectionCopy;
    const campaign = campaignFromVariant(
      { ...variant, headline: adapted.headline, body: adapted.body, ctaLabel: adapted.ctaLabel },
      productName,
      affiliateUrl,
    );
    const lint = summarizeLint(lintCampaign(campaign));
    const generationPlan = createGenerationPlan(facts);
    const generationPlanViolations = validateGenerationPlan(
      `${adapted.headline}\n${adapted.body}\n${adapted.ctaLabel}`,
      generationPlan,
    ).violations;
    let finalGate = evaluation.finalGate;
    if (generationPlanViolations.length > 0) finalGate = "BLOCKED";
    if (lint.gate === "BLOCKED") finalGate = "BLOCKED";
    return {
      ...variant,
      headline: adapted.headline,
      body: adapted.body,
      ctaLabel: adapted.ctaLabel,
      structured: evaluation.page || variant.structured,
      wordCount: wordCount(adapted.body),
      preview: variantPreview(adapted.body),
      lint,
      grounding: evaluation.grounding,
      finalGate,
      generationPlan,
      generationPlanViolations,
      structuralViolations: evaluation.structuralViolations,
      evidenceTrace: evaluation.traces,
    };
  }
  if (variant.structured && facts) {
    const evaluation = evaluateStructuredPage(variant.structured, facts, productName, affiliateUrl);
    const adapted = evaluation.adapted || evaluation.inspectionCopy;
    const campaign = campaignFromVariant(
      { ...variant, headline: adapted.headline, body: adapted.body, ctaLabel: adapted.ctaLabel },
      productName,
      affiliateUrl,
    );
    const lint = summarizeLint(lintCampaign(campaign));
    const generationPlan = createGenerationPlan(facts);
    const generationPlanViolations = validateGenerationPlan(
      `${adapted.headline}\n${adapted.body}\n${adapted.ctaLabel}`,
      generationPlan,
    ).violations;
    let finalGate = evaluation.finalGate;
    if (generationPlanViolations.length > 0) finalGate = "BLOCKED";
    if (lint.gate === "BLOCKED") finalGate = "BLOCKED";
    return {
      ...variant,
      headline: adapted.headline,
      body: adapted.body,
      ctaLabel: adapted.ctaLabel,
      wordCount: wordCount(adapted.body),
      preview: variantPreview(adapted.body),
      lint,
      grounding: evaluation.grounding,
      finalGate,
      generationPlan,
      generationPlanViolations,
      structuralViolations: evaluation.structuralViolations,
      evidenceTrace: evaluation.traces,
    };
  }
  const campaign = campaignFromVariant(variant, productName, affiliateUrl);
  const lint = summarizeLint(lintCampaign(campaign));
  const copy = `${variant.headline}\n${variant.body}\n${variant.ctaLabel}`;
  const grounding: GroundingResult = facts
    ? validateGrounding(copy, facts)
    : { status: "GROUNDED" as GroundingStatus, unsupportedClaims: [] };
  const generationPlan = facts ? createGenerationPlan(facts) : undefined;
  const generationPlanViolations = generationPlan
    ? validateGenerationPlan(copy, generationPlan).violations
    : [];
  let finalGate = composePublicationGate(lint.gate, grounding.status);
  if (generationPlanViolations.length > 0) finalGate = "BLOCKED";
  return {
    ...variant,
    wordCount: wordCount(variant.body),
    preview: variantPreview(variant.body),
    lint,
    grounding,
    finalGate,
    generationPlan,
    generationPlanViolations,
  };
}

type AnthropicTextResult = {
  text: string;
  stopReason: string | null;
};

async function callAnthropic(
  system: string,
  user: string,
  structured: boolean,
  schema: object = VARIANT_JSON_SCHEMA,
): Promise<AnthropicTextResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY não configurada. Coloque em .env.local (ver .env.example).");
  }

  const body: Record<string, unknown> = {
    model: ANTHROPIC_MODEL,
    max_tokens: 16384,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (structured) {
    body.output_config = {
      format: {
        type: "json_schema",
        schema,
      },
    };
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    if (structured && (response.status === 400 || response.status === 422)) {
      return callAnthropic(system, user, false, schema);
    }
    throw new Error(`Anthropic API respondeu ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    stop_reason?: string;
    content: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content.find((block) => block.type === "text");
  if (!textBlock?.text) {
    throw new Error("Resposta da Anthropic não trouxe bloco de texto.");
  }
  return { text: textBlock.text, stopReason: data.stop_reason ?? null };
}

export async function generateVariants(input: GenerateVariantsInput): Promise<Variant[]> {
  const facts = factsFromInput(input);
  const plan = createGenerationPlan(facts);
  const manifest = buildGenerationFactManifest(facts);
  const projection = projectEvidenceClaims(facts, plan, manifest);
  const slotPlan = createEvidenceSlotPlan(facts, plan, manifest, projection);
  const route = resolveGenerationRoute(plan);
  const approach = (input.targetApproach || "REVIEW") as VariantApproach;

  if (route === "DETERMINISTIC_THIN") {
    const generated = generateDeterministicThinCopy({ plan, slotPlan, projection });
    const page = hydrateSlotFillsToPage(generated.fills, slotPlan, generated.ctaLabel, input.targetApproach);
    const adapted = adaptStructuredToVariantCopy(page, plan);
    return [
      {
        approach,
        headline: adapted.headline,
        body: adapted.body,
        ctaLabel: adapted.ctaLabel,
        structured: page,
        slotFills: generated.fills,
        slotPlan,
        generationRoute: route,
        generationMethod: "DETERMINISTIC_THIN",
        anthropicCalls: 0,
      },
    ];
  }

  assertModelSlotProjectionIsolation(slotPlan.slots);
  const schema = slotFillSchema(slotPlan);
  const { system, user } = buildPrompt(input);
  const first = await callAnthropic(system, user, true, schema);
  const parsed = parseSlotFills(first.text);
  if (!parsed) {
    throw new VariantParseError("A resposta estruturada é inválida.");
  }
  const page = hydrateSlotFillsToPage(parsed.fills, slotPlan, parsed.ctaLabel, input.targetApproach);
  const adapted = adaptStructuredToVariantCopy(page, plan);
  return [
    {
      approach,
      headline: adapted.headline,
      body: adapted.body,
      ctaLabel: adapted.ctaLabel,
      structured: page,
      slotFills: parsed.fills,
      slotPlan,
      generationRoute: route,
      generationMethod: "MODEL",
      anthropicCalls: 1,
    },
  ];
}
