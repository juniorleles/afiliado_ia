/**
 * ProductFacts — Phase 3 content engine.
 *
 * SOURCE FACTS (imported or operator-entered) are distinct from
 * AI-generated copy. AI-generated content must not be treated as evidence.
 * Product facts must come from imported or operator-provided information.
 *
 * Session-only during generation. Phase 6 snapshots `sourceFactsJson` on
 * the campaign so publish can re-run grounding against the same facts.
 */

export type FactConfidence =
  | "DIRECT_SOURCE"
  | "HEURISTIC_EXTRACTION"
  | "AI_SOURCE_CLASSIFICATION"
  | "MANUAL"
  | "NOT_FOUND";

export type FactOrigin = "IMPORTED" | "MANUAL";

export type ImportQuality = "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";

export type FactField =
  | "productName"
  | "description"
  | "features"
  | "ingredientsOrComponents"
  | "usageInformation"
  | "cautions"
  | "pricingInformation"
  | "guaranteeInformation"
  | "manufacturer";

export type SourceFact = {
  field: string;
  text: string;
  sourceUrl: string;
  confidence: FactConfidence;
  question?: string;
  context?: string;
};

export type FieldConfidence = Record<FactField, FactConfidence>;

export type ProductFacts = {
  productName: string;
  sourceUrl: string;
  origin: FactOrigin;
  description?: string;
  features: string[];
  ingredientsOrComponents: string[];
  usageInformation: string[];
  cautions: string[];
  pricingInformation?: string;
  guaranteeInformation?: string;
  manufacturer?: string;
  sourceSnippets: SourceFact[];
  importWarnings: string[];
  confidence: FieldConfidence;
  importQuality: ImportQuality;
  productImageUrl?: string;
  productImageProvenance: "DIRECT_SOURCE" | "MANUAL" | "PLACEHOLDER" | "NOT_FOUND";
  webDiscovery?: {
    triggered: boolean;
    originalUrl: string;
    primaryBlock: string | null;
    productName: string;
    message: string;
    queriesUsed: string[];
    sources: Array<{
      url: string;
      title: string;
      snippet: string;
      query: string;
      status: string;
      identityReasons: string[];
    }>;
    acceptedCount: number;
    uncertainCount: number;
    phases?: Array<{ phase: string; detail?: string }>;
    outcome?: string;
    operatorMessages?: string[];
    searchProvider?: {
      implemented: boolean;
      configured: boolean;
      name: string;
      apiKeyPresent: boolean;
      realWebSearchAvailable: boolean;
      missingConfig: string[];
      message?: string;
    };
    counts?: {
      SEARCH_RESULTS?: number;
      SOURCES_ATTEMPTED?: number;
      SOURCES_TIMEOUT?: number;
      SOURCES_ACCEPTED?: number;
      SOURCES_REJECTED?: number;
    };
    timings?: {
      PRIMARY_FETCH_MS?: number;
      SEARCH_MS?: number;
      ALTERNATIVE_FETCH_MS?: number;
      IDENTITY_MS?: number;
      EXTRACTION_MS?: number;
      ROBOTS_CHECK_MS?: number;
      TOTAL_IMPORT_MS?: number;
    };
  };
};

export type ManualFactInput = {
  productName: string;
  sourceUrl?: string;
  description?: string;
  featuresText?: string;
  ingredientsText?: string;
  usageText?: string;
  cautionsText?: string;
  pricingInformation?: string;
  guaranteeInformation?: string;
  manufacturer?: string;
};

const EMPTY_CONFIDENCE: FieldConfidence = {
  productName: "NOT_FOUND",
  description: "NOT_FOUND",
  features: "NOT_FOUND",
  ingredientsOrComponents: "NOT_FOUND",
  usageInformation: "NOT_FOUND",
  cautions: "NOT_FOUND",
  pricingInformation: "NOT_FOUND",
  guaranteeInformation: "NOT_FOUND",
  manufacturer: "NOT_FOUND",
};

function lines(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[•\-\*]\s*/, "").trim())
    .filter(Boolean);
}

export function provenanceLabel(confidence: FactConfidence): string {
  switch (confidence) {
    case "DIRECT_SOURCE":
      return "DIRECT SOURCE";
    case "HEURISTIC_EXTRACTION":
      return "HEURISTIC";
    case "AI_SOURCE_CLASSIFICATION":
      return "AI SOURCE CLASSIFICATION";
    case "MANUAL":
      return "MANUAL";
    default:
      return "NOT FOUND";
  }
}

function fieldCounts(facts: ProductFacts, field: FactField, hasValue: boolean): boolean {
  if (!hasValue) return false;
  return (facts.confidence?.[field] ?? "NOT_FOUND") !== "NOT_FOUND";
}

export function assessImportQuality(facts: ProductFacts): ImportQuality {
  const hasName = Boolean(facts.productName.trim());
  const hasDescription = fieldCounts(facts, "description", Boolean(facts.description?.trim()));
  const hasFeatures = fieldCounts(facts, "features", facts.features.length > 0);
  const hasIngredients = fieldCounts(facts, "ingredientsOrComponents", facts.ingredientsOrComponents.length > 0);
  const hasUsage = fieldCounts(facts, "usageInformation", facts.usageInformation.length > 0);
  const hasGuarantee = fieldCounts(facts, "guaranteeInformation", Boolean(facts.guaranteeInformation?.trim()));
  const hasCautions = fieldCounts(facts, "cautions", facts.cautions.length > 0);
  const hasPricing = fieldCounts(facts, "pricingInformation", Boolean(facts.pricingInformation?.trim()));
  const hasManufacturer = fieldCounts(facts, "manufacturer", Boolean(facts.manufacturer?.trim()));

  const major = [hasDescription, hasFeatures, hasIngredients, hasUsage, hasGuarantee, hasCautions].filter(
    Boolean,
  ).length;
  const extra = [hasPricing, hasManufacturer].filter(Boolean).length;

  if (!hasName) return "INSUFFICIENT";
  if (major === 0 && extra === 0) return "INSUFFICIENT";
  if (!hasDescription && major <= 1 && extra === 0) return "INSUFFICIENT";

  if (hasDescription && major >= 3) return "SUFFICIENT";
  if (major >= 4) return "SUFFICIENT";
  return "PARTIAL";
}

export function withImportQuality(facts: ProductFacts): ProductFacts {
  return { ...facts, importQuality: assessImportQuality(facts) };
}

export function emptyProductFacts(
  productName = "",
  sourceUrl = "",
  origin: FactOrigin = "MANUAL",
): ProductFacts {
  const warnings =
    origin === "MANUAL"
      ? ["MANUAL PRODUCT FACTS — the operator is responsible for these facts. Nothing was imported."]
      : [];
  const facts: ProductFacts = {
    productName,
    sourceUrl,
    origin,
    features: [],
    ingredientsOrComponents: [],
    usageInformation: [],
    cautions: [],
    sourceSnippets: [],
    importWarnings: warnings,
    productImageProvenance: "NOT_FOUND",
    confidence: {
      ...EMPTY_CONFIDENCE,
      productName: productName.trim() ? "MANUAL" : "NOT_FOUND",
    },
    importQuality: "INSUFFICIENT",
  };
  return withImportQuality(facts);
}

export function applyManualFacts(base: ProductFacts, manual: ManualFactInput): ProductFacts {
  const next: ProductFacts = {
    ...base,
    productName: manual.productName.trim() || base.productName,
    sourceUrl: (manual.sourceUrl ?? base.sourceUrl).trim(),
    origin: base.origin === "IMPORTED" && hasImportedContent(base) ? "IMPORTED" : "MANUAL",
    confidence: { ...base.confidence },
    productImageProvenance: base.productImageProvenance ?? "NOT_FOUND",
    productImageUrl: base.productImageUrl,
  };

  const description = manual.description?.trim();
  if (description) {
    next.description = description;
    next.confidence.description =
      description === (base.description ?? "") ? base.confidence.description : "MANUAL";
    if (description !== base.description) {
      next.origin = overlayOrigin(base, "description");
    }
  }

  const features = lines(manual.featuresText);
  if (manual.featuresText !== undefined) {
    next.features = features;
    next.confidence.features = listConfidence(features, base.features, base.confidence.features);
  }

  const ingredients = lines(manual.ingredientsText);
  if (manual.ingredientsText !== undefined) {
    next.ingredientsOrComponents = ingredients;
    next.confidence.ingredientsOrComponents = listConfidence(
      ingredients,
      base.ingredientsOrComponents,
      base.confidence.ingredientsOrComponents,
    );
  }

  const usage = lines(manual.usageText);
  if (manual.usageText !== undefined) {
    next.usageInformation = usage;
    next.confidence.usageInformation = listConfidence(
      usage,
      base.usageInformation,
      base.confidence.usageInformation,
    );
  }

  const cautions = lines(manual.cautionsText);
  if (manual.cautionsText !== undefined) {
    next.cautions = cautions;
    next.confidence.cautions = listConfidence(cautions, base.cautions, base.confidence.cautions);
  }

  if (manual.pricingInformation !== undefined) {
    const pricing = manual.pricingInformation.trim();
    next.pricingInformation = pricing || undefined;
    next.confidence.pricingInformation = scalarConfidence(
      pricing,
      base.pricingInformation,
      base.confidence.pricingInformation,
    );
  }

  if (manual.guaranteeInformation !== undefined) {
    const guarantee = manual.guaranteeInformation.trim();
    next.guaranteeInformation = guarantee || undefined;
    next.confidence.guaranteeInformation = scalarConfidence(
      guarantee,
      base.guaranteeInformation,
      base.confidence.guaranteeInformation,
    );
  }

  if (manual.manufacturer !== undefined) {
    const manufacturer = manual.manufacturer.trim();
    next.manufacturer = manufacturer || undefined;
    next.confidence.manufacturer = scalarConfidence(
      manufacturer,
      base.manufacturer,
      base.confidence.manufacturer,
    );
  }

  next.confidence.productName = next.productName.trim()
    ? next.productName.trim() === base.productName.trim()
      ? base.confidence.productName === "NOT_FOUND"
        ? "MANUAL"
        : base.confidence.productName
      : "MANUAL"
    : "NOT_FOUND";

  if (base.origin === "IMPORTED" && next.origin === "IMPORTED") {
    const edited = factsDiffer(base, next);
    if (edited) {
      next.importWarnings = uniqueWarnings([
        ...next.importWarnings,
        "Some fields were edited by the operator (MANUAL overlay on IMPORTED facts).",
      ]);
    }
  }

  if (next.origin === "MANUAL" && !next.importWarnings.some((w) => w.includes("MANUAL PRODUCT FACTS"))) {
    next.importWarnings = uniqueWarnings([
      ...next.importWarnings,
      "MANUAL PRODUCT FACTS — the operator is responsible for these facts.",
    ]);
  }

  return withImportQuality(next);
}

function listConfidence(
  nextValues: string[],
  previousValues: string[],
  previous: FactConfidence,
): FactConfidence {
  if (nextValues.length === 0) return "NOT_FOUND";
  if (nextValues.join("\n") === previousValues.join("\n")) return previous;
  return "MANUAL";
}

function scalarConfidence(
  nextValue: string,
  previousValue: string | undefined,
  previous: FactConfidence,
): FactConfidence {
  if (!nextValue) return "NOT_FOUND";
  if (nextValue === (previousValue ?? "")) return previous;
  return "MANUAL";
}

function overlayOrigin(base: ProductFacts, _field: string): FactOrigin {
  return base.origin === "IMPORTED" ? "IMPORTED" : "MANUAL";
}

function hasImportedContent(facts: ProductFacts): boolean {
  return (
    facts.origin === "IMPORTED" ||
    facts.features.length > 0 ||
    facts.ingredientsOrComponents.length > 0 ||
    Boolean(facts.description)
  );
}

function factsDiffer(a: ProductFacts, b: ProductFacts): boolean {
  return (
    a.productName !== b.productName ||
    a.description !== b.description ||
    a.features.join("\n") !== b.features.join("\n") ||
    a.ingredientsOrComponents.join("\n") !== b.ingredientsOrComponents.join("\n") ||
    a.usageInformation.join("\n") !== b.usageInformation.join("\n") ||
    a.cautions.join("\n") !== b.cautions.join("\n") ||
    a.pricingInformation !== b.pricingInformation ||
    a.guaranteeInformation !== b.guaranteeInformation ||
    a.manufacturer !== b.manufacturer
  );
}

function uniqueWarnings(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

export function hasUsableFacts(facts: ProductFacts): boolean {
  return Boolean(
    facts.productName.trim() ||
      facts.description ||
      facts.features.length ||
      facts.ingredientsOrComponents.length ||
      facts.usageInformation.length,
  );
}

/**
 * Copy-eligible facts may be used as SOURCE FACTS in generation and as
 * grounding evidence. Stored ProductFacts that fail this check are kept for
 * operator review and must not be treated as publishable evidence.
 *
 * DIRECT_SOURCE: seller/source text — copy-eligible when semantically used.
 * MANUAL: operator-entered — copy-eligible; the operator attested the text.
 * HEURISTIC_EXTRACTION: stored, never automatically copy-eligible.
 * AI_SOURCE_CLASSIFICATION: stored, never automatically copy-eligible.
 * NOT_FOUND: never copy-eligible.
 *
 * FAQ / raw source snippets are research evidence, not copy evidence, unless
 * the same text was promoted into a copy-eligible ProductFacts field.
 */
export const CONSUMER_COPY_ALLOWED_PROVENANCE: FactConfidence[] = ["DIRECT_SOURCE", "MANUAL"];
export const CONSUMER_COPY_DISALLOWED_PROVENANCE: FactConfidence[] = [
  "HEURISTIC_EXTRACTION",
  "NOT_FOUND",
  "AI_SOURCE_CLASSIFICATION",
];

export function isCopyEligibleConfidence(confidence: FactConfidence): boolean {
  return confidence === "DIRECT_SOURCE" || confidence === "MANUAL";
}

/**
 * Identity label for generation/composition. DIRECT_SOURCE and MANUAL names
 * are ordinary copy-eligible facts. A stored non-empty name with another
 * provenance is still required so the model can name the product — it is
 * not evidence for any other field and is not promoted to DIRECT_SOURCE.
 */
export type ProductNameAuthority = "DIRECT_SOURCE" | "MANUAL" | "OPERATOR_IDENTITY" | "NONE";

export type ConsumerCopyEligibleFacts = {
  productName: string;
  productNameAuthority: ProductNameAuthority;
  productNameStoredProvenance: FactConfidence;
  description: string;
  features: string[];
  ingredientsOrComponents: string[];
  usageInformation: string[];
  cautions: string[];
  pricingInformation: string;
  guaranteeInformation: string;
  manufacturer: string;
  sourceUrl: string;
};

export type GenerationFactManifestItem = {
  id: string;
  field: string;
  value: string;
  provenance: FactConfidence | "OPERATOR_IDENTITY";
  sourceUrl: string;
  copyEligible: boolean;
};

export type GenerationFactManifest = {
  items: GenerationFactManifestItem[];
  promptFactNotCopyEligible: number;
};

export function productNameAuthority(facts: ProductFacts): {
  name: string;
  authority: ProductNameAuthority;
  storedProvenance: FactConfidence;
} {
  const name = facts.productName.trim();
  const stored = facts.confidence.productName;
  if (!name || stored === "NOT_FOUND") {
    return { name: "", authority: "NONE", storedProvenance: stored };
  }
  if (stored === "DIRECT_SOURCE") {
    return { name, authority: "DIRECT_SOURCE", storedProvenance: stored };
  }
  if (stored === "MANUAL") {
    return { name, authority: "MANUAL", storedProvenance: stored };
  }
  if (stored === "HEURISTIC_EXTRACTION") {
    return { name, authority: "OPERATOR_IDENTITY", storedProvenance: stored };
  }
  return { name: "", authority: "NONE", storedProvenance: stored };
}

/** Single factual authority for Generation, Grounding, and Page Composition. */
export function getConsumerCopyEligibleFacts(facts: ProductFacts): ConsumerCopyEligibleFacts {
  const identity = productNameAuthority(facts);
  return {
    productName: identity.name,
    productNameAuthority: identity.authority,
    productNameStoredProvenance: identity.storedProvenance,
    description: copyEligibleScalar(facts.description, facts.confidence.description),
    features: copyEligibleList(facts.features, facts.confidence.features),
    ingredientsOrComponents: copyEligibleList(
      facts.ingredientsOrComponents,
      facts.confidence.ingredientsOrComponents,
    ),
    usageInformation: copyEligibleList(facts.usageInformation, facts.confidence.usageInformation),
    cautions: copyEligibleList(facts.cautions, facts.confidence.cautions),
    pricingInformation: copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation),
    guaranteeInformation: copyEligibleScalar(
      facts.guaranteeInformation,
      facts.confidence.guaranteeInformation,
    ),
    manufacturer: copyEligibleScalar(facts.manufacturer, facts.confidence.manufacturer),
    sourceUrl: (facts.sourceUrl ?? "").trim(),
  };
}

function pushManifestValue(
  items: GenerationFactManifestItem[],
  field: string,
  value: string,
  provenance: GenerationFactManifestItem["provenance"],
  sourceUrl: string,
  copyEligible: boolean,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const id = `F${String(items.length + 1).padStart(3, "0")}`;
  items.push({ id, field, value: trimmed, provenance, sourceUrl, copyEligible });
}

/**
 * Diagnostic manifest of every factual value supplied to the generation model.
 * Provenance metadata is internal — never render it as public page copy.
 */
export function buildGenerationFactManifest(facts: ProductFacts): GenerationFactManifest {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const sourceUrl = eligible.sourceUrl;
  const items: GenerationFactManifestItem[] = [];

  if (eligible.productName) {
    const copyEligible =
      eligible.productNameAuthority === "DIRECT_SOURCE" ||
      eligible.productNameAuthority === "MANUAL" ||
      eligible.productNameAuthority === "OPERATOR_IDENTITY";
    pushManifestValue(
      items,
      "productName",
      eligible.productName,
      eligible.productNameAuthority === "OPERATOR_IDENTITY"
        ? "OPERATOR_IDENTITY"
        : eligible.productNameStoredProvenance,
      sourceUrl,
      copyEligible,
    );
  }
  pushManifestValue(
    items,
    "description",
    eligible.description,
    facts.confidence.description,
    sourceUrl,
    isCopyEligibleConfidence(facts.confidence.description),
  );
  for (const feature of eligible.features) {
    pushManifestValue(items, "features", feature, facts.confidence.features, sourceUrl, true);
  }
  for (const ingredient of eligible.ingredientsOrComponents) {
    pushManifestValue(
      items,
      "ingredientsOrComponents",
      ingredient,
      facts.confidence.ingredientsOrComponents,
      sourceUrl,
      true,
    );
  }
  for (const usage of eligible.usageInformation) {
    pushManifestValue(items, "usageInformation", usage, facts.confidence.usageInformation, sourceUrl, true);
  }
  for (const caution of eligible.cautions) {
    pushManifestValue(items, "cautions", caution, facts.confidence.cautions, sourceUrl, true);
  }
  pushManifestValue(
    items,
    "pricingInformation",
    eligible.pricingInformation,
    facts.confidence.pricingInformation,
    sourceUrl,
    true,
  );
  pushManifestValue(
    items,
    "guaranteeInformation",
    eligible.guaranteeInformation,
    facts.confidence.guaranteeInformation,
    sourceUrl,
    true,
  );
  pushManifestValue(
    items,
    "manufacturer",
    eligible.manufacturer,
    facts.confidence.manufacturer,
    sourceUrl,
    true,
  );

  return {
    items,
    promptFactNotCopyEligible: items.filter((item) => !item.copyEligible).length,
  };
}

/** Prompt-visible evidence catalog. IDs are internal; never render them as page copy. */
export function formatEvidenceManifestForPrompt(manifest: GenerationFactManifest): string {
  const eligible = manifest.items.filter((item) => item.copyEligible);
  const lines = [
    "EVIDENCE MANIFEST — copy-eligible values. CODE assigns IDs to slots. Do not return evidenceIds.",
    "Do not expose evidence IDs, provenance, or source metadata in consumer copy.",
  ];
  if (eligible.length === 0) {
    lines.push("No copy-eligible evidence IDs.");
    return lines.join("\n");
  }
  for (const item of eligible) {
    lines.push(`${item.id} FIELD=${item.field} VALUE=${item.value}`);
  }
  return lines.join("\n");
}

/** Shared authority for Generation, Grounding, Page Composition, and Publication. */
export function copyEligibleScalar(value: string | undefined, confidence: FactConfidence): string {
  if (!isCopyEligibleConfidence(confidence)) return "";
  return (value ?? "").trim();
}

export function copyEligibleList(value: string[] | undefined, confidence: FactConfidence): string[] {
  if (!isCopyEligibleConfidence(confidence)) return [];
  return (value ?? []).map((item) => item.trim()).filter(Boolean);
}

export function copyEligibleJoined(value: string | string[] | undefined, confidence: FactConfidence): string {
  if (Array.isArray(value)) return copyEligibleList(value, confidence).join(". ");
  return copyEligibleScalar(value, confidence);
}

export function isCopyEligibleImageProvenance(provenance: string | undefined): boolean {
  return provenance === "DIRECT_SOURCE" || provenance === "MANUAL";
}

/**
 * Factual context for the model. Missing fields are labeled NOT_FOUND so
 * they are omitted, never invented from training memory.
 * HEURISTIC / AI-classified values stay in ProductFacts storage but are not
 * emitted as copy-eligible SOURCE FACTS.
 * FAQ / raw source / SERP / research snippets are not prompt-visible facts.
 */
export function formatFactsForPrompt(
  facts: ProductFacts,
  overrides?: {
    description?: string;
    features?: string[];
    evidenceManifest?: string;
  },
): string {
  const eligible = getConsumerCopyEligibleFacts(facts);
  const identityLine = eligible.productName
    ? eligible.productNameAuthority === "OPERATOR_IDENTITY"
      ? `Product identity (name the product only; not evidence for other fields): ${eligible.productName}`
      : `Product name [${eligible.productNameStoredProvenance}]: ${eligible.productName}`
    : "Product name: NOT_FOUND — omit a specific product name.";

  const absentSubjects: string[] = [];
  if (!eligible.manufacturer) {
    absentSubjects.push("manufacturer/company identity, facility, location, GMP/FDA/certification");
  }
  if (!eligible.pricingInformation) absentSubjects.push("pricing, discounts, cost");
  if (!eligible.guaranteeInformation) absentSubjects.push("guarantee, refund duration");
  if (eligible.cautions.length === 0) absentSubjects.push("cautions, medical advice, consult-a-doctor language");
  if (eligible.usageInformation.length === 0) absentSubjects.push("dosage, servings, directions");
  if (eligible.ingredientsOrComponents.length === 0) {
    absentSubjects.push("ingredient names, allergen/GMO/BPA claims");
  }

  const linesOut: string[] = [
    "PRODUCT FACTS — use ONLY copy-eligible fields in this block as factual context.",
    "COPY-ELIGIBLE: DIRECT_SOURCE and MANUAL only.",
    "NOT COPY-ELIGIBLE: HEURISTIC_EXTRACTION, AI_SOURCE_CLASSIFICATION, NOT_FOUND — omit those topics; do not invent replacements.",
    "FAQ snippets, raw source snippets, SERP titles, and research observations are not copy evidence. Do not paraphrase them.",
    "You may only make product-specific factual statements supported by the supplied eligible facts.",
    "If a field is absent, do not infer it.",
    "Absence of manufacturer, price, dosage, ingredients, guarantee, cautions, certification, medical category, facility or location means you must omit that subject.",
    "Do not fill gaps from memory. Do not treat generated copy as evidence.",
    "Do not use world knowledge, category encyclopedias, typical industry ranges, safety advice, or research language that is not in this block.",
    "Do not recombine numbers, durations, or nouns from different fields into a new claim.",
    "DIRECT_SOURCE means the source/seller stated this text. It is NOT independent scientific verification.",
    "Health, efficacy, clinical, or scientific seller claims must be omitted or clearly attributed — do not restate them as editorial facts.",
    `Origin: ${facts.origin}`,
    `Import quality: ${facts.importQuality}`,
    identityLine,
    "",
    overrides?.evidenceManifest ?? formatEvidenceManifestForPrompt(buildGenerationFactManifest(facts)),
  ];

  if (facts.sourceUrl) {
    linesOut.push(`Source URL (context only, not a citation to invent from): ${facts.sourceUrl}`);
  }

  const descriptionValue = overrides?.description ?? eligible.description;
  const featureValues = overrides?.features ?? eligible.features;
  linesOut.push(fieldLine("Description", descriptionValue, facts.confidence.description, facts.description));
  linesOut.push(listLine("Features", featureValues, facts.confidence.features, facts.features));
  linesOut.push(
    listLine(
      "Ingredients / components",
      eligible.ingredientsOrComponents,
      facts.confidence.ingredientsOrComponents,
      facts.ingredientsOrComponents,
    ),
  );
  linesOut.push(
    listLine(
      "Usage / how it works / directions",
      eligible.usageInformation,
      facts.confidence.usageInformation,
      facts.usageInformation,
    ),
  );
  linesOut.push(listLine("Warnings / cautions", eligible.cautions, facts.confidence.cautions, facts.cautions));
  linesOut.push(
    fieldLine("Pricing", eligible.pricingInformation, facts.confidence.pricingInformation, facts.pricingInformation),
  );
  linesOut.push(
    fieldLine(
      "Guarantee",
      eligible.guaranteeInformation,
      facts.confidence.guaranteeInformation,
      facts.guaranteeInformation,
    ),
  );
  linesOut.push(fieldLine("Manufacturer", eligible.manufacturer, facts.confidence.manufacturer, facts.manufacturer));

  const missing = (Object.entries(facts.confidence) as Array<[FactField, FactConfidence]>)
    .filter(([, c]) => c === "NOT_FOUND")
    .map(([field]) => field);
  if (missing.length > 0) {
    linesOut.push(`NOT_FOUND (omit these topics; do not invent): ${missing.join(", ")}`);
  }
  if (absentSubjects.length > 0) {
    linesOut.push(`ABSENT SUBJECTS (do not hint, infer, or invent): ${absentSubjects.join("; ")}.`);
  }

  return linesOut.join("\n");
}

function fieldLine(
  label: string,
  eligibleValue: string,
  confidence: FactConfidence,
  storedValue?: string,
): string {
  if (confidence === "NOT_FOUND" || (!eligibleValue && !(storedValue ?? "").trim())) {
    return `${label}: NOT_FOUND — omit this topic.`;
  }
  if (!isCopyEligibleConfidence(confidence) || !eligibleValue) {
    return `${label}: NOT COPY-ELIGIBLE (${confidence}) — stored for operator review; omit this topic from generated copy.`;
  }
  return `${label} [${confidence}]: ${eligibleValue}`;
}

function listLine(
  label: string,
  eligibleValues: string[],
  confidence: FactConfidence,
  storedValues?: string[],
): string {
  const storedCount = (storedValues ?? []).map((item) => item.trim()).filter(Boolean).length;
  if (confidence === "NOT_FOUND" || (eligibleValues.length === 0 && storedCount === 0)) {
    return `${label}: NOT_FOUND — omit this section.`;
  }
  if (!isCopyEligibleConfidence(confidence) || eligibleValues.length === 0) {
    return `${label}: NOT COPY-ELIGIBLE (${confidence}) — stored for operator review; omit this section from generated copy.`;
  }
  return `${label} [${confidence}]:\n${eligibleValues.map((v) => `- ${v}`).join("\n")}`;
}

export function listAsTextarea(values: string[]): string {
  return values.join("\n");
}

export function snippetsForField(facts: ProductFacts, field: string): SourceFact[] {
  return facts.sourceSnippets.filter((s) => s.field === field);
}
