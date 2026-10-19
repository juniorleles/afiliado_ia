import { readFileSync } from "node:fs";
import path from "node:path";
import { readAffiliateProgram } from "../src/lib/affiliate-program.ts";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { emptyProductFacts, type ProductFacts, type ProductFormatFact } from "../src/lib/product-facts.ts";
import { buildAdaptivePlan, type AdaptivePresentationPlan } from "../src/lib/product-showcase/adaptive-plan.ts";
import { adaptLandingToShowcase } from "../src/lib/product-showcase/adapt.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

function facts(name: string): ProductFacts {
  return emptyProductFacts(name, "https://example.test/product", "IMPORTED");
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

function eligible(base: ProductFacts, field: "features" | "ingredientsOrComponents" | "usageInformation" | "pricingInformation" | "guaranteeInformation"): ProductFacts {
  base.confidence[field] = "DIRECT_SOURCE";
  return base;
}

const shell = {
  channel: "presell" as const,
  siteName: "Product Reviews",
  affiliateDisclosure: "Disclosure.",
  footerLinks: [],
};

const capsules = facts("Northwind Capsule");
eligible(capsules, "ingredientsOrComponents").ingredientsOrComponents = ["Northpetal", "Ambergill"];
eligible(capsules, "features").features = ["Once-daily capsule"];
eligible(capsules, "guaranteeInformation").guaranteeInformation = "60-day refund";
capsules.productFormat = formatFact("capsule", "Once-daily capsule");
const capsulePlan = buildAdaptivePlan({
  facts: capsules,
  approvedPackshot: { src: "/media/product/northwind.png", alt: "Northwind Capsule product image" },
  cta: { href: "https://hop.example/northwind", label: "See offer" },
});
assert(capsulePlan.format === "capsule" && capsulePlan.formatStatement === "Once-daily capsule", "A formato cápsula");
assert(capsulePlan.hero === "image" && !capsulePlan.limitations.includes("NO_APPROVED_PACKSHOT"), "A packshot aprovado usa image hero");
assert(capsulePlan.guarantee === "60-day refund" && !capsulePlan.limitations.includes("NO_ELIGIBLE_GUARANTEE"), "A garantia elegível");
assert(capsulePlan.ingredientLayout === "sparse" && capsulePlan.ingredientCount === 2, "A poucos ingredientes");
assert(capsulePlan.cta?.href === "https://hop.example/northwind", "A CTA autorizado");
assert(capsulePlan.features.filter((line) => line === capsulePlan.formatStatement).length <= 1, "A o formato não se multiplica");

const drops = facts("Harbor Drops");
drops.productFormat = formatFact("drops", "Liquid drops in a 30 ml bottle");
const dropsPlan = buildAdaptivePlan({ facts: drops });
assert(dropsPlan.format === "drops" && dropsPlan.hero === "editorial", "B gotas sem packshot");
assert(dropsPlan.price === null && dropsPlan.cta === null, "B sem preço e sem CTA");
assert(
  dropsPlan.limitations.includes("NO_APPROVED_PACKSHOT") &&
    dropsPlan.limitations.includes("NO_VERIFIED_PRICE") &&
    dropsPlan.limitations.includes("NO_AUTHORIZED_AFFILIATE_URL"),
  "B limitações de packshot, preço e URL",
);
assert(!dropsPlan.limitations.includes("PPC_PROHIBITED"), "B ausência de PPC não vira proibição");

const powder = facts("Cedar Powder");
eligible(powder, "usageInformation").usageInformation = ["Powder in a pouch", "Mix one level scoop with water"];
const powderPlan = buildAdaptivePlan({ facts: powder });
assert(powderPlan.format === "powder", "C formato pó");
assert(powderPlan.usage.join(" ") === "Mix one level scoop with water", "C uso elegível permanece literal");
assert(!powderPlan.limitations.includes("NO_ELIGIBLE_USAGE"), "C uso elegível não gera limitação");
assert(!JSON.stringify(powderPlan).toLowerCase().includes("twice a day"), "C não inventa frequência");

const incomplete = facts("Blank Product");
const incompletePlan = buildAdaptivePlan({ facts: incomplete });
assert(incompletePlan.format === "unknown" && incompletePlan.benefits === "omit" && incompletePlan.features.length === 0, "D sem formato e sem benefícios");
assert(incompletePlan.price === null && incompletePlan.usage.length === 0 && incompletePlan.guarantee === null, "D sem preço, uso ou garantia inventados");
assert(
  incompletePlan.limitations.includes("NO_ELIGIBLE_FEATURES") &&
    incompletePlan.limitations.includes("NO_ELIGIBLE_USAGE") &&
    incompletePlan.limitations.includes("NO_VERIFIED_PRICE") &&
    incompletePlan.limitations.includes("NO_ELIGIBLE_GUARANTEE") &&
    incompletePlan.limitations.includes("NO_AUTHORIZED_AFFILIATE_URL") &&
    incompletePlan.limitations.includes("NO_APPROVED_PACKSHOT"),
  "D limitações de informação incompleta",
);

const priced = facts("Priced Powder");
eligible(priced, "pricingInformation").pricingInformation = "One pouch for USD 49";
priced.confidence.pricingInformation = "HEURISTIC_EXTRACTION";
assert(buildAdaptivePlan({ facts: priced }).limitations.includes("NO_VERIFIED_PRICE"), "preço heurístico não é verificável");
eligible(priced, "pricingInformation");
const verified = buildAdaptivePlan({ facts: priced });
assert(verified.price?.statement === "One pouch for USD 49" && verified.price.currency === "USD", "preço elegível conserva a moeda escrita");

const blocked = facts("Blocked Feature");
eligible(blocked, "features").features = ["Supports healthy cholesterol levels"];
const blockedPlan = buildAdaptivePlan({ facts: blocked });
assert(blockedPlan.features.length === 0 && blockedPlan.benefits === "omit", "claim bloqueado não vira feature");

const prohibited = buildAdaptivePlan({
  facts: incomplete,
  ppc: { brandPpc: "BLOCKED", genericSearchPpc: "ALLOWED" },
});
assert(prohibited.limitations.includes("PPC_PROHIBITED") && !prohibited.limitations.includes("PPC_PERMISSION_UNKNOWN"), "E restrição explícita de PPC");
const unknown = buildAdaptivePlan({
  facts: incomplete,
  ppc: { brandPpc: "ALLOWED", genericSearchPpc: "UNKNOWN" },
});
assert(unknown.limitations.includes("PPC_PERMISSION_UNKNOWN") && !unknown.limitations.includes("PPC_PROHIBITED"), "PPC desconhecido não vira proibição");

const partial = facts("Partial Photos");
eligible(partial, "ingredientsOrComponents").ingredientsOrComponents = ["One", "Two"];
const photos = buildAdaptivePlan({
  facts: partial,
  approvedIngredientImages: [{ name: "One", src: "/media/product/one.png", alt: "One" }],
});
assert(photos.ingredientPhotos === false && photos.ingredientLayout === "sparse", "foto parcial não libera a grade ilustrada");
assert(JSON.stringify(buildAdaptivePlan({ facts: capsules, approvedPackshot: capsulePlan.hero === "image" ? { src: "/media/product/northwind.png", alt: "Northwind Capsule product image" } : null, cta: capsulePlan.cta })) === JSON.stringify(capsulePlan), "o plano é determinístico");

const engine = readFileSync(path.join(process.cwd(), "src/lib/product-showcase/adaptive-plan.ts"), "utf8");
assert(!/neuroprime|cholibrium|joint genesis/i.test(engine), "nenhuma regra por marca");
const view = readFileSync(path.join(process.cwd(), "src/components/product-showcase/product-showcase-premium-v1.tsx"), "utf8");
assert(!/NO_APPROVED_PACKSHOT|NO_VERIFIED_PRICE|PPC_PROHIBITED/.test(view), "limitações não entram no componente");

function campaignPlan(id: number): AdaptivePresentationPlan {
  const before = getCampaignById(id);
  const document = before ? readStoredLandingDocument(before.id) : null;
  assert(Boolean(before && document), `campanha ${id} tem documento`);
  const factsJson = before!.sourceFactsJson;
  const publication = before!.publicationStatus;
  const template = before!.presentationTemplate;
  const model = adaptLandingToShowcase(before!, document!, shell);
  const after = getCampaignById(id);
  assert(after?.sourceFactsJson === factsJson && after.publicationStatus === publication && after.presentationTemplate === template, `campanha ${id} dados intactos`);
  assert(Boolean(model.adaptivePlan), `campanha ${id} tem plano`);
  return model.adaptivePlan!;
}

const plan186 = campaignPlan(186);
const plan188 = campaignPlan(188);
const plan189 = campaignPlan(189);
const plan190 = campaignPlan(190);
assert(plan186.hero === "editorial" || plan186.hero === "image", "campanha 186 plano genérico");
assert(plan188.ingredientCount === 10 && plan188.ingredientLayout === "compact", "campanha 188 muitos ingredientes");
assert(plan189.limitations.every((code) => code.startsWith("NO_") || code.startsWith("PPC_")), "campanha 189 só códigos genéricos");
assert(plan190.hero === "editorial" && plan190.benefits === "omit", "campanha 190 sem packshot e sem features");
assert(
  plan190.limitations.includes("NO_APPROVED_PACKSHOT") &&
    plan190.limitations.includes("NO_ELIGIBLE_FEATURES") &&
    plan190.limitations.includes("NO_AUTHORIZED_AFFILIATE_URL"),
  "campanha 190 limitações comerciais",
);
const program190 = readAffiliateProgram(190);
assert(program190?.brandPpc === "BLOCKED" && plan190.limitations.includes("PPC_PROHIBITED"), "campanha 190 PPC proibido explícito");
assert(program190?.genericSearchPpc === "UNKNOWN" && plan190.limitations.includes("PPC_PERMISSION_UNKNOWN"), "campanha 190 PPC desconhecido permanece desconhecido");
assert(Boolean(plan190.price) && !plan190.limitations.includes("NO_VERIFIED_PRICE"), "campanha 190 conserva o preço elegível");

const document190 = readStoredLandingDocument(190);
assert(document190?.metadata.gates?.grounding === "PASS" && document190.metadata.gates.structural === "PASS", "grounding e estrutura da 190 intactos");
assert(document190?.metadata.gates?.publication === "HELD", "publicação da 190 continua retida");
const invented = validateGrounding("This powder cures fatigue in three days.", incomplete, { productIdentity: incomplete.productName });
assert(invented.status !== "GROUNDED", "grounding continua rejeitando conteúdo inventado");

async function main() {
  const response = await fetch("http://127.0.0.1:3000/p/neuroprime");
  assert(response.status === 404, "rascunho público 404");
  console.log("ADAPTIVE_PLAN_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
