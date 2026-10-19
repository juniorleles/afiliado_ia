import { documentBody } from "../src/lib/landing-composer/apply.ts";
import {
  benefitsStructurallyRequired,
  composeLandingDocument,
  hasEligibleBenefitFeatures,
} from "../src/lib/landing-composer/compose.ts";
import { presentLandingDocument } from "../src/lib/landing-composer/present.ts";
import type { LandingBlueprint } from "../src/lib/landing-blueprint/types.ts";
import { applyManualFacts, emptyProductFacts } from "../src/lib/product-facts.ts";
import type { GeneratedSections, SectionGeneration, SectionId } from "../src/lib/section-generation/types.ts";
import type { StrategyDecision } from "../src/lib/strategy-decision/decide.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function section(id: SectionId, status: SectionGeneration["status"], content: Record<string, unknown> | null, warnings: string[] = []): SectionGeneration {
  return {
    sectionId: id,
    generatedContent: content,
    reasoning: [],
    evidenceUsed: [],
    confidence: status === "GENERATED" ? 0.5 : 0,
    warnings,
    generationTime: 1,
    status,
    inputFingerprint: `${id}-a`,
    cached: false,
    scores: { copyScore: 0, readability: 0, evidenceScore: 0, persuasionScore: 0, complianceScore: 0 },
  };
}

function blueprint(enabled: string[]): LandingBlueprint {
  const ids = ["hero", "problem", "agitation", "solution", "benefits", "ingredients", "scientific-evidence", "testimonials", "comparison", "faq", "guarantee", "cta", "footer", "seo", "schema"];
  return {
    version: 1,
    campaignId: 1,
    blueprintVersion: 1,
    generatedAt: "2026-10-14T00:00:00.000Z",
    language: "en",
    strategy: { approachId: "BUYER_GUIDE", recommendedApproach: "Guia de compra", confidence: 0.4 },
    sections: ids.map((id) => ({
      id,
      type: id,
      enabled: enabled.includes(id),
      priority: 1,
      objective: "",
      evidence: [],
      tone: "",
      expectedLength: "",
      requiredFacts: [],
      requiredResearch: [],
      requiredStrategy: [],
      dependencies: [],
      generationStatus: enabled.includes(id) ? "READY" : "PENDING",
    })),
    seo: { language: "en", measuredKeywords: 0, source: null },
    schema: { plannedTypes: [], productIdentified: true },
    validation: { readySections: enabled.length, pendingSections: ids.length - enabled.length, blocking: [] },
  };
}

const decision = { approachId: "BUYER_GUIDE" } as StrategyDecision;

const factsWithFeatures = applyManualFacts(emptyProductFacts("Northwind Capsule", "https://notes.example.org/northwind"), {
  productName: "Northwind Capsule",
  sourceUrl: "https://notes.example.org/northwind",
  featuresText: "Listed on the source label.",
  ingredientsText: "northwind extract",
});

const factsWithoutFeatures = applyManualFacts(emptyProductFacts("Harbor Drops", "https://notes.example.org/harbor"), {
  productName: "Harbor Drops",
  sourceUrl: "https://notes.example.org/harbor",
  ingredientsText: "Harbor mycelium",
  cautionsText: "Keep away from children.",
  guaranteeInformation: "60-day refund",
});

assert(hasEligibleBenefitFeatures(factsWithFeatures) === true, "features elegíveis tornam benefits exigível");
assert(hasEligibleBenefitFeatures(factsWithoutFeatures) === false, "sem features elegíveis benefits não é exigível");
assert(hasEligibleBenefitFeatures(null) === false, "sem fatos benefits não é exigível");

const generated: GeneratedSections = {
  version: 1,
  campaignId: 1,
  generatedAt: "2026-10-14T00:00:00.000Z",
  averageGenerationTimeMs: 1,
  sections: [
    section("hero", "GENERATED", { headline: "Northwind Capsule", description: null, approach: "BUYER_GUIDE", audience: ["adults over 50"] }),
    section("problem", "GENERATED", { cautions: [], marketObservations: ["Stiffness was measured."] }),
    section("agitation", "FAILED", null, ["Não há desconforto medido para aprofundar."]),
    section("solution", "FAILED", null, ["A solução não está nos fatos do produto."]),
    section("benefits", "GENERATED", { fromFacts: ["Listed on the source label."], marketObservations: [] }),
    section("ingredients", "GENERATED", { names: ["northwind extract"] }),
    section("scientific-evidence", "GENERATED", { reduced: true, mentions: [{ type: "PubMed", count: 1 }], tiedToIngredient: false }),
    section("testimonials", "FAILED", null, ["Nenhum depoimento foi extraído."]),
    section("comparison", "GENERATED", { domains: 5, editorial: 5, comparisonHeadlinePercent: 0, winner: null }),
    section("faq", "GENERATED", { items: [{ question: "What is the refund policy?", answer: null }] }),
    section("guarantee", "FAILED", null, ["Garantia não está nos fatos do produto. A seção não foi gerada."]),
    section("cta", "GENERATED", { approach: "BUYER_GUIDE", triggers: ["Ausência de CTA dominante"], emotions: [], label: null }),
    section("footer", "GENERATED", { productName: "Northwind Capsule" }),
    section("seo", "GENERATED", { title: "Northwind Capsule", description: null, keywords: ["northwind review"], approach: "BUYER_GUIDE" }),
    section("schema", "GENERATED", { type: "WebPage", name: "Northwind Capsule", faq: [{ question: "What is the refund policy?", answer: null }] }),
  ],
};

assert(benefitsStructurallyRequired(factsWithFeatures, generated) === true, "com features elegíveis benefits é estruturalmente obrigatório");

const enabled = ["hero", "problem", "benefits", "ingredients", "comparison", "faq", "cta", "footer", "seo", "schema"];
const first = composeLandingDocument({
  campaignId: 1,
  blueprint: blueprint(enabled),
  generated,
  decision,
  previous: null,
  facts: factsWithFeatures,
  now: "2026-10-14T12:00:00.000Z",
});

const dumped = JSON.stringify(first);
assert(!dumped.includes("Buy Now"), "o composer não cria CTA");
assert(!dumped.includes("<"), "o documento não contém HTML");
assert(first.sections.map((item) => item.sectionId).join(",") === "hero,benefits,ingredients,cta,footer", "a ordem segue a planta de leitura");
assert(!dumped.includes("Stiffness was measured") && !dumped.includes("What is the refund policy") && !dumped.includes("adults over 50"), "observação de mercado e pergunta sem fato ficam fora");
assert(first.metadata.gates?.structural === "PASS" && first.metadata.gates.grounding === "PASS" && first.metadata.gates.publication === "HELD", "estrutura e grounding prontos não autorizam publicação");
assert(!first.sections.some((item) => item.sectionId === "guarantee" || item.sectionId === "scientific-evidence" || item.sectionId === "seo"), "garantia falha, ciência desabilitada e SEO ficam fora do corpo");
assert(first.seo?.title === "Northwind Capsule" && first.schema?.name === "Northwind Capsule", "SEO e schema entram antes do render");
assert(first.warnings.some((item) => item.includes("Garantia")), "garantia falha vira aviso e não bloqueia o resto");
assert(first.validationStatus === "PASS" && first.renderStatus === "READY", "hero, CTA, benefícios e rodapé presentes deixam a estrutura pronta");
assert(first.metadata.cached === false, "a primeira montagem não usa cache");

const emptyFaq = composeLandingDocument({
  campaignId: 1,
  blueprint: blueprint(enabled),
  generated: { ...generated, sections: generated.sections.map((item) => item.sectionId === "faq" ? section("faq", "GENERATED", { items: [] }) : item) },
  decision,
  previous: null,
  facts: factsWithFeatures,
});
assert(!emptyFaq.sections.some((item) => item.sectionId === "faq"), "FAQ sem perguntas não entra");
assert(emptyFaq.warnings.some((item) => item.includes("sem perguntas")), "FAQ vazia registra aviso");

const missing = composeLandingDocument({
  campaignId: 1,
  blueprint: blueprint(["problem", "benefits"]),
  generated,
  decision: null,
  previous: null,
  facts: factsWithFeatures,
});
assert(missing.validationStatus === "ERROR" && missing.renderStatus === "INCOMPLETE", "seção obrigatória ausente registra erro");
assert(missing.errors.includes("Hero obrigatório ausente.") && missing.errors.includes("CTA obrigatório ausente.") && missing.errors.includes("Rodapé obrigatório ausente."), "a validação cita hero, CTA e rodapé");
assert(missing.metadata.gates?.structural === "FAIL", "falta de hero/cta/footer é structural FAIL");
assert(missing.sections.some((item) => item.sectionId === "benefits"), "a landing continua com as seções que passaram");

const again = composeLandingDocument({
  campaignId: 1,
  blueprint: blueprint(enabled),
  generated,
  decision,
  previous: first,
  facts: factsWithFeatures,
});
assert(again.metadata.cached && again.metadata.compositionTimeMs === first.metadata.compositionTimeMs, "a mesma entrada reutiliza a montagem e o tempo");

const view = presentLandingDocument(first);
assert(view.ctaLabel === null, "CTA sem rótulo não entra na apresentação");
assert(!view.sections.some((item) => item.kind === "faq"), "FAQ sem resposta não entra na apresentação");
const body = documentBody(first);
assert(!body.includes("## Hero") && !body.includes("## CTA") && !body.includes("## Benefits"), "o corpo visível não usa títulos internos");

const duplicated = presentLandingDocument({
  ...first,
  sections: [
    ...first.sections.filter((item) => item.sectionId !== "benefits"),
    { sectionId: "solution", content: { statement: "The product source lists these features and ingredients. No extra mechanism was added.", features: ["Daily capsule"], ingredients: ["northwind extract"] }, warnings: [] },
    { sectionId: "benefits", content: { fromFacts: ["Daily capsule Source: product facts."] }, warnings: [] },
    { sectionId: "guarantee", content: { text: "60-day refund" }, warnings: [] },
  ],
});
assert(!duplicated.sections.some((item) => item.kind === "source"), "a solução não repete features nem frases internas");
assert(duplicated.description === "Daily capsule" && !duplicated.sections.some((item) => item.kind === "features"), "o fato neutro fica no hero e não se repete em cards");
assert(!JSON.stringify(duplicated).includes("Source: product facts") && !JSON.stringify(duplicated).includes("No extra mechanism") && !JSON.stringify(duplicated).includes("The product source lists"), "frases de auditoria ficam fora da apresentação");
assert(duplicated.sections.some((item) => item.kind === "guarantee" && item.text === "60-day refund"), "garantia autorizada permanece na apresentação");

const healthClaims = [
  "Helps reduce inflammation Source: product facts.",
  "Supports healthy cholesterol levels",
  "Supports healthy blood pressure",
  "Helps reduce triglyceride levels",
  "Supports cardiovascular health",
];
const health = presentLandingDocument({
  ...first,
  sections: [
    ...first.sections.map((item) => item.sectionId === "benefits" ? { ...item, content: { fromFacts: [...healthClaims, "Natural mushroom-based formula"] } } : item),
    { sectionId: "problem", content: { cautions: ["These statements have not been evaluated by the Food and Drug Administration. This product is not intended to diagnose, treat, cure, or prevent any disease."] }, warnings: [] },
  ],
});
assert(health.repeatsSourceHealthClaim, "claim de saúde da fonte continua sinalizado");
assert(healthClaims.every((claim) => health.omitted.some((item) => item.text === claim.replace(/ Source: product facts\.$/i, "") && item.reason.includes("sem comprovação"))), "cada claim da fonte fica fora da página com o motivo registrado");
assert(health.description === "Natural mushroom-based formula", "a característica neutra permanece no hero");
const healthVisible = JSON.stringify({ description: health.description, sections: health.sections }).toLowerCase();
assert(!/cholesterol|blood pressure|triglyceride|inflammation|cardiovascular/.test(healthVisible), "o claim não entra no conteúdo do consumidor");
assert(health.sections.some((item) => item.kind === "important" && item.items.some((line) => /not intended to diagnose/i.test(line))), "o aviso legal permanece visível");
assert(JSON.stringify(first).includes("Listed on the source label."), "omitir o claim não reescreve o documento original");

const clipped = presentLandingDocument({
  ...first,
  sections: first.sections.map((item) => item.sectionId === "hero" ? { ...item, content: { headline: "Northwind Capsule", subheadline: "Northwind Capsule is a daily capsule. The remaining words are cu…" } } : item),
});
assert(clipped.description === "Northwind Capsule is a daily capsule.", "frase completa substitui o trecho cortado");
assert(!JSON.stringify(clipped).includes("…") && !JSON.stringify(clipped).includes("remaining words"), "a apresentação não mostra palavra cortada");

const thinEnabled = ["hero", "benefits", "ingredients", "problem", "guarantee", "cta", "footer", "seo", "schema"];
const thinGenerated: GeneratedSections = {
  version: 1,
  campaignId: 2,
  generatedAt: "2026-10-15T00:00:00.000Z",
  averageGenerationTimeMs: 1,
  sections: [
    section("hero", "GENERATED", { headline: "Harbor Drops", lead: "This educational page stays with the product source." }),
    section("problem", "GENERATED", { cautions: ["Keep away from children."] }),
    section("benefits", "FAILED", null, ["Não há feature nos Product Facts. Benefício medido não autoriza o texto."]),
    section("ingredients", "GENERATED", { names: ["Harbor mycelium"] }),
    section("guarantee", "GENERATED", { text: "60-day refund" }),
    section("cta", "GENERATED", { approach: "EDUCATIONAL", text: "Continue with this educational page.", label: null }),
    section("footer", "GENERATED", { productName: "Harbor Drops" }),
    section("seo", "GENERATED", { title: "Harbor Drops", description: null, keywords: [] }),
    section("schema", "GENERATED", { type: "WebPage", name: "Harbor Drops", faq: [] }),
    section("agitation", "FAILED", null, ["x"]),
    section("solution", "FAILED", null, ["x"]),
    section("scientific-evidence", "FAILED", null, ["x"]),
    section("testimonials", "FAILED", null, ["x"]),
    section("comparison", "FAILED", null, ["x"]),
    section("faq", "FAILED", null, ["x"]),
  ],
};
assert(benefitsStructurallyRequired(factsWithoutFeatures, thinGenerated) === false, "fixture sem features não exige benefits");
const withoutFeatures = composeLandingDocument({
  campaignId: 2,
  blueprint: blueprint(thinEnabled),
  generated: thinGenerated,
  decision,
  previous: null,
  facts: factsWithoutFeatures,
  now: "2026-10-15T12:00:00.000Z",
});
assert(!withoutFeatures.sections.some((item) => item.sectionId === "benefits"), "sem features elegíveis benefits fica omitido");
assert(withoutFeatures.metadata.gates?.structural === "PASS", "structural PASS sem benefits quando não há features");
assert(withoutFeatures.metadata.gates?.grounding === "PASS", "grounding PASS quando o conteúdo presente está fundamentado");
assert(withoutFeatures.metadata.gates?.publication === "HELD", "PASS estrutural/grounding ainda não publica");
assert(!withoutFeatures.errors.some((item) => /Benefícios/i.test(item)), "ausência de benefits não vira erro estrutural sem features");

const omittedBenefits = composeLandingDocument({
  campaignId: 1,
  blueprint: blueprint(enabled),
  generated: {
    ...generated,
    sections: generated.sections.map((item) =>
      item.sectionId === "benefits"
        ? section("benefits", "FAILED", null, ["Não há feature nos Product Facts. Benefício medido não autoriza o texto."])
        : item,
    ),
  },
  decision,
  previous: null,
  facts: factsWithFeatures,
  now: "2026-10-14T13:00:00.000Z",
});
assert(omittedBenefits.metadata.gates?.structural === "FAIL", "com features elegíveis a omissão de benefits é structural FAIL");
assert(omittedBenefits.errors.includes("Benefícios obrigatório ausente."), "erro estrutural nomeia benefits");
assert(omittedBenefits.metadata.gates?.grounding !== undefined, "grounding continua avaliado à parte");

const inventedGenerated: GeneratedSections = {
  ...thinGenerated,
  sections: thinGenerated.sections.map((item) =>
    item.sectionId === "ingredients"
      ? section("ingredients", "GENERATED", { names: ["Unobtanium star dust"] })
      : item,
  ),
};
const invented = composeLandingDocument({
  campaignId: 2,
  blueprint: blueprint(thinEnabled),
  generated: inventedGenerated,
  decision,
  previous: null,
  facts: factsWithoutFeatures,
  now: "2026-10-15T13:00:00.000Z",
});
assert(invented.metadata.gates?.structural === "PASS", "conteúdo inventado não mascara structural quando hero/cta/footer existem");
assert(invented.metadata.gates?.grounding === "FAIL", "conteúdo inventado resulta em grounding FAIL");
assert(invented.metadata.gates?.publication === "BLOCKED", "grounding FAIL bloqueia o gate de publicação do documento");

console.log("test-landing-composer: ok");
