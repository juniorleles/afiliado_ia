import { priceHasCommercialContext } from "@/lib/product-showcase/adaptive-plan";
import { isContactFragment, type EditorialDocument } from "@/lib/product-showcase/editorial";
import { isConsumerHealthClaim } from "@/lib/landing-composer/present";
import {
  copyEligibleOperationalItems,
  copyEligibleScalar,
  hasContactDetail,
  isCopyEligibleConfidence,
  type FactConfidence,
  type ProductFacts,
} from "@/lib/product-facts";

/**
 * Editorial diagnosis for operators.
 * Product Facts remain the only copy authority.
 * Market research can explain a gap. It cannot authorize a claim.
 */

export type EditorialDisposition =
  | "AVAILABLE_AND_USED"
  | "AVAILABLE_BUT_DISCARDED"
  | "NOT_RESEARCHED"
  | "NOT_FOUND"
  | "INELIGIBLE"
  | "UNVERIFIED";

export type EditorialDepth = "RICH" | "ADEQUATE" | "LIMITED" | "INSUFFICIENT";

export type EditorialRecord = {
  topic: string;
  text: string;
  disposition: EditorialDisposition;
  reason: string;
};

export type EditorialPipelineContext = {
  researchPresent: boolean;
  researchStatus: string | null;
  researchSourceCount: number;
  analysisPresent: boolean;
  observedBenefits: string[];
  observedClaims: string[];
  scientificTopics: string[];
  strategyPresent: boolean;
  strategyApproach: string | null;
  blueprintBlocking: string[];
};

export type EditorialIntelligenceReport = {
  depth: EditorialDepth;
  insufficiency: string[];
  used: EditorialRecord[];
  discarded: EditorialRecord[];
  gaps: EditorialRecord[];
  records: EditorialRecord[];
};

const FIXED_LINE = /^(?:declared by the product source|\d+ ingredients)$/i;

export function emptyPipeline(): EditorialPipelineContext {
  return {
    researchPresent: false,
    researchStatus: null,
    researchSourceCount: 0,
    analysisPresent: false,
    observedBenefits: [],
    observedClaims: [],
    scientificTopics: [],
    strategyPresent: false,
    strategyApproach: null,
    blueprintBlocking: [],
  };
}

function keyOf(value: string): string {
  return value.toLowerCase().replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
}

function clip(value: string): string {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function usedKeys(document: EditorialDocument): Set<string> {
  const keys = new Set<string>();
  for (const block of document.blocks) {
    for (const trace of block.trace) keys.add(`${trace.field}:${keyOf(trace.text)}`);
    for (const line of [...block.paragraphs, ...block.items]) keys.add(`line:${keyOf(line)}`);
  }
  return keys;
}

function isUsed(keys: Set<string>, field: string, text: string): boolean {
  const key = keyOf(text);
  return keys.has(`${field}:${key}`) || keys.has(`line:${key}`);
}

function topicFor(field: string): string {
  if (field === "productName" || field === "manufacturer" || field === "description") return "identity";
  if (field === "features") return "proposition";
  if (field === "productFormat") return "format";
  if (field === "ingredientsOrComponents" || field === "ingredientContext") return "composition";
  if (field === "usageInformation") return "usage";
  if (field === "pricingInformation" || field === "offerFacts" || field === "shippingInformation") return "offer";
  if (field === "guaranteeInformation" || field === "returnsInformation") return "guarantee";
  if (field === "cautions") return "limitation";
  return field;
}

function push(records: EditorialRecord[], topic: string, text: string, disposition: EditorialDisposition, reason: string) {
  const clean = clip(text);
  if (!clean) return;
  const key = `${disposition}:${keyOf(clean)}:${reason}`;
  if (records.some((item) => `${item.disposition}:${keyOf(item.text)}:${item.reason}` === key)) return;
  records.push({ topic, text: clean, disposition, reason });
}

function classifyLine(
  records: EditorialRecord[],
  keys: Set<string>,
  field: string,
  text: string,
  confidence: FactConfidence | null,
  seen: Set<string>,
) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  const topic = topicFor(field);
  const signature = keyOf(clean);
  if (field === "productName") {
    push(records, topic, clean, "AVAILABLE_AND_USED", "Nome do produto, sem alegação adicional.");
    return;
  }
  if (confidence === "NOT_FOUND") {
    push(records, topic, clean, "NOT_FOUND", "O campo foi procurado e não está na fonte.");
    return;
  }
  if (confidence && !isCopyEligibleConfidence(confidence)) {
    push(records, topic, clean, "INELIGIBLE", `Confiança ${confidence} não autoriza cópia.`);
    return;
  }
  if (seen.has(signature)) {
    push(records, topic, clean, "AVAILABLE_BUT_DISCARDED", "Repetição do mesmo fato.");
    return;
  }
  seen.add(signature);
  if (hasContactDetail(clean) || (field === "manufacturer" && isContactFragment(clean))) {
    push(records, topic, "contato do fabricante", "INELIGIBLE", "Contato fica só como evidência.");
    return;
  }
  if (isConsumerHealthClaim(clean)) {
    push(records, topic, clean, "INELIGIBLE", "Alegação do vendedor, sem comprovação independente.");
    return;
  }
  if (field === "pricingInformation" && !priceHasCommercialContext(clean)) {
    push(records, topic, clean, "AVAILABLE_BUT_DISCARDED", "PRICE_CONTEXT_INSUFFICIENT");
    return;
  }
  if (isUsed(keys, field, clean)) {
    push(records, topic, clean, "AVAILABLE_AND_USED", "Entra na narrativa com rastro no fato.");
    return;
  }
  push(records, topic, clean, "AVAILABLE_BUT_DISCARDED", "Elegível, mas não entrou em nenhum bloco.");
}

function manufacturerLines(facts: ProductFacts): string[] {
  const value = copyEligibleScalar(facts.manufacturer, facts.confidence.manufacturer);
  if (!value.trim()) return [];
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

export function assessEditorialIntelligence(input: {
  facts: ProductFacts | null;
  document: EditorialDocument;
  pipeline?: EditorialPipelineContext;
}): EditorialIntelligenceReport {
  const records: EditorialRecord[] = [];
  const facts = input.facts;
  const keys = usedKeys(input.document);
  const seen = new Set<string>();
  const pipeline = input.pipeline ?? emptyPipeline();

  if (facts) {
    const name = facts.productName.trim();
    if (name) classifyLine(records, keys, "productName", name, facts.confidence.productName, seen);

    const scalars: Array<["description" | "pricingInformation" | "guaranteeInformation", string | undefined]> = [
      ["description", facts.description],
      ["pricingInformation", facts.pricingInformation],
      ["guaranteeInformation", facts.guaranteeInformation],
    ];
    for (const [field, value] of scalars) {
      const stored = (value ?? "").trim();
      if (!stored && facts.confidence[field] === "NOT_FOUND") {
        push(records, topicFor(field), field, "NOT_FOUND", "O campo foi procurado e não está na fonte.");
        continue;
      }
      if (stored) classifyLine(records, keys, field, stored, facts.confidence[field], seen);
    }

    for (const line of manufacturerLines(facts)) {
      classifyLine(records, keys, "manufacturer", line, facts.confidence.manufacturer, seen);
    }
    if (!facts.manufacturer?.trim() && facts.confidence.manufacturer === "NOT_FOUND") {
      push(records, "identity", "manufacturer", "NOT_FOUND", "O campo foi procurado e não está na fonte.");
    }

    const lists: Array<["features" | "ingredientsOrComponents" | "usageInformation" | "cautions", string[]]> = [
      ["features", facts.features],
      ["ingredientsOrComponents", facts.ingredientsOrComponents],
      ["usageInformation", facts.usageInformation],
      ["cautions", facts.cautions],
    ];
    for (const [field, values] of lists) {
      const stored = values.map((item) => item.trim()).filter(Boolean);
      if (stored.length === 0 && facts.confidence[field] === "NOT_FOUND") {
        push(records, topicFor(field), field, "NOT_FOUND", "O campo foi procurado e não está na fonte.");
        continue;
      }
      for (const line of stored) classifyLine(records, keys, field, line, facts.confidence[field], seen);
    }

    const format = facts.productFormat;
    if (format?.statement.trim()) {
      const eligible = copyEligibleOperationalItems(facts).some((item) => item.field === "productFormat");
      if (!eligible) push(records, "format", format.statement, "INELIGIBLE", "Formato armazenado sem elegibilidade de cópia.");
      else classifyLine(records, keys, "productFormat", format.statement, format.provenance, seen);
    }

    for (const item of facts.returnsInformation ?? []) {
      classifyLine(records, keys, "returnsInformation", item.statement, item.provenance, seen);
    }
    for (const item of facts.shippingInformation ?? []) {
      classifyLine(records, keys, "shippingInformation", item.statement, item.provenance, seen);
    }
    for (const item of facts.ingredientContext ?? []) {
      const eligible = item.copyEligibility === "YES" && item.kind === "NEUTRAL_CONTEXT" && isCopyEligibleConfidence(item.provenance);
      if (!eligible || isConsumerHealthClaim(item.statement)) {
        push(records, "composition", item.statement, "INELIGIBLE", "Contexto do vendedor sobre o ingrediente, sem elegibilidade.");
        continue;
      }
      classifyLine(records, keys, "ingredientContext", item.statement, item.provenance, seen);
    }
    for (const offer of facts.offerFacts ?? []) {
      const amounts = [offer.totalPrice, offer.unitPrice].map((item) => item?.trim() ?? "").filter((item) => item.length > 1);
      const covered = amounts.length > 0 && amounts.every((amount) => input.document.blocks.some((block) =>
        [...block.paragraphs, ...block.items].join(" ").includes(amount),
      ));
      if (covered) push(records, "offer", `${offer.packageName} ${amounts.join(" ")}`.trim(), "AVAILABLE_AND_USED", "Os valores já estão na declaração de preço.");
      else if (amounts.length > 0) push(records, "offer", `${offer.packageName} ${amounts.join(" ")}`.trim(), "AVAILABLE_BUT_DISCARDED", "Oferta elegível fora da declaração de preço.");
      for (const promo of [offer.savings, offer.bonuses, offer.popularityLabel]) {
        if (promo?.trim()) push(records, "offer", promo, "INELIGIBLE", "Rótulo promocional do vendedor, sem virar desconto.");
      }
    }

    for (const trace of input.document.blocks.flatMap((block) => block.trace)) {
      if (trace.field === "affiliateDisclosure" || trace.field === "healthDisclaimer") continue;
      if (FIXED_LINE.test(trace.text)) continue;
      if (!records.some((item) => item.disposition === "AVAILABLE_AND_USED" && keyOf(item.text) === keyOf(trace.text))) {
        push(records, topicFor(trace.field), trace.text, "AVAILABLE_AND_USED", "Entra na narrativa com rastro no fato.");
      }
    }
  }

  if (!pipeline.researchPresent) {
    push(records, "research", "market research", "NOT_RESEARCHED", "Pesquisa de mercado não foi executada.");
  } else if (pipeline.researchSourceCount > 0 && records.some((item) => item.disposition === "NOT_FOUND")) {
    push(records, "research", `pesquisa ${pipeline.researchStatus ?? "registrada"}`, "UNVERIFIED", "A pesquisa existe, mas não produziu fatos verificáveis para os campos ausentes.");
  }
  if (!pipeline.analysisPresent) {
    push(records, "research", "market intelligence", "NOT_RESEARCHED", "Análise de mercado não foi executada.");
  }
  for (const benefit of pipeline.observedBenefits) {
    push(records, "research", benefit, "UNVERIFIED", "Benefício observado no mercado. Não é fato do produto.");
  }
  for (const claim of pipeline.observedClaims) {
    push(records, "research", claim, "UNVERIFIED", "Alegação observada no mercado. Não é fato do produto.");
  }
  for (const topic of pipeline.scientificTopics) {
    push(records, "research", topic, "UNVERIFIED", "Tema científico observado. Não autoriza autoridade científica.");
  }
  if (pipeline.strategyPresent) {
    push(records, "strategy", pipeline.strategyApproach ?? "strategy", "UNVERIFIED", "A decisão de estratégia orienta a estrutura e não autoriza alegações.");
  }
  for (const blocking of pipeline.blueprintBlocking) {
    const needsResearch = /marketintelligence|marketresearch/i.test(blocking);
    push(records, "blueprint", blocking, needsResearch ? "NOT_RESEARCHED" : "NOT_FOUND", needsResearch
      ? "A seção do blueprint depende de pesquisa que não é fato."
      : "A seção do blueprint está bloqueada por um fato ausente.");
  }

  const used = records.filter((item) => item.disposition === "AVAILABLE_AND_USED" && !FIXED_LINE.test(item.text));
  const discarded = records.filter((item) => item.disposition === "AVAILABLE_BUT_DISCARDED" || item.disposition === "INELIGIBLE");
  const gaps = records.filter((item) => item.disposition === "NOT_RESEARCHED" || item.disposition === "NOT_FOUND" || item.disposition === "UNVERIFIED");
  const depth = measureDepth(used);
  return {
    depth: depth.depth,
    insufficiency: depth.reasons,
    used,
    discarded,
    gaps,
    records,
  };
}

function measureDepth(used: EditorialRecord[]): { depth: EditorialDepth; reasons: string[] } {
  const unique = new Map<string, EditorialRecord>();
  for (const item of used) {
    if (item.topic === "research" || item.topic === "strategy" || item.topic === "blueprint") continue;
    if (item.reason.startsWith("Os valores já estão")) continue;
    const key = keyOf(item.text);
    if (!unique.has(key)) unique.set(key, item);
  }
  const topics = new Set([...unique.values()].map((item) => item.topic));
  const quantity = unique.size;
  const diversity = topics.size;
  if (quantity <= 1) {
    return {
      depth: "INSUFFICIENT",
      reasons: ["EDITORIAL_DEPTH_INSUFFICIENT", "Os fatos elegíveis não cobrem uma narrativa útil além da identidade."],
    };
  }
  if (diversity >= 5 && quantity >= 8) return { depth: "RICH", reasons: [] };
  if ((diversity >= 3 && quantity >= 5) || (diversity >= 2 && quantity >= 4)) return { depth: "ADEQUATE", reasons: [] };
  return {
    depth: "LIMITED",
    reasons: ["A diversidade de tópicos elegíveis é baixa. A ausência de benefício médico não entra nessa conta."],
  };
}

export function consumerText(document: EditorialDocument): string[] {
  return document.blocks.flatMap((block) => [block.heading, ...block.paragraphs, ...block.items]);
}

export function documentUsesOnlyFacts(document: EditorialDocument, facts: ProductFacts, fixed: string[]): boolean {
  const allowed = JSON.stringify(facts);
  for (const block of document.blocks) {
    for (const line of [...block.paragraphs, ...block.items]) {
      if (FIXED_LINE.test(line) || fixed.includes(line)) continue;
      if (block.id === "introduction" && line === facts.productName.trim()) continue;
      const traced = block.trace.some((trace) => line === trace.text || line.endsWith(trace.text) || line.startsWith(`${trace.text} —`));
      if (!traced) return false;
      if (block.trace.filter((trace) => line.includes(trace.text)).some((trace) => !allowed.includes(trace.text) && !fixed.includes(trace.text))) return false;
    }
  }
  return true;
}
