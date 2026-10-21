import { completeCopy, stripFactLabel } from "@/lib/landing-composer/present";
import {
  copyEligibleList,
  copyEligibleOperationalItems,
  copyEligibleScalar,
  hasContactDetail,
  hasEncodingCorruption,
  isCopyEligibleConfidence,
  productNameAuthority,
  type FactConfidence,
  type ProductFacts,
  type SourcePageCategory,
} from "@/lib/product-facts";
import type { ProductAssetsContract } from "@/lib/product-assets/types";
import { guaranteeDurations, guaranteeStatesTerms, RESTATEMENT_EXEMPT_RULES, statementAllowed, statementFindings, type StatementKind } from "@/lib/product-contract/claims";
import { normalizeOffers } from "@/lib/product-contract/offers";
import { normalizeSpecifications } from "@/lib/product-contract/specifications";
import {
  CONTRACT_STATE_PATHS,
  PRODUCT_CONTRACT_VERSION,
  type ApprovedAssetView,
  type BuildResult,
  type ComponentItem,
  type ContractDiagnostics,
  type CtaState,
  type DataStateEntry,
  type EvidenceEntry,
  type OperationalStatement,
  type ProductContract,
  type ReasonCode,
  type Statement,
} from "@/lib/product-contract/types";
import { validateProductContract } from "@/lib/product-contract/validate";

/**
 * Builds the universal presentation contract from ProductFacts and the already-resolved inputs.
 *
 * Pure and deterministic: the same input gives the same contract. It reads facts only through the
 * existing copy-eligibility helpers, so a value that is not eligible copy cannot enter. It never
 * rewrites a statement: it keeps it verbatim or leaves it out and records why.
 */

export type HealthDisclaimerPolicy = "ALWAYS" | "WHEN_HEALTH_CONTENT" | "NEVER";

export type ContractInput = {
  facts: ProductFacts | null;
  /** Technical identifier of the page. Never displayed and never used for logic. */
  slug: string;
  siteName: string;
  /** Absolute origin used for the canonical URL. */
  siteUrl: string;
  /** The ProductAssets contract. Undefined means not resolved: no image is shown, and the state says why. */
  assets?: ProductAssetsContract | null;
  cta?: { href?: string | null; label?: string | null; previewOnly?: boolean } | null;
  legal: {
    affiliateDisclosure: string;
    healthDisclaimer?: string | null;
    healthDisclaimerPolicy?: HealthDisclaimerPolicy;
    notices?: string[];
    trustLinks: Array<{ href: string; label: string }>;
  };
  /** Candidate lead lines, normally from the editorial document. Each must match an eligible fact or it is dropped. */
  valueProposition?: { headline?: string | null; supporting?: string[] } | null;
  /** Lines the caller considers benefit claims. Each must match an eligible, policy-clean feature. */
  benefitCandidates?: string[];
  published?: boolean;
  /** Preferred order of contract field paths. It may reorder, never add or remove. */
  order?: string[];
};

const DEFAULT_CTA_LABEL = "View offer";
const REQUIRED_TRUST_PATHS = ["/privacy", "/terms", "/contact", "/affiliate-disclosure"] as const;
const PLACEHOLDER_URL = /[{}<>]|\b(?:YOUR[_-]?ID|XXXX+|PLACEHOLDER|REPLACE[_-]?ME|TODO)\b/i;
const PLACEHOLDER_HOST = /(?:^|\.)example\.(?:com|org|net)$|^localhost$|\.invalid$|\.local$/i;
const CTA_LABEL_FORBIDDEN = /[$€£%\d]|\b(?:free|save|saving|discount|off|bonus|guarantee[sd]?|limited|hurry|now only|today only)\b/i;
const HEALTH_CONTENT =
  /\b(?:supplements?|vitamins?|dietary|medical|medications?|medicines?|physicians?|doctors?|pregnan\w*|nursing|diseases?|diagnos\w*|treat(?:s|ed|ment)?|cures?|symptoms?|health\w*|clinical\w*)\b/i;

export const CONTRACT_FIELD_ORDER = [
  "valueProposition",
  "description",
  "features",
  "specifications",
  "components",
  "benefits",
  "usage",
  "cautions",
  "images",
  "offer",
  "guarantee",
  "operational",
  "faq",
  "complementary",
] as const;

function clean(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function contractKey(value: string): string {
  return stripFactLabel(value).toLowerCase().replace(/[™®©]/g, "").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = contractKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function createEvidence() {
  const entries: EvidenceEntry[] = [];
  const byKey = new Map<string, string>();
  return {
    entries,
    add(input: {
      field: string;
      text: string;
      confidence: FactConfidence;
      sourceUrl?: string | null;
      category?: SourcePageCategory | null;
      unit?: string;
      location?: string;
      retrievedAt?: string;
    }): string {
      const key = `${input.field}|${contractKey(input.text)}|${input.sourceUrl ?? ""}`;
      const hit = byKey.get(key);
      if (hit) return hit;
      const id = `e${entries.length + 1}`;
      entries.push({
        id,
        sourceUrl: clean(input.sourceUrl) || null,
        sourcePageCategory: input.category ?? null,
        ...(input.unit ? { sourceUnit: input.unit } : {}),
        ...(input.location ? { sourceLocation: input.location } : {}),
        ...(input.retrievedAt ? { retrievedAt: input.retrievedAt } : {}),
        confidence: input.confidence,
        copyEligibility: "YES",
        field: input.field,
      });
      byKey.set(key, id);
      return id;
    },
  };
}

type Evidence = ReturnType<typeof createEvidence>;

function snippetFor(facts: ProductFacts | null, text: string) {
  if (!facts) return null;
  const key = contractKey(text);
  if (!key) return null;
  const exact = facts.sourceSnippets.find((item) => contractKey(item.text) === key);
  if (exact) return exact;
  return facts.sourceSnippets.find((item) => {
    const other = contractKey(item.text);
    return other.length >= 12 && key.length >= 12 && (other.includes(key) || key.includes(other));
  }) ?? null;
}

function refFor(evidence: Evidence, facts: ProductFacts | null, field: string, text: string, confidence: FactConfidence): string {
  const snippet = snippetFor(facts, text);
  return evidence.add({
    field,
    text,
    confidence,
    sourceUrl: snippet?.sourceUrl || facts?.sourceUrl || null,
    category: snippet?.sourcePageCategory ?? null,
    unit: snippet?.sourceUnit,
    location: snippet?.sourceLocation,
    retrievedAt: snippet?.retrievedAt,
  });
}

type Screened = { kept: string[]; withheld: Array<{ text: string; categories: string[] }> };

function screen(values: string[], kind: StatementKind): Screened {
  const kept: string[] = [];
  const withheld: Screened["withheld"] = [];
  for (const raw of values) {
    const text = clean(stripFactLabel(raw));
    if (!text) continue;
    const findings = statementFindings(text, kind);
    if (findings.length > 0) withheld.push({ text, categories: [...new Set(findings.map((item) => item.category))] });
    else kept.push(text);
  }
  return { kept: unique(kept), withheld };
}

function listState(kept: number, withheld: number, absent: ReasonCode): DataStateEntry {
  if (kept > 0 && withheld === 0) return { state: "PRESENT", reason: null };
  if (kept > 0) return { state: "PARTIAL", reason: "CLAIM_WITHHELD_POLICY" };
  if (withheld > 0) return { state: "WITHHELD_POLICY", reason: "CLAIM_WITHHELD_POLICY" };
  return { state: "ABSENT", reason: absent };
}

function manufacturerLines(facts: ProductFacts | null): string[] {
  if (!facts) return [];
  const value = copyEligibleScalar(facts.manufacturer, facts.confidence.manufacturer);
  return unique(
    value
      .split(/\r?\n/)
      .map((line) => clean(line))
      .filter((line) => line && !hasContactDetail(line) && !/^(?:https?:\/\/|www\.)\S+$/i.test(line) && !/:$/.test(line) && statementAllowed(line, "OPERATIONAL")),
  );
}

function ingredientNote(facts: ProductFacts | null, name: string) {
  const target = contractKey(name);
  return (facts?.ingredientContext ?? []).find((item) => {
    if (contractKey(item.ingredient) !== target) return false;
    if (item.copyEligibility !== "YES" || !isCopyEligibleConfidence(item.provenance)) return false;
    if (item.kind !== "NEUTRAL_CONTEXT") return false;
    return statementAllowed(item.statement, "OPERATIONAL");
  });
}

function validCtaHref(raw: string | null | undefined): string | null {
  const value = clean(raw);
  if (!value || PLACEHOLDER_URL.test(value) || /demo-assets/i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
  if (PLACEHOLDER_HOST.test(url.hostname)) return null;
  return url.toString();
}

function ctaLabel(raw: string | null | undefined): string {
  const value = clean(raw);
  if (!value || value.length > 40 || CTA_LABEL_FORBIDDEN.test(value) || /^continue with this educational page\.?$/i.test(value)) return DEFAULT_CTA_LABEL;
  return value;
}

function assetView(asset: NonNullable<ProductAssetsContract["hero"]>, productName: string): ApprovedAssetView {
  return {
    src: asset.src,
    alt: asset.kind === "CONTEXTUAL" ? `${productName} in use` : `${productName} product image`,
    width: asset.width,
    height: asset.height,
    sha256: asset.sha256,
    origin: asset.origin,
    kind: asset.kind,
    authorization: { kind: asset.authorization.kind, useScope: asset.authorization.useScope, approvalMode: asset.approvalMode },
  };
}

function absolute(siteUrl: string, src: string): string {
  return /^https?:\/\//i.test(src) ? src : `${siteUrl.replace(/\/$/, "")}${src.startsWith("/") ? "" : "/"}${src}`;
}

export function buildProductContract(input: ContractInput): BuildResult {
  const facts = input.facts;
  const evidence = createEvidence();
  const states: Record<string, DataStateEntry> = {};
  const diagnostics: ContractDiagnostics = { withheld: [], conflicts: [], droppedOffers: [], notes: [] };
  const blockers: string[] = [];
  const withhold = (path: string, items: Screened["withheld"]) => {
    for (const item of items) diagnostics.withheld.push({ path, text: item.text, categories: item.categories });
  };

  // Identity ---------------------------------------------------------------------------------
  const identity = facts ? productNameAuthority(facts) : { name: "", authority: "NONE" as const };
  const productName = clean(identity.name);
  const manufacturer = manufacturerLines(facts);
  const brand = manufacturer[0];
  states["identity.brand"] = brand ? { state: "PRESENT", reason: null } : { state: "ABSENT", reason: "NO_BRAND" };

  const formatItem = facts ? copyEligibleOperationalItems(facts).find((item) => item.field === "productFormat") : undefined;
  const kindValue = clean(formatItem?.kind);
  const productKind = kindValue && kindValue.length >= 2 && kindValue.length <= 40 && !/^\d+$/.test(kindValue) && statementAllowed(kindValue, "OPERATIONAL") ? kindValue : undefined;
  states["identity.productKind"] = productKind ? { state: "PRESENT", reason: null } : { state: "ABSENT", reason: "NO_PRODUCT_KIND" };

  // Source statements ---------------------------------------------------------------------------
  const rawDescription = facts ? copyEligibleScalar(facts.description, facts.confidence.description) : "";
  const descriptionSentences = rawDescription ? completeCopy(rawDescription) : [];
  const descriptionScreen = screen(descriptionSentences, "PROMOTIONAL");
  withhold("description", descriptionScreen.withheld);

  const featureValues = facts ? copyEligibleList(facts.features, facts.confidence.features) : [];
  const formatStatement = clean(formatItem?.statement);
  // Where each statement really came from, so its evidence names the right field and provenance.
  const origins = new Map<string, { field: string; confidence: FactConfidence }>();
  const rememberOrigin = (text: string, field: string, confidence: FactConfidence) => {
    const key = contractKey(text);
    if (key && !origins.has(key)) origins.set(key, { field, confidence });
  };
  for (const sentence of descriptionSentences) rememberOrigin(sentence, "description", facts?.confidence.description ?? "NOT_FOUND");
  if (rawDescription) rememberOrigin(rawDescription, "description", facts?.confidence.description ?? "NOT_FOUND");
  for (const line of featureValues) rememberOrigin(line, "features", facts?.confidence.features ?? "NOT_FOUND");
  if (formatStatement && formatItem) rememberOrigin(formatStatement, "productFormat", formatItem.provenance);
  const originOf = (text: string) => origins.get(contractKey(text)) ?? { field: "features", confidence: facts?.confidence.features ?? ("NOT_FOUND" as FactConfidence) };
  const featureScreen = screen([...featureValues, ...(formatStatement ? [formatStatement] : [])], "PROMOTIONAL");
  withhold("features", featureScreen.withheld);

  const guaranteeRaw = facts ? clean(stripFactLabel(copyEligibleScalar(facts.guaranteeInformation, facts.confidence.guaranteeInformation))) : "";
  const usageScreen = screen(facts ? copyEligibleList(facts.usageInformation, facts.confidence.usageInformation) : [], "OPERATIONAL");
  withhold("usage", usageScreen.withheld);

  // Value proposition and benefits claim lines from the pools above ------------------------------
  const vpHeadline = clean(input.valueProposition?.headline);
  const pool = [...descriptionScreen.kept, ...featureScreen.kept];
  const poolHas = (text: string) => pool.some((line) => contractKey(line) === contractKey(text));
  // A short description of several sentences may itself be the lead. It is then traced as the whole description.
  const wholeDescription = descriptionScreen.withheld.length === 0 && descriptionScreen.kept.length > 1 ? descriptionScreen.kept.join(" ") : "";
  const headlineIsWholeDescription = Boolean(vpHeadline && wholeDescription && contractKey(vpHeadline) === contractKey(wholeDescription));
  const headlineText = headlineIsWholeDescription
    ? wholeDescription
    : vpHeadline && poolHas(vpHeadline)
      ? pool.find((line) => contractKey(line) === contractKey(vpHeadline)) ?? null
      : null;
  const supportingTexts = unique((input.valueProposition?.supporting ?? []).map(clean).filter((line) => line && poolHas(line) && contractKey(line) !== contractKey(headlineText ?? "")))
    .map((line) => pool.find((entry) => contractKey(entry) === contractKey(line)) as string)
    .slice(0, 3);
  const leadKeys = new Set([headlineText, ...supportingTexts].filter((line): line is string => Boolean(line)).map(contractKey));
  if (headlineIsWholeDescription) for (const sentence of descriptionScreen.kept) leadKeys.add(contractKey(sentence));
  const benefitCandidates = unique((input.benefitCandidates ?? []).map(clean).filter(Boolean));
  const benefitTexts = benefitCandidates
    .map((candidate) => featureScreen.kept.find((line) => contractKey(line) === contractKey(candidate)))
    .filter((line): line is string => Boolean(line) && !leadKeys.has(contractKey(line as string)));
  const benefitKeys = new Set(benefitTexts.map(contractKey));
  const benefitWithheld = benefitCandidates.filter((candidate) => featureScreen.withheld.some((item) => contractKey(item.text) === contractKey(candidate))).length;

  // Components --------------------------------------------------------------------------------------
  const componentScreen = screen(facts ? copyEligibleList(facts.ingredientsOrComponents, facts.confidence.ingredientsOrComponents) : [], "OPERATIONAL");
  withhold("components", componentScreen.withheld);
  const componentKeys = new Set(componentScreen.kept.map(contractKey));

  // Statements shown elsewhere must not repeat (O4) ------------------------------------------------
  const usageKeys = new Set(usageScreen.kept.map(contractKey));
  const guaranteeKey = contractKey(guaranteeRaw);
  const priceStatementKey = contractKey(facts ? copyEligibleScalar(facts.pricingInformation, facts.confidence.pricingInformation) : "");
  const featureKept = featureScreen.kept.filter((line) => {
    const key = contractKey(line);
    return !leadKeys.has(key) && !benefitKeys.has(key) && !usageKeys.has(key) && !componentKeys.has(key) && key !== guaranteeKey && key !== priceStatementKey;
  });
  const descriptionKept = descriptionScreen.kept.filter((line) => !leadKeys.has(contractKey(line)));

  // Contract assembly ----------------------------------------------------------------------------------
  const fieldConfidence = (field: keyof ProductFacts["confidence"]): FactConfidence => facts?.confidence[field] ?? "NOT_FOUND";
  const statement = (field: string, text: string, confidence: FactConfidence): Statement => ({ text, evidenceRefs: [refFor(evidence, facts, field, text, confidence)] });
  const statementFrom = (text: string): Statement => {
    const origin = originOf(text);
    return statement(origin.field, text, origin.confidence);
  };

  const contract: ProductContract = {
    contractVersion: PRODUCT_CONTRACT_VERSION,
    status: "RENDERABLE",
    identity: {
      productName,
      ...(brand ? { brand } : {}),
      ...(productKind ? { productKind } : {}),
      language: "en",
      slug: input.slug,
    },
    cta: { state: "MISSING" },
    legal: { affiliateDisclosure: clean(input.legal.affiliateDisclosure), trustLinks: [] },
    seo: { title: "", description: "", canonical: "", robots: "noindex,nofollow" },
    dataStates: states,
    evidence: [],
    gates: { grounding: "PASS", policy: "PASS", content: "PASS", assets: "PASS", link: "PASS" },
    publication: { approval: "REQUIRED", blockers },
  };

  // valueProposition
  if (headlineText) {
    contract.valueProposition = {
      headline: statementFrom(headlineText),
      ...(supportingTexts.length > 0 ? { supporting: supportingTexts.map(statementFrom) } : {}),
    };
    states["valueProposition.headline"] = { state: "PRESENT", reason: null };
  } else {
    states["valueProposition.headline"] = { state: "ABSENT", reason: "NO_VALUE_PROPOSITION" };
    diagnostics.notes.push(vpHeadline ? "VALUE_PROPOSITION_NOT_TRACEABLE" : "NO_VALUE_PROPOSITION_CANDIDATE");
  }
  states["valueProposition.supporting"] = supportingTexts.length > 0 ? { state: "PRESENT", reason: null } : { state: "ABSENT", reason: "NO_VALUE_PROPOSITION" };

  // description
  if (descriptionKept.length > 0) {
    const text = descriptionKept.join(" ");
    contract.description = { text, evidenceRefs: [...new Set(descriptionKept.map((line) => refFor(evidence, facts, "description", line, fieldConfidence("description"))))] };
    states.description = descriptionScreen.withheld.length > 0 ? { state: "PARTIAL", reason: "CLAIM_WITHHELD_POLICY" } : { state: "PRESENT", reason: null };
  } else if (headlineText && descriptionScreen.kept.length > 0) {
    states.description = { state: "ABSENT", reason: "CARRIED_BY_VALUE_PROPOSITION" };
    diagnostics.notes.push("DESCRIPTION_CARRIED_BY_VALUE_PROPOSITION");
  } else {
    states.description = rawDescription
      ? listState(0, descriptionScreen.withheld.length, "NO_DESCRIPTION")
      : { state: "ABSENT", reason: "NO_DESCRIPTION" };
  }

  // features
  if (featureKept.length > 0) {
    contract.features = featureKept.map((line) => ({ ...statementFrom(line), attribution: "SOURCE_STATEMENT" as const }));
  }
  states.features = listState(featureKept.length, featureScreen.withheld.length, "NO_ELIGIBLE_FEATURES");
  if (featureKept.length === 0 && featureScreen.withheld.length === 0 && (headlineText || supportingTexts.length > 0 || benefitTexts.length > 0)) {
    states.features = { state: "ABSENT", reason: "NO_ELIGIBLE_FEATURES" };
  }

  // specifications
  const specs = normalizeSpecifications(facts);
  for (const conflict of specs.conflicts) diagnostics.conflicts.push({ path: "specifications", name: conflict.name, values: conflict.values });
  withhold("specifications", specs.rejected);
  if (specs.kept.length > 0) {
    contract.specifications = specs.kept.map((item) => ({
      name: item.name,
      value: item.value,
      ...(item.unit ? { unit: item.unit } : {}),
      evidenceRefs: [
        evidence.add({
          field: "specifications",
          text: `${item.name}: ${item.value} ${item.unit ?? ""}`,
          confidence: item.fact.provenance,
          sourceUrl: item.fact.sourceUrl,
          category: item.fact.sourcePageCategory,
          unit: item.fact.sourceUnit,
          location: item.fact.sourceLocation,
          retrievedAt: item.fact.retrievedAt,
        }),
      ],
    }));
  }
  if (specs.kept.length > 0 && specs.conflicts.length === 0 && specs.rejected.length === 0) states.specifications = { state: "PRESENT", reason: null };
  else if (specs.kept.length > 0) states.specifications = { state: "PARTIAL", reason: specs.conflicts.length > 0 ? "SCALAR_CONFLICT" : "CLAIM_WITHHELD_POLICY" };
  else if (specs.conflicts.length > 0) states.specifications = { state: "CONFLICTING", reason: "SCALAR_CONFLICT" };
  else if (specs.rejected.length > 0) states.specifications = { state: "WITHHELD_POLICY", reason: "CLAIM_WITHHELD_POLICY" };
  else states.specifications = { state: "ABSENT", reason: "NO_SPECIFICATIONS" };

  // components
  if (componentScreen.kept.length > 0) {
    const role = facts?.componentRole;
    contract.components = componentScreen.kept.map((name): ComponentItem => {
      const note = ingredientNote(facts, name);
      const refs = [refFor(evidence, facts, "ingredientsOrComponents", name, fieldConfidence("ingredientsOrComponents"))];
      if (note) {
        refs.push(evidence.add({ field: "ingredientContext", text: note.statement, confidence: note.provenance, sourceUrl: note.sourceUrl, category: note.sourcePageCategory, unit: note.sourceUnit, location: note.sourceLocation, retrievedAt: note.retrievedAt }));
      }
      return { name, ...(role ? { role } : {}), ...(note && contractKey(note.statement) !== contractKey(name) ? { note: clean(note.statement) } : {}), evidenceRefs: refs };
    });
  }
  states.components = listState(componentScreen.kept.length, componentScreen.withheld.length, "NO_COMPONENTS");

  // benefits
  if (benefitTexts.length > 0) {
    contract.benefits = benefitTexts.map((line) => ({ ...statementFrom(line), attribution: "SELLER_CLAIM" as const, policyStatus: "PASS" as const }));
    states.benefits = { state: "PRESENT", reason: null };
  } else if (benefitWithheld > 0) {
    states.benefits = { state: "WITHHELD_POLICY", reason: "CLAIM_WITHHELD_POLICY" };
  } else {
    states.benefits = { state: "ABSENT", reason: "NO_BENEFIT_SOURCE" };
  }

  // usage
  if (usageScreen.kept.length > 0) contract.usage = usageScreen.kept.map((line) => statement("usageInformation", line, fieldConfidence("usageInformation")));
  states.usage = listState(usageScreen.kept.length, usageScreen.withheld.length, "NO_ELIGIBLE_USAGE");

  // cautions: every caution the source stated is kept, minus contact details and corrupted text
  const cautionValues = unique(
    (facts ? copyEligibleList(facts.cautions, facts.confidence.cautions) : [])
      .map((line) => clean(stripFactLabel(line)))
      .filter((line) => line && !hasContactDetail(line) && !hasEncodingCorruption(line)),
  );
  if (cautionValues.length > 0) contract.cautions = cautionValues.map((line) => statement("cautions", line, fieldConfidence("cautions")));
  states.cautions = cautionValues.length > 0 ? { state: "PRESENT", reason: null } : { state: "ABSENT", reason: "NO_CAUTIONS" };

  // images: only what the ProductAssets contract approved
  const assets = input.assets;
  const hero = assets?.hero && assets.hero.kind !== "CONTEXTUAL" ? assets.hero : null;
  const gallery = (assets?.approved ?? []).filter((asset) => asset.id !== hero?.id);
  if (hero || gallery.length > 0) {
    contract.images = {
      ...(hero ? { hero: assetView(hero, productName) } : {}),
      ...(gallery.length > 0 ? { gallery: gallery.map((asset) => assetView(asset, productName)) } : {}),
    };
  }
  const unapproved = assets ? assets.counts.candidate + assets.counts.rejected : 0;
  if (hero) states["images.hero"] = { state: "PRESENT", reason: null };
  else if (!assets) states["images.hero"] = { state: "ABSENT", reason: "ASSETS_NOT_RESOLVED" };
  else if (unapproved > 0) states["images.hero"] = { state: "WITHHELD_UNAUTHORIZED", reason: "NO_APPROVED_PACKSHOT" };
  else states["images.hero"] = { state: "ABSENT", reason: "NO_APPROVED_PACKSHOT" };
  states["images.gallery"] = gallery.length > 0 ? { state: "PRESENT", reason: null } : !assets ? { state: "ABSENT", reason: "ASSETS_NOT_RESOLVED" } : { state: "ABSENT", reason: "NO_GALLERY" };

  // offer
  const offers = normalizeOffers(facts);
  diagnostics.droppedOffers.push(...offers.dropped);
  if (offers.packages.length > 0) {
    contract.offer = {
      packages: offers.packages.map((offer) => ({
        label: offer.label,
        ...(offer.quantity ? { quantity: offer.quantity } : {}),
        ...(offer.totalPrice ? { totalPrice: offer.totalPrice } : {}),
        ...(offer.unitPrice ? { unitPrice: offer.unitPrice } : {}),
        ...(offer.originalPrice ? { originalPrice: offer.originalPrice } : {}),
        ...(offer.savings ? { savings: offer.savings } : {}),
        ...(offer.shipping ? { shipping: offer.shipping } : {}),
        ...(offer.bonuses ? { bonuses: offer.bonuses } : {}),
        ...(offer.popularityLabel ? { popularityLabel: offer.popularityLabel } : {}),
        evidenceRefs: [
          evidence.add({
            field: offer.origin === "OFFER_FACTS" ? "offerFacts" : "pricingInformation",
            text: `${offer.label} ${offer.totalPrice ?? ""} ${offer.unitPrice ?? ""}`,
            confidence: offer.origin === "OFFER_FACTS" ? "DIRECT_SOURCE" : fieldConfidence("pricingInformation"),
            sourceUrl: offer.sourceUrl ?? facts?.sourceUrl ?? null,
          }),
        ],
      })),
    };
    states["offer.packages"] = offers.dropped.length > 0 ? { state: "PARTIAL", reason: "PRICE_CONTEXT_INSUFFICIENT" } : { state: "PRESENT", reason: null };
  } else if (offers.contextInsufficient) {
    states["offer.packages"] = { state: "PARTIAL", reason: "PRICE_CONTEXT_INSUFFICIENT" };
  } else {
    states["offer.packages"] = { state: "ABSENT", reason: "NO_VERIFIED_PRICE" };
  }

  // cta
  const href = validCtaHref(input.cta?.href);
  let ctaState: CtaState = "MISSING";
  if (href) ctaState = "AUTHORIZED";
  else if (input.cta?.previewOnly) ctaState = "PREVIEW_ONLY";
  if (ctaState === "AUTHORIZED") {
    contract.cta = { state: "AUTHORIZED", href: href as string, label: ctaLabel(input.cta?.label) };
    states.cta = { state: "PRESENT", reason: null };
  } else if (ctaState === "PREVIEW_ONLY") {
    contract.cta = { state: "PREVIEW_ONLY", label: ctaLabel(input.cta?.label) };
    states.cta = { state: "WITHHELD_UNAUTHORIZED", reason: "PREVIEW_ONLY" };
  } else {
    contract.cta = { state: "MISSING" };
    states.cta = { state: clean(input.cta?.href) ? "WITHHELD_UNAUTHORIZED" : "ABSENT", reason: clean(input.cta?.href) ? "LINK_NOT_AUTHORIZED" : "NO_AUTHORIZED_AFFILIATE_URL" };
  }

  // guarantee
  if (!guaranteeRaw) {
    states.guarantee = { state: "ABSENT", reason: "NO_ELIGIBLE_GUARANTEE" };
  } else if (!statementAllowed(guaranteeRaw, "OPERATIONAL", RESTATEMENT_EXEMPT_RULES)) {
    states.guarantee = { state: "WITHHELD_POLICY", reason: "CLAIM_WITHHELD_POLICY" };
    diagnostics.withheld.push({ path: "guarantee", text: guaranteeRaw, categories: statementFindings(guaranteeRaw, "OPERATIONAL", RESTATEMENT_EXEMPT_RULES).map((item) => item.category) });
  } else if (guaranteeDurations(guaranteeRaw).length > 1) {
    states.guarantee = { state: "CONFLICTING", reason: "SCALAR_CONFLICT" };
    diagnostics.conflicts.push({ path: "guarantee", name: "guarantee duration", values: guaranteeDurations(guaranteeRaw) });
  } else if (!guaranteeStatesTerms(guaranteeRaw)) {
    states.guarantee = { state: "ABSENT", reason: "NO_ELIGIBLE_GUARANTEE" };
    diagnostics.notes.push("GUARANTEE_WITHOUT_TERMS");
  } else {
    contract.guarantee = { text: guaranteeRaw, origin: "PRODUCT_SOURCE", evidenceRefs: [refFor(evidence, facts, "guaranteeInformation", guaranteeRaw, fieldConfidence("guaranteeInformation"))] };
    states.guarantee = { state: "PRESENT", reason: null };
  }

  // operational facts, restated as stated
  const operational = facts ? copyEligibleOperationalItems(facts) : [];
  const operationalStatements = (field: "returnsInformation" | "shippingInformation"): OperationalStatement[] => {
    const kept: OperationalStatement[] = [];
    for (const item of operational.filter((entry) => entry.field === field)) {
      const text = clean(item.statement);
      if (!text) continue;
      const findings = statementFindings(text, "OPERATIONAL", RESTATEMENT_EXEMPT_RULES);
      if (findings.length > 0) {
        diagnostics.withheld.push({ path: `operational.${field}`, text, categories: findings.map((entry) => entry.category) });
        continue;
      }
      if (kept.some((entry) => contractKey(entry.statement) === contractKey(text)) || contractKey(text) === guaranteeKey) continue;
      kept.push({
        kind: item.kind,
        statement: text,
        evidenceRefs: [evidence.add({ field, text, confidence: item.provenance, sourceUrl: item.sourceUrl, category: snippetFor(facts, text)?.sourcePageCategory ?? null })],
      });
    }
    return kept;
  };
  const returns = operationalStatements("returnsInformation");
  const shipping = operationalStatements("shippingInformation");
  if (returns.length > 0 || shipping.length > 0) {
    contract.operational = { ...(returns.length > 0 ? { returns } : {}), ...(shipping.length > 0 ? { shipping } : {}) };
  }
  states["operational.returns"] = returns.length > 0 ? { state: "PRESENT", reason: null } : { state: "ABSENT", reason: "NO_RETURNS" };
  states["operational.shipping"] = shipping.length > 0 ? { state: "PRESENT", reason: null } : { state: "ABSENT", reason: "NO_SHIPPING" };

  // faq: only question and answer pairs the source stated, never repeating another field
  const shown = new Set<string>([
    ...returns.map((item) => contractKey(item.statement)),
    ...shipping.map((item) => contractKey(item.statement)),
    guaranteeKey,
  ]);
  const faq: NonNullable<ProductContract["faq"]> = [];
  for (const snippet of facts?.sourceSnippets ?? []) {
    const question = clean(snippet.question);
    const answer = clean(stripFactLabel(snippet.text));
    if (!question || !answer || !isCopyEligibleConfidence(snippet.confidence)) continue;
    if (shown.has(contractKey(answer)) || faq.some((entry) => contractKey(entry.question) === contractKey(question))) continue;
    const findings = [...statementFindings(question, "PROMOTIONAL"), ...statementFindings(answer, "PROMOTIONAL")];
    if (findings.length > 0) {
      diagnostics.withheld.push({ path: "faq", text: `${question} ${answer}`, categories: [...new Set(findings.map((entry) => entry.category))] });
      continue;
    }
    faq.push({ question, answer, evidenceRefs: [evidence.add({ field: "faq", text: `${question} ${answer}`, confidence: snippet.confidence, sourceUrl: snippet.sourceUrl, category: snippet.sourcePageCategory ?? null, unit: snippet.sourceUnit, location: snippet.sourceLocation, retrievedAt: snippet.retrievedAt })] });
  }
  if (faq.length > 0) contract.faq = faq;
  states.faq = faq.length > 0 ? { state: "PRESENT", reason: null } : { state: "ABSENT", reason: "NO_FAQ" };

  // complementary provenance: a manufacturer line beyond the one used as the brand
  const extraProvenance = manufacturer.find((line) => contractKey(line) !== contractKey(brand ?? ""));
  if (extraProvenance) {
    contract.complementary = { provenance: statement("manufacturer", extraProvenance, fieldConfidence("manufacturer")) };
    states["complementary.provenance"] = { state: "PRESENT", reason: null };
  } else {
    states["complementary.provenance"] = { state: "ABSENT", reason: "NO_PROVENANCE" };
  }

  // legal
  const healthTexts = [rawDescription, ...featureValues, ...cautionValues, ...(facts ? facts.usageInformation : []), guaranteeRaw];
  const healthContent = healthTexts.some((text) => HEALTH_CONTENT.test(text));
  const policy = input.legal.healthDisclaimerPolicy ?? "WHEN_HEALTH_CONTENT";
  const disclaimerText = clean(input.legal.healthDisclaimer);
  const wantsDisclaimer = policy === "ALWAYS" || (policy === "WHEN_HEALTH_CONTENT" && healthContent);
  if (wantsDisclaimer && disclaimerText) {
    contract.legal.healthDisclaimer = disclaimerText;
    states["legal.healthDisclaimer"] = { state: "PRESENT", reason: null };
  } else {
    states["legal.healthDisclaimer"] = { state: "ABSENT", reason: "NO_HEALTH_CONTENT" };
    if (wantsDisclaimer && !disclaimerText) blockers.push("HEALTH_DISCLAIMER_MISSING");
  }
  const notices = unique((input.legal.notices ?? []).map(clean).filter(Boolean));
  if (notices.length > 0) contract.legal.notices = notices;
  contract.legal.trustLinks = input.legal.trustLinks
    .map((link) => ({ href: clean(link.href), label: clean(link.label) }))
    .filter((link) => link.href.startsWith("/") && link.label);
  for (const path of REQUIRED_TRUST_PATHS) {
    if (!contract.legal.trustLinks.some((link) => link.href === path)) blockers.push(`TRUST_LINK_MISSING:${path}`);
  }
  if (!contract.legal.affiliateDisclosure) blockers.push("AFFILIATE_DISCLOSURE_MISSING");

  // seo
  const siteUrl = clean(input.siteUrl).replace(/\/$/, "");
  const lead = contract.valueProposition?.headline?.text ?? contract.description?.text ?? "";
  const firstSentence = lead ? (completeCopy(lead)[0] ?? lead) : "";
  contract.seo = {
    title: productName ? `${productName} | ${clean(input.siteName)}` : clean(input.siteName),
    description: firstSentence && firstSentence.length <= 160 ? firstSentence : productName ? `Product information for ${productName}.` : "",
    canonical: `${siteUrl}/p/${input.slug}`,
    robots: input.published ? "index,follow" : "noindex,nofollow",
  };
  const heroImage = contract.images?.hero ? absolute(siteUrl, contract.images.hero.src) : null;
  if (heroImage) {
    contract.seo.ogImage = heroImage;
    states["seo.ogImage"] = { state: "PRESENT", reason: null };
  } else {
    states["seo.ogImage"] = { state: "ABSENT", reason: "NO_APPROVED_PACKSHOT" };
  }
  contract.seo.structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productName,
    ...(firstSentence && firstSentence.length <= 160 ? { description: firstSentence } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    ...(heroImage ? { image: [heroImage] } : {}),
  };

  // presentation hints: a reorder of fields that exist, nothing else
  const knownOrder = (input.order ?? []).filter((path, index, all) => (CONTRACT_FIELD_ORDER as readonly string[]).includes(path) && all.indexOf(path) === index);
  if (knownOrder.length > 0) contract.presentationHints = { order: knownOrder };

  // finalize ----------------------------------------------------------------------------------------------
  contract.evidence = evidence.entries;
  for (const path of CONTRACT_STATE_PATHS) {
    if (!contract.dataStates[path]) contract.dataStates[path] = { state: "ABSENT", reason: null };
  }
  const hasBody = Boolean(contract.description || contract.features || contract.specifications || contract.components || contract.benefits || contract.offer || contract.valueProposition);
  if (!productName || !contract.legal.affiliateDisclosure || !hasBody) {
    contract.status = "INSUFFICIENT_FOR_PAGE";
    blockers.push(!productName ? "PRODUCT_NAME_MISSING" : !hasBody ? "NO_RENDERABLE_CONTENT" : "AFFILIATE_DISCLOSURE_MISSING");
  }
  if (contract.cta.state !== "AUTHORIZED") blockers.push("CTA_NOT_AUTHORIZED");

  const report = validateProductContract(contract, { facts });
  const failed = (rules: string[]) => report.violations.some((violation) => rules.includes(violation.rule));
  const hasConflict = Object.values(contract.dataStates).some((entry) => entry.state === "CONFLICTING");
  contract.gates = {
    grounding: failed(["EVIDENCE_REF", "EVIDENCE_REQUIRED", "TRACE_TO_FACT"]) ? "FAIL" : facts ? "PASS" : "REVIEW",
    policy: failed(["POLICY_STATEMENT"]) ? "FAIL" : blockers.includes("HEALTH_DISCLAIMER_MISSING") ? "REVIEW" : "PASS",
    content: contract.status === "INSUFFICIENT_FOR_PAGE" || facts?.importQuality === "INSUFFICIENT" ? "FAIL" : hasConflict ? "REVIEW" : "PASS",
    assets: failed(["IMAGE_AUTHORITY"]) ? "FAIL" : assets === undefined ? "REVIEW" : "PASS",
    link: contract.cta.state === "AUTHORIZED" ? "PASS" : contract.cta.state === "PREVIEW_ONLY" ? "REVIEW" : "FAIL",
  };
  for (const [name, status] of Object.entries(contract.gates)) {
    if (status === "FAIL") blockers.push(`GATE_FAILED:${name}`);
  }
  contract.publication.blockers = [...new Set(blockers)];
  return { contract, diagnostics };
}
