import type { ProductContract } from "@/lib/product-contract/types";
import type { AiCommercialCopyDraft } from "@/lib/lp-generator/ai-copy/types";
import { isIntentAlignedHeadline } from "@/lib/search-intent/headline";

export type GroundingClass =
  | "FACTUAL_CLAIM"
  | "SUPPORTED_PARAPHRASE"
  | "UNSUPPORTED_CLAIM"
  | "EDITORIAL_LABEL"
  | "GENERIC_NONFACTUAL_COPY";

export type CopyFieldRole = "SECTION_HEADLINE" | "FACTUAL_BODY" | "CTA_MICROCOPY";

export type TextGrounding = {
  path: string;
  text: string;
  role: CopyFieldRole;
  classification: GroundingClass;
  allowed: boolean;
  evidence: string[];
  reason: string;
};

const POLICY =
  /clinically proven|scientifically proven|doctors worldwide|verified buyer|★★|testimonial|limited time|%\s*off|best greens|immune support complex|erases wrinkles|never needs charging|recommended by doctors|guaranteed results/i;

const MEDICAL_PROMISE =
  /\b(clinically|scientifically)\s+(proven|tested|shown)|cures?\b|heals?\b|diagnos|\bdoctors? worldwide|\berases? wrinkles|\bprevents?\b|\breverses?\b|\btreats?\b/i;

const RESULT_PROMISE =
  /\b(boosts? your|improves? your|guarantees? (results?|weight)|melts? fat|burns? fat|clinically researched)\b/i;

const COMMERCIAL_INVENTION =
  /\$\s*\d|\b\d+\s*%\s*off\b|\blimited time\b|\bact now\b|\bonly today\b|\bbuy now\b|\bfree shipping\b|\bbest value\b|\bcertif(?:ied|ication)\b|\bfda[- ]approved\b|\bgmp certified\b/i;

const CLAIM_VERBS =
  /\b(cures?|treats?|heals?|prevents?|reverses?|boosts?|improves?|guarantees?|clinically|scientifically|certified|proven|#1|number one)\b/i;

const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "as", "at", "by", "for",
  "from", "in", "into", "of", "on", "to", "with", "and", "or", "but", "not", "nor", "so", "if",
  "then", "than", "that", "this", "these", "those", "it", "its", "they", "them", "we", "our",
  "you", "your", "presented", "below", "follow", "see", "please", "also", "including", "using",
  "used", "their", "has", "have", "had", "will", "can", "may", "more", "some", "any", "each",
  "every", "several", "about", "over", "under", "after", "before", "between", "through", "via",
  "per", "such", "other", "same", "both", "all", "own", "just", "only", "very", "here", "there",
  "made", "make", "making",
]);

const EDITORIAL_HEADINGS = new Set([
  "product at a glance",
  "at a glance",
  "overview",
  "details",
  "specifications",
  "ingredients",
  "components",
  "features",
  "key characteristics",
  "key features",
  "frequently asked questions",
  "faq",
  "questions",
  "legal",
  "usage",
  "legal and usage",
  "how to use",
  "how to apply",
  "how it works",
  "directions for use",
  "cautions",
  "returns and shipping",
  "disclosure",
  "next step",
  "packages",
  "guarantee",
  "what it is",
  "what the source states",
  "seller-stated claims",
  "product image",
  "questions the source answered",
  "returns, shipping and cautions",
  "more information",
  "about this product",
  "presentation",
  "benefits",
  "ingredients and usage",
  "product details",
  "product overview",
  "product overview and ingredients",
  "product overview and specifications",
  "product details and ingredients",
  "product details and specifications",
  "product details ingredients and official offer",
  "product details specifications and official offer",
  "product information",
]);

const EDITORIAL_HEADING_KEYS = new Set([...EDITORIAL_HEADINGS].map((item) => headingKey(item)));

const GENERIC_CONNECTIVE =
  /^(follow( the)? (the )?(manufacturer[- ]?)?recommended usage( below)?\.?|see( the)? (details|usage|directions) below\.?|preview only( —|-)? no purchase action available\.?|no authorized purchase link is available\.?|read on\.?|continue below\.?)$/i;

type EvidenceIndex = {
  literals: Set<string>;
  tokens: Set<string>;
  corpus: string;
  name: string;
  kind: string;
  classes: Set<string>;
  hasUsage: boolean;
  hasComponents: boolean;
  hasPackages: boolean;
  componentCount: number;
};

export function fieldRole(path: string): CopyFieldRole {
  if (/^sections\[\d+\]\.headline$/.test(path) || path.startsWith("sectionHeadlines.")) return "SECTION_HEADLINE";
  if (path === "cta.label" || path === "cta.caption" || path === "ctaMicrocopy" || path === "closing") return "CTA_MICROCOPY";
  return "FACTUAL_BODY";
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[—–]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((item) => (item.length >= 3 || /^\d+$/.test(item)) && !STOP.has(item));
}

function remember(set: Set<string>, text: string | undefined): void {
  if (text?.trim()) set.add(text.trim());
}

export function contractLiterals(contract: ProductContract): Set<string> {
  const texts = new Set<string>();
  remember(texts, contract.identity.productName);
  remember(texts, contract.identity.brand);
  remember(texts, contract.identity.productKind);
  remember(texts, contract.valueProposition?.headline?.text);
  (contract.valueProposition?.supporting ?? []).forEach((item) => remember(texts, item.text));
  remember(texts, contract.description?.text);
  (contract.features ?? []).forEach((item) => remember(texts, item.text));
  (contract.benefits ?? []).forEach((item) => remember(texts, item.text));
  (contract.specifications ?? []).forEach((item) => {
    remember(texts, item.name);
    remember(texts, item.value);
    remember(texts, item.unit);
    remember(texts, `${item.name}: ${item.value}`);
  });
  (contract.components ?? []).forEach((item) => remember(texts, item.name));
  (contract.usage ?? []).forEach((item) => remember(texts, item.text));
  (contract.cautions ?? []).forEach((item) => remember(texts, item.text));
  (contract.offer?.packages ?? []).forEach((item) => {
    remember(texts, item.label);
    remember(texts, item.totalPrice);
    remember(texts, item.unitPrice);
    remember(texts, item.quantity?.text);
  });
  remember(texts, contract.guarantee?.text);
  (contract.operational?.returns ?? []).forEach((item) => remember(texts, item.statement));
  (contract.operational?.shipping ?? []).forEach((item) => remember(texts, item.statement));
  (contract.faq ?? []).forEach((item) => {
    remember(texts, item.question);
    remember(texts, item.answer);
  });
  remember(texts, contract.cta.label);
  remember(texts, contract.legal.affiliateDisclosure);
  remember(texts, contract.legal.healthDisclaimer);
  return texts;
}

function inferredClasses(contract: ProductContract): Set<string> {
  const classes = new Set<string>();
  const blob = [
    contract.identity.productKind,
    ...(contract.features ?? []).map((item) => item.text),
    ...(contract.components ?? []).map((item) => item.name),
    ...(contract.usage ?? []).map((item) => item.text),
    ...(contract.specifications ?? []).map((item) => `${item.name} ${item.value}`),
  ]
    .join(" ")
    .toLowerCase();

  if (/lactobacillus|bifidobacterium|saccharomyces|bacillus coagulans|\bprobiotic/.test(blob)) {
    classes.add("probiotic");
    classes.add("strain");
  }
  if (/\bextract\b|leaf|root|bark|berry|herb|flower|seed|botanical/.test(blob)) {
    classes.add("botanical");
    classes.add("plant");
    if (/\bextract/.test(blob)) classes.add("extract");
  }
  if (/\bcapsule/.test(blob)) classes.add("capsule");
  if (/\b(daily|every morning|each day|once a day|every day)\b/.test(blob)) classes.add("daily");
  if (/\b(one capsule|1 capsule|single capsule)\b/.test(blob)) {
    classes.add("single");
    classes.add("capsule");
  }
  if (/\b(supplement|formula|cream|serum|balm)\b/.test(blob)) classes.add("formula");
  if ((contract.components ?? []).length >= 2) {
    classes.add("blend");
    classes.add("combination");
    classes.add("combines");
  }
  if ((contract.usage ?? []).length > 0) {
    classes.add("usage");
    classes.add("recommended");
    classes.add("routine");
  }
  return classes;
}

export function buildEvidenceIndex(contract: ProductContract): EvidenceIndex {
  const literals = contractLiterals(contract);
  const tokens = new Set<string>();
  for (const text of literals) {
    for (const token of tokensOf(text)) tokens.add(token);
  }
  const nameTokens = tokensOf(contract.identity.productName);
  nameTokens.forEach((token) => tokens.add(token));
  return {
    literals,
    tokens,
    corpus: [...literals].join(" ").toLowerCase(),
    name: contract.identity.productName,
    kind: contract.identity.productKind ?? "",
    classes: inferredClasses(contract),
    hasUsage: (contract.usage ?? []).length > 0,
    hasComponents: (contract.components ?? []).length > 0,
    hasPackages: (contract.offer?.packages ?? []).length > 0,
    componentCount: (contract.components ?? []).length,
  };
}

function headingKey(text: string): string {
  return normalize(text).replace(/:+$/, "");
}

export function isEditorialLabel(text: string, productName: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (POLICY.test(trimmed) || MEDICAL_PROMISE.test(trimmed) || COMMERCIAL_INVENTION.test(trimmed) || CLAIM_VERBS.test(trimmed)) {
    return false;
  }
  if (/\d/.test(trimmed) || /\$/.test(trimmed)) return false;
  const withoutName = trimmed.replace(new RegExp(escapeReg(productName), "ig"), " ").trim();
  const key = headingKey(withoutName || trimmed);
  if (!key) return true;
  return EDITORIAL_HEADINGS.has(key) || EDITORIAL_HEADING_KEYS.has(key);
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literalMatch(text: string, index: EvidenceIndex): boolean {
  const trimmed = text.trim();
  if (index.literals.has(trimmed)) return true;
  const lower = new Set([...index.literals].map((item) => item.toLowerCase()));
  if (lower.has(trimmed.toLowerCase())) return true;
  if (index.name && trimmed === index.name) return true;
  if (index.name && index.kind && new RegExp(`^${escapeReg(index.name)} is an? ${escapeReg(index.kind)}\\.?$`, "i").test(trimmed)) {
    return true;
  }
  return false;
}

function tokenSupported(token: string, index: EvidenceIndex): boolean {
  if (index.tokens.has(token)) return true;
  if (token.endsWith("s") && index.tokens.has(token.slice(0, -1))) return true;
  if (index.tokens.has(`${token}s`)) return true;
  if (index.classes.has(token)) return true;
  if (token === "ingredients" && index.hasComponents) return true;
  if (token === "ingredient" && index.hasComponents) return true;
  if (token === "manufacturer" && index.hasUsage) return true;
  if (token === "contain" || token === "contains") return index.hasComponents;
  if (token === "daily" && index.classes.has("daily")) return true;
  if (token === "formula" && index.classes.has("formula")) return true;
  if (token === "probiotic" || token === "probiotics") return index.classes.has("probiotic");
  if (token === "botanical" || token === "botanicals") return index.classes.has("botanical");
  if (token === "extract" || token === "extracts") return index.classes.has("extract") || index.classes.has("botanical");
  if (token === "strain" || token === "strains") return index.classes.has("strain");
  if (token === "capsule" || token === "capsules") return index.classes.has("capsule");
  if (token === "blend" || token === "blends") return index.classes.has("blend");
  if (token === "combine" || token === "combines" || token === "combination") return index.classes.has("combines");
  if (token === "single") return index.classes.has("single");
  if (token === "routine") return index.classes.has("routine");
  if (token === "supplement" || token === "supplements") {
    return /\bsupplement/.test(index.kind.toLowerCase()) || index.tokens.has("supplement") || index.tokens.has("dietary");
  }
  if (token === "dietary") return index.tokens.has("dietary") || /\bdietary/.test(index.kind.toLowerCase());
  return false;
}

function unsupportedTokens(text: string, index: EvidenceIndex): string[] {
  return tokensOf(text).filter((token) => !tokenSupported(token, index) && token !== normalize(index.name));
}

function inventedCommercial(text: string, index: EvidenceIndex): boolean {
  if (!COMMERCIAL_INVENTION.test(text)) return false;
  if (index.hasPackages && /\$|\d+\.\d{2}/.test(text) && /\$|\d/.test(index.corpus)) {
    const prices = index.corpus.match(/\$\s*\d+(?:\.\d+)?/g) ?? [];
    const mentioned = text.match(/\$\s*\d+(?:\.\d+)?/g) ?? [];
    return mentioned.some((item) => !prices.some((price) => normalize(price) === normalize(item)));
  }
  return true;
}

export function classifyCopyText(input: {
  text: string;
  path: string;
  contract: ProductContract;
  index?: EvidenceIndex;
}): TextGrounding {
  const text = input.text.trim();
  const path = input.path;
  const role = fieldRole(path);
  const index = input.index ?? buildEvidenceIndex(input.contract);
  const base = { path, text, role, evidence: [] as string[] };

  if (!text) {
    return { ...base, classification: "UNSUPPORTED_CLAIM", allowed: false, reason: "empty text" };
  }
  if (POLICY.test(text) || MEDICAL_PROMISE.test(text) || RESULT_PROMISE.test(text)) {
    return { ...base, classification: "UNSUPPORTED_CLAIM", allowed: false, reason: "medical or commercial promise is not allowed" };
  }
  if (inventedCommercial(text, index)) {
    return { ...base, classification: "UNSUPPORTED_CLAIM", allowed: false, reason: "price, offer, scarcity or certification is not in the contract" };
  }

  if (role === "SECTION_HEADLINE" && isEditorialLabel(text, index.name)) {
    return { ...base, classification: "EDITORIAL_LABEL", allowed: true, evidence: ["editorial-label"], reason: "neutral section label with no product claim" };
  }
  if (path === "headline" && isIntentAlignedHeadline(text, input.contract)) {
    return { ...base, classification: "EDITORIAL_LABEL", allowed: true, evidence: ["intent-headline"], reason: "intent-aligned headline restates the product name with a neutral suffix" };
  }
  if (role === "CTA_MICROCOPY" && GENERIC_CONNECTIVE.test(text)) {
    return { ...base, classification: "GENERIC_NONFACTUAL_COPY", allowed: true, evidence: ["cta"], reason: "nonfactual preview or navigation copy" };
  }
  if (GENERIC_CONNECTIVE.test(text) && (role === "FACTUAL_BODY" || role === "CTA_MICROCOPY")) {
    return { ...base, classification: "GENERIC_NONFACTUAL_COPY", allowed: true, evidence: index.hasUsage ? ["usage"] : [], reason: "connective copy that does not add a product fact" };
  }
  if (literalMatch(text, index)) {
    return { ...base, classification: "FACTUAL_CLAIM", allowed: true, evidence: ["contract-literal"], reason: "exact contract statement" };
  }

  const missing = unsupportedTokens(text, index);
  if (missing.length === 0 && tokensOf(text).length > 0) {
    const evidence = [...index.classes].filter((item) => normalize(text).includes(item));
    return {
      ...base,
      classification: "SUPPORTED_PARAPHRASE",
      allowed: true,
      evidence: evidence.length ? evidence : ["contract-paraphrase"],
      reason: "every content token is supported by structured evidence",
    };
  }

  return {
    ...base,
    classification: "UNSUPPORTED_CLAIM",
    allowed: false,
    evidence: missing,
    reason: `unsupported tokens: ${missing.join(", ")}`,
  };
}

export function classifyDraft(draft: AiCommercialCopyDraft, contract: ProductContract): TextGrounding[] {
  const index = buildEvidenceIndex(contract);
  const rows: TextGrounding[] = [
    classifyCopyText({ text: draft.headline, path: "headline", contract, index }),
    classifyCopyText({ text: draft.introduction, path: "introduction", contract, index }),
  ];
  if (draft.subheadline) rows.push(classifyCopyText({ text: draft.subheadline, path: "subheadline", contract, index }));
  for (const [key, value] of Object.entries(draft.sectionHeadlines)) {
    rows.push(classifyCopyText({ text: value, path: `sectionHeadlines.${key}`, contract, index }));
  }
  draft.features.forEach((text, i) => rows.push(classifyCopyText({ text, path: `features[${i}]`, contract, index })));
  draft.benefitExplanations.forEach((text, i) => rows.push(classifyCopyText({ text, path: `benefitExplanations[${i}]`, contract, index })));
  draft.faq.forEach((item, i) => {
    rows.push(classifyCopyText({ text: item.question, path: `faq[${i}].question`, contract, index }));
    rows.push(classifyCopyText({ text: item.answer, path: `faq[${i}].answer`, contract, index }));
  });
  if (draft.ctaMicrocopy) rows.push(classifyCopyText({ text: draft.ctaMicrocopy, path: "ctaMicrocopy", contract, index }));
  (draft.transitions ?? []).forEach((text, i) => rows.push(classifyCopyText({ text, path: `transitions[${i}]`, contract, index })));
  return rows;
}

export function appliedDraftPaths(sectionTypes: string[]): Set<string> {
  const paths = new Set(["headline", "subheadline", "introduction"]);
  for (const type of sectionTypes) paths.add(`sectionHeadlines.${type}`);
  paths.add("faq[0].question");
  paths.add("faq[0].answer");
  if (sectionTypes.includes("differentiators") || sectionTypes.includes("benefits")) {
    paths.add("features[0]");
    paths.add("features[1]");
  }
  return paths;
}
