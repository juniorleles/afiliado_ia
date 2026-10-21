/**
 * LP Quality Gate. Does not publish, deploy, or change Product Facts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { emptyProductFacts, type ProductFacts, type ProductFormatFact } from "../src/lib/product-facts.ts";
import { buildAdaptivePlan } from "../src/lib/product-showcase/adaptive-plan.ts";
import { buildEditorialDocument } from "../src/lib/product-showcase/editorial.ts";
import { evaluateStoredCampaign } from "../src/lib/product-showcase/quality-campaign.ts";
import { evaluateLpQuality, type LpQualityInput, type LpQualityReport, type QualityEvidence } from "../src/lib/product-showcase/quality-gate.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

function facts(name: string): ProductFacts {
  return emptyProductFacts(name, "https://example.test/product", "IMPORTED");
}

function allow(base: ProductFacts, field: "description" | "features" | "ingredientsOrComponents" | "usageInformation" | "pricingInformation" | "guaranteeInformation"): ProductFacts {
  base.confidence[field] = "DIRECT_SOURCE";
  return base;
}

function formatFact(value: string, statement: string): ProductFormatFact {
  return {
    value,
    statement,
    provenance: "DIRECT_SOURCE",
    copyEligibility: "YES",
    policyFindings: [],
    sourceUrl: "https://example.test/product",
    sourcePageCategory: "PRODUCT_DETAILS",
  };
}

const disclosure = "Disclosure: I may earn a commission if you purchase through links on this page.";

function fullEvidence(): QualityEvidence {
  return {
    humanReview: "ACCEPTED",
    humanReviewNote: "Fixture review accepted for the synthetic page only.",
    viewports: [
      { width: 1440, overflow: false, file: "fixture-desktop-1440.png" },
      { width: 768, overflow: false, file: "fixture-tablet-768.png" },
      { width: 390, overflow: false, file: "fixture-mobile-390.png" },
    ],
    lighthouse: null,
    dom: {
      route: "/visual-frame/fixture",
      matchesSelectedTemplate: true,
      h1Count: 1,
      adminChrome: false,
      technicalCopy: false,
      emptyMedia: false,
      demoAsset: false,
      hero: "image",
      ingredientDepth: "names",
      ctaCount: 1,
      imagesWithoutAlt: 0,
      navLabel: "On this page",
      navLabels: ["Ingredients", "Format", "Use", "Guarantee"],
      minControlHeight: 44,
    },
  };
}

function documentFor(source: ProductFacts, ppc: LpQualityInput["ppc"]) {
  const plan = buildAdaptivePlan({
    facts: source,
    approvedPackshot: { src: "/media/product/northwind.png", alt: "Northwind Capsule product image" },
    cta: { href: "https://hop.example/northwind", label: "See offer" },
    ppc,
  });
  const editorial = buildEditorialDocument({ facts: source, plan, affiliateDisclosure: disclosure });
  return { plan, editorial };
}

function evaluateFacts(source: ProductFacts, extra: Partial<LpQualityInput> = {}) {
  const built = documentFor(source, extra.ppc === undefined ? { brandPpc: "ALLOWED", genericSearchPpc: "ALLOWED" } : extra.ppc);
  return evaluateLpQuality({
    facts: source,
    plan: built.plan,
    editorial: built.editorial,
    structuralGate: "PASS",
    policyGate: "PASS",
    presentationTemplate: "PRODUCT_SHOWCASE_PREMIUM_V1",
    ppc: { brandPpc: "ALLOWED", genericSearchPpc: "ALLOWED" },
    directCheckoutLinking: "ALLOWED",
    evidence: fullEvidence(),
    ...extra,
  });
}

const completeFacts = facts("Northwind Capsule");
allow(completeFacts, "description").description = "A daily capsule.";
allow(completeFacts, "features").features = ["Bottle of 30"];
allow(completeFacts, "ingredientsOrComponents").ingredientsOrComponents = ["Northpetal", "Ambergill"];
allow(completeFacts, "usageInformation").usageInformation = ["Take one capsule with water"];
allow(completeFacts, "pricingInformation").pricingInformation = "One bottle for USD 49";
allow(completeFacts, "guaranteeInformation").guaranteeInformation = "60-day refund";
completeFacts.productFormat = formatFact("capsule", "Once-daily capsule");
const complete = evaluateFacts(completeFacts);

const insufficientFacts = facts("Blank Product");
const insufficientBuilt = buildAdaptivePlan({ facts: insufficientFacts });
const insufficient = evaluateLpQuality({
  facts: insufficientFacts,
  plan: insufficientBuilt,
  editorial: buildEditorialDocument({ facts: insufficientFacts, plan: insufficientBuilt, affiliateDisclosure: disclosure }),
  structuralGate: "PASS",
  policyGate: "PASS",
  presentationTemplate: "PRODUCT_SHOWCASE_PREMIUM_V1",
  ppc: null,
  directCheckoutLinking: null,
  evidence: { viewports: null, dom: null, lighthouse: null, humanReview: "PENDING" },
});

const prohibited = evaluateFacts(completeFacts, { ppc: { brandPpc: "BLOCKED", genericSearchPpc: "ALLOWED" } });
const missingEvidence = evaluateFacts(completeFacts, {
  evidence: { viewports: null, dom: null, lighthouse: null, humanReview: "PENDING" },
});
const pendingReview = evaluateFacts(completeFacts, {
  evidence: { ...fullEvidence(), humanReview: "PENDING" },
});

assert(complete.predictsConversion === false && complete.publicationRelease === false && complete.adsRelease === false, "score não prevê conversão nem libera publicação ou anúncios");
assert(complete.qualityGate === "PASS" && complete.score >= 85, `fixture completa chega ao alvo (${complete.score}, ${complete.qualityGate})`);
assert(complete.complianceGate === "PASS" && complete.commercialReadiness === "SUFFICIENT", `fixture completa: compliance ${complete.complianceGate}, prontidão ${complete.commercialReadiness}`);
assert(complete.technicalGate === "PASS", `fixture completa gate técnico ${complete.technicalGate}`);
assert(complete.evidence.some((item) => item.id === "lighthouse" && item.status === "EVIDENCE_MISSING"), "lighthouse ausente não vira número");
assert(!complete.limitations.includes("NO_AUTHORIZED_AFFILIATE_URL"), "fixture completa conserva o CTA autorizado");

assert(insufficient.commercialReadiness === "INSUFFICIENT", `poucos dados: ${insufficient.commercialReadiness}`);
assert(insufficient.limitations.includes("INSUFFICIENT_PRODUCT_INFORMATION"), "poucos dados registram informação insuficiente");
assert(insufficient.limitations.includes("NO_AUTHORIZED_AFFILIATE_URL") && insufficient.limitations.includes("NO_APPROVED_PACKSHOT"), "poucos dados não ganham CTA nem imagem");
assert(insufficient.qualityGate === "REVIEW" && insufficient.score < 85, "poucos dados não passam o alvo");

assert(prohibited.score >= 85 && prohibited.complianceGate !== "PASS" && prohibited.adsRelease === false, "nota alta não libera compliance com PPC proibido");
assert(prohibited.commercialReadiness === "REVIEW_REQUIRED" && prohibited.limitations.includes("PPC_PROHIBITED"), "PPC proibido fica na prontidão comercial");

assert(missingEvidence.technicalGate === "REVIEW", "evidência técnica ausente não vira aprovação");
assert(missingEvidence.evidence.filter((item) => item.status === "EVIDENCE_MISSING").length >= 3, "evidências ausentes são identificadas");
assert(!JSON.stringify(missingEvidence.evidence).includes("0.62"), "métrica de lighthouse não é inventada");
assert(missingEvidence.qualityGate === "REVIEW", "evidência ausente mantém a qualidade em revisão");

assert(pendingReview.score === complete.score && pendingReview.automatedScore === complete.automatedScore && pendingReview.qualityGate === "REVIEW", "REVIEW humano não vira PASS nem altera a nota automática");
assert(pendingReview.humanReview === "PENDING" && pendingReview.visualReviewStatus === "PENDING" && pendingReview.finalQualityStatus === "REVIEW" && pendingReview.limitations.includes("VISUAL_REVIEW_PENDING"), "revisão visual pendente fica registrada");
assert(complete.visualReviewStatus === "ACCEPTED" && complete.finalQualityStatus === "PASS" && complete.automatedScore === complete.score, "qualidade final só passa com revisão aceita");
const internalLighthouse = evaluateFacts(completeFacts, {
  evidence: {
    ...fullEvidence(),
    humanReview: "PENDING",
    lighthouse: {
      performance: 0.61,
      accessibility: 0.97,
      bestPractices: 0.96,
      seo: 0.54,
      contrastFailed: false,
      source: "fixture-lighthouse.json",
      seoScope: "INTERNAL_NOINDEX",
    },
  },
});
assert(internalLighthouse.automatedScore === pendingReview.automatedScore, "Lighthouse interno não altera a nota automática");
assert(internalLighthouse.finalQualityStatus === "REVIEW" && internalLighthouse.publicationRelease === false, "SEO interno não homologa a qualidade visual");
const lighthouseEvidence = internalLighthouse.evidence.find((item) => item.id === "lighthouse");
assert(lighthouseEvidence?.status === "RECORDED" && lighthouseEvidence.detail.includes("SEO_NOT_PUBLIC") && !lighthouseEvidence.detail.includes("SEO_PUBLIC"), "SEO de rota noindex não conta como SEO público");

const renderer = readFileSync(path.join(process.cwd(), "src/components/product-showcase/product-showcase-premium-v1.tsx"), "utf8");
assert(!renderer.includes("LpQuality") && !renderer.includes("data-lp-quality-gate"), "diagnóstico não entra na LP do consumidor");
const preview = readFileSync(path.join(process.cwd(), "src/app/admin/preview/[slug]/page.tsx"), "utf8");
const qualityCenter = readFileSync(path.join(process.cwd(), "src/app/admin/[id]/edit/quality-center.tsx"), "utf8");
assert(preview.includes("LpQualityPanel") && qualityCenter.includes("LpQualityPanel"), "diagnóstico aparece no admin");
const panel = readFileSync(path.join(process.cwd(), "src/components/admin/lp-quality-panel.tsx"), "utf8");
assert(panel.includes("AUTOMATED_SCORE") && panel.includes("VISUAL_REVIEW_STATUS") && panel.includes("FINAL_QUALITY_STATUS"), "admin separa nota automática, revisão visual e qualidade final");

function snapshot(id: number) {
  const campaign = getCampaignById(id);
  return JSON.stringify({
    facts: campaign?.sourceFactsJson,
    publication: campaign?.publicationStatus,
    template: campaign?.presentationTemplate,
    gates: readStoredLandingDocument(id)?.metadata.gates,
  });
}

function campaignReport(id: number): LpQualityReport {
  const before = snapshot(id);
  const report = evaluateStoredCampaign(getCampaignById(id)!);
  assert(Boolean(report), `campanha ${id} tem relatório`);
  assert(snapshot(id) === before, `campanha ${id} dados intactos`);
  assert(report!.publicationRelease === false && report!.adsRelease === false, `campanha ${id} não é liberada pelo score`);
  return report!;
}

const report186 = campaignReport(186);
const report188 = campaignReport(188);
const report190 = campaignReport(190);
assert(report186.selectedTemplate === null && report186.qualityGate === "REVIEW", "template legado da 186 permanece e a qualidade fica em revisão");
assert(report188.limitations.includes("PRICE_CONTEXT_INSUFFICIENT") && report188.qualityGate === "REVIEW", "188 omite preço sem contexto e não se autoaprova");
assert(report190.humanReview === "PENDING" && report190.qualityGate === "REVIEW" && report190.complianceGate !== "PASS", "190 permanece em revisão visual e sem aprovação de compliance");
assert(report186.commercialReadiness !== "SUFFICIENT" && report188.commercialReadiness !== "SUFFICIENT" && report190.commercialReadiness !== "SUFFICIENT", "rascunhos reais não ficam comercialmente suficientes");

const out = path.join(process.cwd(), "data", "evidence", "lp-quality-gate-v1");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "score.json"), JSON.stringify({
  predictsConversion: false,
  publicationRelease: false,
  adsRelease: false,
  campaigns: {
    186: report186,
    188: report188,
    190: report190,
  },
  fixtures: {
    complete: { score: complete.score, technicalGate: complete.technicalGate, qualityGate: complete.qualityGate, complianceGate: complete.complianceGate, commercialReadiness: complete.commercialReadiness },
    insufficient: { score: insufficient.score, technicalGate: insufficient.technicalGate, qualityGate: insufficient.qualityGate, complianceGate: insufficient.complianceGate, commercialReadiness: insufficient.commercialReadiness, limitations: insufficient.limitations },
    ppcProhibited: { score: prohibited.score, complianceGate: prohibited.complianceGate, commercialReadiness: prohibited.commercialReadiness, adsRelease: prohibited.adsRelease },
    missingEvidence: { technicalGate: missingEvidence.technicalGate, qualityGate: missingEvidence.qualityGate, evidence: missingEvidence.evidence },
  },
}, null, 2));

async function main() {
  const response = await fetch("http://127.0.0.1:3000/p/neuroprime");
  assert(response.status === 404, "rascunho público 404");
  console.log(JSON.stringify({
    complete: complete.score,
    insufficient: insufficient.commercialReadiness,
    prohibited: prohibited.complianceGate,
    missing: missingEvidence.technicalGate,
    c186: { score: report186.score, technical: report186.technicalGate, quality: report186.qualityGate, compliance: report186.complianceGate, readiness: report186.commercialReadiness },
    c188: { score: report188.score, technical: report188.technicalGate, quality: report188.qualityGate, compliance: report188.complianceGate, readiness: report188.commercialReadiness },
    c190: { score: report190.score, technical: report190.technicalGate, quality: report190.qualityGate, compliance: report190.complianceGate, readiness: report190.commercialReadiness, lighthouse: report190.evidence.find((item) => item.id === "lighthouse")?.status },
  }));
  console.log("LP_QUALITY_GATE_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
