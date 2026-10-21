import { pickComposition } from "@/lib/design-system/compose";
import { pageDensity, purchaseCtaAllowed } from "@/lib/design-system/layout";
import type { DataState, EvidenceEntry, ProductContract, Statement } from "@/lib/product-contract/types";
import type {
  ConversionBrief,
  ConversionGoal,
  CustomerQuestion,
  DecisionTrace,
  KnowledgeClass,
  MissingEvidenceItem,
  PackagePresentation,
  SectionPlanItem,
  SectionType,
  StrategyStatus,
  TrafficIntent,
  TracedClaim,
  VisualPriority,
} from "@/lib/conversion-strategy/types";
import { CONVERSION_BRIEF_VERSION } from "@/lib/conversion-strategy/types";

/**
 * Deterministic Conversion Strategy Engine (Execution 50C).
 *
 * Reads a Product Contract and writes a Conversion Brief. It does not invent facts, prices,
 * benefits, testimonials or discounts. Hypotheses stay INTERNAL_ONLY. It never branches on a
 * product name, slug or campaign id.
 */

function evidenceMap(contract: ProductContract): Map<string, EvidenceEntry> {
  return new Map(contract.evidence.map((entry) => [entry.id, entry]));
}

function sourceOf(map: Map<string, EvidenceEntry>, refs: string[]): string | null {
  for (const id of refs) {
    const url = map.get(id)?.sourceUrl;
    if (url) return url;
  }
  return null;
}

function claim(
  id: string,
  text: string,
  refs: string[],
  path: string,
  map: Map<string, EvidenceEntry>,
  extra?: { class?: KnowledgeClass; restriction?: TracedClaim["restriction"]; verification?: TracedClaim["verification"] },
): TracedClaim {
  const knowledge = extra?.class ?? "FACT";
  return {
    id,
    text,
    class: knowledge,
    evidenceRefs: refs,
    sourceUrl: sourceOf(map, refs),
    verification: extra?.verification ?? "FROM_CONTRACT",
    restriction: extra?.restriction ?? (knowledge === "FACT" ? "PUBLISHABLE" : "INTERNAL_ONLY"),
    contractPath: path,
  };
}

function statementClaim(id: string, statement: Statement, path: string, map: Map<string, EvidenceEntry>): TracedClaim {
  return claim(id, statement.text, statement.evidenceRefs, path, map);
}

function featureScore(text: string): number {
  let score = 0;
  if (/\d/.test(text)) score += 2;
  if (/\b(without|free of|tested|includes?|adjustable|washable|stackable|wireless|resistant)\b/i.test(text)) score += 2;
  if (text.length >= 24) score += 1;
  return score;
}

function conversionGoal(contract: ProductContract): ConversionGoal {
  if (purchaseCtaAllowed(contract) && contract.offer?.packages.length) return "SEND_TO_OFFER";
  if (purchaseCtaAllowed(contract)) return "SEND_TO_DETAILS";
  return "INFORM";
}

function trafficIntent(contract: ProductContract): TrafficIntent {
  if (contract.offer?.packages.length) return "CONSIDERATION";
  if ((contract.specifications?.length ?? 0) >= 2 || (contract.features?.length ?? 0) >= 3) return "EVALUATION";
  return "INFORMATION";
}

function commercialFactCount(contract: ProductContract): number {
  return [
    contract.valueProposition?.headline,
    contract.description,
    contract.features?.length,
    contract.specifications?.length,
    contract.components?.length,
    contract.benefits?.length,
    contract.offer?.packages.length,
    contract.guarantee,
    contract.faq?.length,
    contract.images?.hero,
  ].filter(Boolean).length;
}

function strategyStatus(contract: ProductContract): { status: StrategyStatus; editorial: ConversionBrief["editorialQuality"] } {
  if (contract.status === "INSUFFICIENT_FOR_PAGE" || contract.gates.grounding === "FAIL" || contract.gates.policy === "FAIL") {
    return { status: "BLOCKED", editorial: "INSUFFICIENT_DATA" };
  }
  const facts = commercialFactCount(contract);
  if (facts <= 1) return { status: "INSUFFICIENT_DATA", editorial: "INSUFFICIENT_DATA" };
  const incomplete =
    !contract.offer?.packages.length ||
    !contract.images?.hero ||
    contract.cta.state !== "AUTHORIZED" ||
    contract.gates.link !== "PASS";
  if (incomplete || facts < 5) return { status: "PARTIAL", editorial: "PARTIAL" };
  return { status: "READY", editorial: "READY" };
}

function offerMode(contract: ProductContract): ConversionBrief["offerStrategy"]["mode"] {
  const state = contract.dataStates["offer.packages"]?.state;
  if (contract.offer?.packages.length) return "PACKAGES";
  if (state === "PARTIAL") return "INSUFFICIENT_CONTEXT";
  return "NO_VERIFIED_PRICE";
}

function questions(contract: ProductContract, map: Map<string, EvidenceEntry>): CustomerQuestion[] {
  const out: CustomerQuestion[] = [];
  const add = (question: string, answerable: boolean, refs: string[], path: string | null, knowledge: KnowledgeClass = "FACT") => {
    out.push({
      question,
      answerable,
      class: knowledge,
      evidenceRefs: refs,
      restriction: knowledge === "FACT" && answerable ? "PUBLISHABLE" : "INTERNAL_ONLY",
      contractPath: path,
    });
  };
  add("What is this product?", Boolean(contract.valueProposition?.headline || contract.description), contract.valueProposition?.headline?.evidenceRefs ?? contract.description?.evidenceRefs ?? [], contract.valueProposition?.headline ? "valueProposition.headline" : "description");
  add("What are the stated characteristics?", Boolean(contract.features?.length), contract.features?.[0]?.evidenceRefs ?? [], "features");
  add("What are the stated specifications?", Boolean(contract.specifications?.length), contract.specifications?.[0]?.evidenceRefs ?? [], "specifications");
  add("What is included or declared in the composition?", Boolean(contract.components?.length), contract.components?.[0]?.evidenceRefs ?? [], "components");
  add("How is it used?", Boolean(contract.usage?.length), contract.usage?.[0]?.evidenceRefs ?? [], "usage");
  add("What does it cost?", Boolean(contract.offer?.packages.length), contract.offer?.packages[0]?.evidenceRefs ?? [], "offer.packages");
  add("Is there a stated guarantee or return path?", Boolean(contract.guarantee || contract.operational?.returns?.length), contract.guarantee?.evidenceRefs ?? contract.operational?.returns?.[0]?.evidenceRefs ?? [], contract.guarantee ? "guarantee" : "operational.returns");
  for (const item of contract.faq ?? []) {
    add(item.question, true, item.evidenceRefs, "faq", "FACT");
  }
  void map;
  return out;
}

function objections(contract: ProductContract): TracedClaim[] {
  const out: TracedClaim[] = [];
  const hypo = (id: string, text: string, path: string): TracedClaim => ({
    id,
    text,
    class: "HYPOTHESIS",
    evidenceRefs: [],
    sourceUrl: null,
    verification: "ABSENT",
    restriction: "INTERNAL_ONLY",
    contractPath: path,
  });
  if (!contract.offer?.packages.length) out.push(hypo("obj-price", "A visitor may hesitate without a verified price.", "offer.packages"));
  if (!contract.images?.hero) out.push(hypo("obj-image", "A visitor may want to see an authorized product image.", "images.hero"));
  if (!contract.guarantee && !contract.operational?.returns?.length) {
    out.push(hypo("obj-trust", "A visitor may ask about returns or a stated guarantee.", "guarantee"));
  }
  if (contract.cta.state !== "AUTHORIZED") {
    out.push(hypo("obj-link", "A visitor cannot be sent to a seller because the affiliate link is not authorized.", "cta"));
  }
  return out;
}

function audienceHypothesis(contract: ProductContract): TracedClaim {
  const kind = contract.identity.productKind?.trim();
  const text = kind
    ? `People comparing ${kind} using only the facts the source stated.`
    : "People comparing this product using only the facts the source stated.";
  return {
    id: "audience",
    text,
    class: "HYPOTHESIS",
    evidenceRefs: [],
    sourceUrl: null,
    verification: contract.identity.productKind ? "FROM_CONTRACT" : "ABSENT",
    restriction: "INTERNAL_ONLY",
    contractPath: "identity.productKind",
  };
}

function missingEvidence(contract: ProductContract): MissingEvidenceItem[] {
  const needed: Record<string, string> = {
    "images.hero": "product demonstration",
    "images.gallery": "additional authorized visuals",
    "offer.packages": "commercial offer",
    "cta": "authorized purchase action",
    "guarantee": "trust / guarantee",
    "operational.returns": "returns",
    "operational.shipping": "shipping",
    "features": "differentiators",
    "benefits": "seller-stated claims",
    "specifications": "specifications",
    "valueProposition.headline": "value proposition",
    "faq": "answered questions",
  };
  const out: MissingEvidenceItem[] = [];
  for (const [path, entry] of Object.entries(contract.dataStates)) {
    if (entry.state === "PRESENT") continue;
    out.push({
      path,
      state: entry.state,
      reason: entry.reason,
      neededFor: needed[path] ?? path,
      class: "EDITORIAL_SUGGESTION",
      restriction: "INTERNAL_ONLY",
    });
  }
  return out;
}

function visualPriorities(contract: ProductContract): VisualPriority[] {
  const out: VisualPriority[] = [];
  if (!contract.images?.hero) {
    out.push({
      need: "An authorized packshot or packaging image",
      why: "The contract has no approved hero image, so the page must not invent one.",
      class: "EDITORIAL_SUGGESTION",
      restriction: "INTERNAL_ONLY",
    });
  }
  if (!contract.images?.gallery?.length) {
    out.push({
      need: "Authorized supporting images, if the program provides them",
      why: "There is no authorized gallery.",
      class: "EDITORIAL_SUGGESTION",
      restriction: "INTERNAL_ONLY",
    });
  }
  return out;
}

function includeSection(type: SectionType, contract: ProductContract): boolean {
  switch (type) {
    case "hero":
    case "legal":
      return true;
    case "presentation":
      return Boolean(contract.valueProposition?.headline || contract.description);
    case "differentiators":
      return Boolean(contract.features?.length);
    case "benefits":
      return Boolean(contract.benefits?.length);
    case "demonstration":
      return Boolean(contract.images?.hero);
    case "specifications":
      return Boolean(contract.specifications?.length || contract.components?.length);
    case "offers":
      return Boolean(contract.offer?.packages.length);
    case "guarantee":
      return Boolean(contract.guarantee);
    case "trust":
      return Boolean(contract.operational?.returns?.length || contract.operational?.shipping?.length || contract.cautions?.length);
    case "faq":
      return Boolean(contract.faq?.length);
    case "cta_final":
      return purchaseCtaAllowed(contract);
    default:
      return false;
  }
}

function sectionMeta(type: SectionType): { goal: string; needed: string[]; paths: string[] } {
  const table: Record<SectionType, { goal: string; needed: string[]; paths: string[] }> = {
    hero: { goal: "Identify the product and open with the grounded proposition", needed: ["product name", "value proposition"], paths: ["identity.productName", "valueProposition.headline"] },
    presentation: { goal: "State what the source said the product is", needed: ["description or value proposition"], paths: ["valueProposition.headline", "description"] },
    differentiators: { goal: "Show source-stated characteristics", needed: ["features"], paths: ["features"] },
    benefits: { goal: "Show seller-stated claims that passed policy, attributed as claims", needed: ["benefits"], paths: ["benefits"] },
    demonstration: { goal: "Show the authorized product image", needed: ["approved image"], paths: ["images.hero"] },
    specifications: { goal: "Show structured specifications and declared composition", needed: ["specifications or components"], paths: ["specifications", "components"] },
    offers: { goal: "Present verified packages and prices without arithmetic", needed: ["verified packages"], paths: ["offer.packages"] },
    guarantee: { goal: "Restate the source-stated guarantee", needed: ["guarantee"], paths: ["guarantee"] },
    trust: { goal: "Restate returns, shipping or cautions", needed: ["operational facts or cautions"], paths: ["operational.returns", "operational.shipping", "cautions"] },
    faq: { goal: "Answer questions the source already answered", needed: ["faq"], paths: ["faq"] },
    cta_final: { goal: "Offer the authorized hop", needed: ["authorized href"], paths: ["cta"] },
    legal: { goal: "Keep disclosure and legal links available", needed: ["affiliate disclosure"], paths: ["legal.affiliateDisclosure"] },
  };
  return table[type];
}

function availableFor(type: SectionType, contract: ProductContract): { available: string[]; missing: string[] } {
  const present: Record<SectionType, string[]> = {
    hero: [contract.identity.productName, contract.valueProposition?.headline?.text].filter((v): v is string => Boolean(v)),
    presentation: [contract.valueProposition?.headline?.text, contract.description?.text].filter((v): v is string => Boolean(v)),
    differentiators: (contract.features ?? []).map((item) => item.text),
    benefits: (contract.benefits ?? []).map((item) => item.text),
    demonstration: contract.images?.hero ? [contract.images.hero.alt] : [],
    specifications: [...(contract.specifications ?? []).map((item) => item.name), ...(contract.components ?? []).map((item) => item.name)],
    offers: (contract.offer?.packages ?? []).map((item) => item.label),
    guarantee: contract.guarantee ? [contract.guarantee.text] : [],
    trust: [
      ...(contract.operational?.returns ?? []).map((item) => item.statement),
      ...(contract.operational?.shipping ?? []).map((item) => item.statement),
      ...(contract.cautions ?? []).map((item) => item.text),
    ],
    faq: (contract.faq ?? []).map((item) => item.question),
    cta_final: contract.cta.href ? [contract.cta.label ?? "View offer"] : [],
    legal: [contract.legal.affiliateDisclosure],
  };
  const available = present[type];
  const missing = available.length ? [] : sectionMeta(type).needed;
  return { available, missing };
}

function sectionOrder(contract: ProductContract): SectionType[] {
  const hasOffer = Boolean(contract.offer?.packages.length);
  const hasImage = Boolean(contract.images?.hero);
  const rich = (contract.features?.length ?? 0) + (contract.specifications?.length ?? 0) >= 4;
  if (hasOffer && hasImage) {
    return ["hero", "presentation", "offers", "differentiators", "benefits", "specifications", "demonstration", "guarantee", "trust", "faq", "cta_final", "legal"];
  }
  if (rich && !hasImage) {
    return ["hero", "presentation", "differentiators", "specifications", "benefits", "offers", "guarantee", "trust", "faq", "cta_final", "legal"];
  }
  return ["hero", "presentation", "differentiators", "specifications", "benefits", "demonstration", "offers", "guarantee", "trust", "faq", "cta_final", "legal"];
}

function buildSectionPlan(contract: ProductContract): SectionPlanItem[] {
  const order = sectionOrder(contract);
  return order.map((type, index) => {
    const meta = sectionMeta(type);
    const { available, missing } = availableFor(type, contract);
    const include = includeSection(type, contract);
    return {
      id: type,
      type,
      commercialGoal: meta.goal,
      priority: index + 1,
      include,
      factPaths: meta.paths,
      contentNeeded: meta.needed,
      available,
      missing: include ? [] : missing,
      displayWhen: include ? "contract carries the required facts" : "omit — required facts are absent or unauthorized",
      positionReason: include
        ? `Position ${index + 1} because ${meta.goal.toLowerCase()}.`
        : `Omitted: ${missing.join(", ") || "not eligible"}.`,
    };
  });
}

export function buildConversionBrief(contract: ProductContract): ConversionBrief {
  const map = evidenceMap(contract);
  const { status, editorial } = strategyStatus(contract);
  const goal = conversionGoal(contract);
  const decisions: DecisionTrace[] = [];

  const vp = contract.valueProposition?.headline
    ? statementClaim("vp", contract.valueProposition.headline, "valueProposition.headline", map)
    : undefined;
  const primary = vp ?? (contract.description ? statementClaim("primary", contract.description, "description", map) : undefined);

  const ranked = [...(contract.features ?? [])]
    .map((item, index) => ({ item, index, score: featureScore(item.text) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const differentiators = ranked.map((row, i) => statementClaim(`diff-${i + 1}`, row.item, `features[${row.index}]`, map));
  const benefits = (contract.benefits ?? []).map((item, i) =>
    claim(`ben-${i + 1}`, item.text, item.evidenceRefs, `benefits[${i}]`, map),
  );

  const packages: PackagePresentation[] = (contract.offer?.packages ?? []).map((pack) => ({
    label: pack.label,
    quantityText: pack.quantity?.text,
    totalPrice: pack.totalPrice,
    unitPrice: pack.unitPrice,
    originalPrice: pack.originalPrice,
    savings: pack.savings,
    popularityLabel: pack.popularityLabel,
    evidenceRefs: pack.evidenceRefs,
    highlight: Boolean(pack.popularityLabel),
  }));

  const trust: TracedClaim[] = [];
  if (contract.guarantee) trust.push(claim("trust-guarantee", contract.guarantee.text, contract.guarantee.evidenceRefs, "guarantee", map));
  (contract.operational?.returns ?? []).forEach((item, i) => trust.push(claim(`trust-return-${i + 1}`, item.statement, item.evidenceRefs, `operational.returns[${i}]`, map)));
  (contract.operational?.shipping ?? []).forEach((item, i) => trust.push(claim(`trust-ship-${i + 1}`, item.statement, item.evidenceRefs, `operational.shipping[${i}]`, map)));
  (contract.cautions ?? []).forEach((item, i) => trust.push(claim(`trust-caution-${i + 1}`, item.text, item.evidenceRefs, `cautions[${i}]`, map)));

  const hop = purchaseCtaAllowed(contract);
  decisions.push({
    id: "d-status",
    decision: `status=${status}`,
    reason: status === "BLOCKED"
      ? "A grounding or policy gate failed, or the contract is not renderable."
      : status === "INSUFFICIENT_DATA"
        ? "Too few commercial facts for a full narrative. Do not invent filler."
        : status === "PARTIAL"
          ? "A narrative is possible, but image, offer or CTA is incomplete."
          : "Enough grounded facts exist for a commercial narrative. Publication still requires a person.",
    evidenceRefs: [],
    class: "EDITORIAL_SUGGESTION",
  });
  decisions.push({
    id: "d-goal",
    decision: `conversionGoal=${goal}`,
    reason: hop && packages.length
      ? "An authorized hop and verified packages exist."
      : hop
        ? "An authorized hop exists, but there is no verified package."
        : "No authorized hop, so the page can only inform.",
    evidenceRefs: packages[0]?.evidenceRefs ?? [],
    class: "FACT",
  });
  decisions.push({
    id: "d-cta",
    decision: hop ? "cta=AUTHORIZED_HOP" : "cta=NONE",
    reason: hop ? "CTA gates pass." : "CTA is missing, preview-only, or a link/policy gate failed.",
    evidenceRefs: [],
    class: "FACT",
  });

  const compositionHint = pickComposition(contract);
  const narrativeShape = compositionHint === "product-hero" ? "IMAGE_LED" : compositionHint === "editorial-premium" ? "EDITORIAL_LED" : "FACTS_LED";

  const mode = offerMode(contract);
  const offerNotes: TracedClaim[] = [];
  if (mode === "NO_VERIFIED_PRICE") {
    offerNotes.push(claim("offer-missing", "No verified price is available.", [], "offer.packages", map, { class: "FACT", restriction: "PUBLISHABLE", verification: contract.dataStates["offer.packages"]?.state ?? "ABSENT" }));
  }
  if (mode === "INSUFFICIENT_CONTEXT") {
    offerNotes.push(claim("offer-partial", "A price was mentioned, but there is not enough commercial context to show it.", [], "offer.packages", map, { class: "FACT", restriction: "PUBLISHABLE", verification: "PARTIAL" }));
  }

  return {
    briefVersion: CONVERSION_BRIEF_VERSION,
    status,
    editorialQuality: editorial,
    publication: { approval: "REQUIRED", blockers: [...contract.publication.blockers] },
    productIdentity: {
      productName: contract.identity.productName,
      brand: contract.identity.brand,
      productKind: contract.identity.productKind,
      language: "en",
    },
    conversionGoal: goal,
    productCategory: contract.identity.productKind?.trim() || "unspecified",
    trafficIntent: trafficIntent(contract),
    audienceHypothesis: audienceHypothesis(contract),
    valueProposition: vp,
    primaryMessage: primary,
    keyDifferentiators: differentiators,
    customerQuestions: questions(contract, map),
    objections: objections(contract),
    benefitCandidates: benefits,
    offerStrategy: { mode, packageCount: packages.length, notes: offerNotes },
    packagePresentation: packages,
    ctaStrategy: {
      action: hop ? "AUTHORIZED_HOP" : "NONE",
      href: hop ? contract.cta.href : undefined,
      label: hop ? contract.cta.label : undefined,
      reason: hop ? "Link and policy gates allow the hop." : "No authorized commercial action.",
    },
    trustSignals: trust,
    sectionPlan: buildSectionPlan(contract),
    visualPriorities: visualPriorities(contract),
    creativeBrief: {
      compositionHint,
      narrativeShape,
      density: pageDensity(contract),
      notes: [
        {
          id: "creative-note",
          text: `Use a ${narrativeShape.replace(/_/g, " ").toLowerCase()} narrative. Do not invent missing blocks.`,
          class: "EDITORIAL_SUGGESTION",
          evidenceRefs: [],
          sourceUrl: null,
          verification: "FROM_CONTRACT",
          restriction: "INTERNAL_ONLY",
          contractPath: "presentationHints",
        },
      ],
    },
    missingEvidence: missingEvidence(contract),
    decisions,
  };
}
