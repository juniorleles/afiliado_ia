import { readFileSync } from "node:fs";
import path from "node:path";
import { validateGrounding } from "../src/lib/ai/grounding-validator.ts";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { emptyProductFacts, type IngredientContextEntry, type ProductFacts, type ProductFormatFact } from "../src/lib/product-facts.ts";
import { buildAdaptivePlan } from "../src/lib/product-showcase/adaptive-plan.ts";
import { adaptLandingToShowcase } from "../src/lib/product-showcase/adapt-campaign.ts";
import { buildEditorialDocument, type EditorialBlock, type EditorialDocument } from "../src/lib/product-showcase/editorial.ts";
import { evaluateEditorialIntelligence } from "../src/lib/product-showcase/editorial-campaign.ts";
import { assessEditorialIntelligence, consumerText, type EditorialPipelineContext } from "../src/lib/product-showcase/editorial-intelligence.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

function facts(name: string): ProductFacts {
  return emptyProductFacts(name, "https://example.test/product", "IMPORTED");
}

function allow(base: ProductFacts, field: "description" | "features" | "ingredientsOrComponents" | "usageInformation" | "pricingInformation" | "guaranteeInformation" | "cautions"): ProductFacts {
  base.confidence[field] = "DIRECT_SOURCE";
  return base;
}

function formatFact(value: string, statement: string): ProductFormatFact {
  return { value, statement, provenance: "DIRECT_SOURCE", copyEligibility: "YES", policyFindings: [], sourceUrl: "https://example.test/product", sourcePageCategory: "PRODUCT_DETAILS" };
}

function note(ingredient: string, statement: string): IngredientContextEntry {
  return { ingredient, statement, relation: "DESCRIBED_AS", attribution: "SELLER", provenance: "DIRECT_SOURCE", kind: "NEUTRAL_CONTEXT", copyEligibility: "YES", policyFindings: [], sourceUrl: "https://example.test/product", sourcePageCategory: "PRODUCT_DETAILS" };
}

const disclosure = "Disclosure: I may earn a commission if you purchase through links on this page.";

function lines(document: EditorialDocument): string[] {
  return document.blocks.flatMap((block) => [block.heading, ...block.paragraphs, ...block.items]);
}

function block(document: EditorialDocument, id: EditorialBlock["id"]): EditorialBlock | undefined {
  return document.blocks.find((item) => item.id === id);
}

function count(document: EditorialDocument, text: string): number {
  const key = text.toLowerCase();
  return lines(document).filter((line) => line.toLowerCase().includes(key)).length;
}

function documentFor(source: ProductFacts, extra?: { cta?: { href: string; label: string } | null; packshot?: { src: string; alt: string } | null }): EditorialDocument {
  const plan = buildAdaptivePlan({ facts: source, approvedPackshot: extra?.packshot, cta: extra?.cta });
  return buildEditorialDocument({ facts: source, plan, affiliateDisclosure: disclosure });
}

function assessEditorial(source: ProductFacts, document: EditorialDocument, pipeline?: EditorialPipelineContext) {
  return assessEditorialIntelligence({ facts: source, document, pipeline });
}

const capsules = facts("Northwind Capsule");
allow(capsules, "description").description = "A daily capsule.";
allow(capsules, "features").features = ["Once-daily capsule", "Bottle of 30"];
allow(capsules, "ingredientsOrComponents").ingredientsOrComponents = ["Northpetal", "Ambergill"];
allow(capsules, "guaranteeInformation").guaranteeInformation = "60-day refund";
allow(capsules, "pricingInformation").pricingInformation = "One bottle for USD 49";
allow(capsules, "cautions").cautions = ["This product is not intended to diagnose, treat, cure, or prevent any disease."];
capsules.productFormat = formatFact("capsule", "Once-daily capsule");
capsules.ingredientContext = [note("Northpetal", "A dried flower")];
const capsuleDoc = documentFor(capsules, { packshot: { src: "/media/product/northwind.png", alt: "Northwind Capsule product image" }, cta: { href: "https://hop.example/northwind", label: "See offer" } });
assert(block(capsuleDoc, "format")?.paragraphs[0] === "Once-daily capsule", "cápsula apresenta o formato verificado");
assert(block(capsuleDoc, "introduction")?.paragraphs.join(" ") === "A daily capsule. Bottle of 30", "uma característica entra no resumo");
assert(!block(capsuleDoc, "characteristics"), "uma característica não abre seção própria");
assert(block(capsuleDoc, "ingredients")?.items[0] === "Northpetal — A dried flower", "poucos ingredientes usam só a descrição fundamentada");
assert(count(capsuleDoc, "Once-daily capsule") === 1, "formato da cápsula aparece uma vez");
assert(count(capsuleDoc, "60-day refund") === 1, "garantia aparece uma vez");
assert(count(capsuleDoc, "USD 49") === 1, "preço aparece uma vez");
assert(count(capsuleDoc, "2 ingredients") === 1, "contagem de ingredientes aparece uma vez");
assert(block(capsuleDoc, "disclosure")?.paragraphs[0] === disclosure, "disclosure obrigatório preservado");
assert(capsuleDoc.cta?.label === "See offer", "CTA autorizado permanece no documento");

const drops = facts("Harbor Drops");
drops.productFormat = formatFact("drops", "Liquid drops in a 30 ml bottle");
const dropsDoc = documentFor(drops);
assert(dropsDoc.blocks.some((item) => item.id === "format") && !dropsDoc.blocks.some((item) => item.id === "usage"), "gotas mostram o formato e omitem uso ausente");
assert(!dropsDoc.blocks.some((item) => item.id === "price") && dropsDoc.cta === null, "gotas sem preço e sem CTA");
assert(!/buy now|order now|shop now/i.test(lines(dropsDoc).join(" ")), "gotas não ganham chamada de compra");

const powder = facts("Cedar Powder");
allow(powder, "usageInformation").usageInformation = ["Powder in a pouch", "Mix one level scoop with water"];
const powderDoc = documentFor(powder);
assert(block(powderDoc, "format")?.paragraphs[0] === "Powder in a pouch", "pó apresenta o formato verificado");
assert(block(powderDoc, "usage")?.paragraphs.join(" ") === "Mix one level scoop with water", "pó apresenta o preparo verificado");
assert(!/stir|daily|twice/i.test(lines(powderDoc).join(" ")), "pó não inventa preparo");

const thin = facts("Blank Product");
const thinDoc = documentFor(thin);
assert(thinDoc.benefits === "omit" && !thinDoc.blocks.some((item) => item.id === "characteristics"), "poucos dados não criam benefícios");
assert(!thinDoc.blocks.some((item) => item.id === "price" || item.id === "usage" || item.id === "guarantee"), "poucos dados não inventam preço, uso ou garantia");
assert(thinDoc.limitations.includes("NO_ELIGIBLE_FEATURES") && thinDoc.limitations.includes("NO_VERIFIED_PRICE"), "omissões ficam registradas");

const barePrice = facts("Bare Price");
allow(barePrice, "pricingInformation").pricingInformation = "$140";
const barePriceDoc = documentFor(barePrice);
assert(!block(barePriceDoc, "price") && barePriceDoc.limitations.includes("PRICE_CONTEXT_INSUFFICIENT"), "valor isolado não vira bloco de preço");
assert(!barePriceDoc.limitations.includes("NO_VERIFIED_PRICE"), "preço elegível sem contexto não é tratado como ausente");
assert(!lines(barePriceDoc).some((line) => line.includes("$140")), "valor isolado fica fora da cópia");

const twoDetails = facts("Two Details");
allow(twoDetails, "description").description = "A short description.";
allow(twoDetails, "features").features = ["Glass bottle", "30 servings"];
const twoDetailsDoc = documentFor(twoDetails);
assert(block(twoDetailsDoc, "characteristics")?.items.join("|") === "Glass bottle|30 servings", "várias características continuam juntas");

const noBenefits = facts("Plain Bottle");
allow(noBenefits, "features").features = ["Supports healthy cholesterol levels"];
const noBenefitsDoc = documentFor(noBenefits);
assert(noBenefitsDoc.benefits === "omit" && !lines(noBenefitsDoc).join(" ").toLowerCase().includes("cholesterol"), "feature bloqueada não vira seção");

const filler = /carefully crafted|unlock your|transform your|scientifically proven|premium formula/i;
assert(!filler.test(lines(capsuleDoc).join("\n") + lines(dropsDoc).join("\n") + lines(powderDoc).join("\n")), "sem texto genérico");

for (const [source, document] of [[capsules, capsuleDoc], [drops, dropsDoc], [powder, powderDoc]] as const) {
  const allowed = JSON.stringify(source);
  for (const item of document.blocks) {
    for (const trace of item.trace) {
      const known = trace.field === "affiliateDisclosure" ? trace.text === disclosure : trace.field === "ingredientsOrComponents" && /^\d+ ingredients$/.test(trace.text) ? true : allowed.includes(trace.text);
      assert(known, "rastro aponta para um fato: " + trace.text);
    }
    for (const line of [...item.paragraphs, ...item.items]) {
      if (/^\d+ ingredients$/.test(line) || line === "Declared by the product source") continue;
      assert(item.trace.some((trace) => trace.text === line || line.startsWith(`${trace.text} —`) || line.endsWith(trace.text)), "linha rastreável: " + line);
    }
  }
}

const engine = readFileSync(path.join(process.cwd(), "src/lib/product-showcase/editorial.ts"), "utf8");
const intelligence = readFileSync(path.join(process.cwd(), "src/lib/product-showcase/editorial-intelligence.ts"), "utf8");
assert(!/neuroprime|cholibrium|joint genesis/i.test(engine + intelligence), "nenhuma regra por marca");
const view = readFileSync(path.join(process.cwd(), "src/components/product-showcase/product-showcase-premium-v1.tsx"), "utf8");
assert(view.includes("model.editorial") && view.includes("model.adaptivePlan") && !view.includes("data-editorial-depth"), "renderer consome o plano e não mostra diagnóstico");

const shell = { channel: "presell" as const, siteName: "Product Reviews", affiliateDisclosure: disclosure, healthDisclaimer: "This page is informational.", footerLinks: [] };

function campaignEditorial(id: number): EditorialDocument {
  const before = getCampaignById(id);
  const stored = before ? readStoredLandingDocument(before.id) : null;
  assert(Boolean(before && stored), `campanha ${id} tem documento`);
  const snapshot = JSON.stringify({ facts: before!.sourceFactsJson, publication: before!.publicationStatus, template: before!.presentationTemplate });
  const model = adaptLandingToShowcase(before!, stored!, shell);
  const after = getCampaignById(id);
  assert(JSON.stringify({ facts: after?.sourceFactsJson, publication: after?.publicationStatus, template: after?.presentationTemplate }) === snapshot, `campanha ${id} dados intactos`);
  assert(Boolean(model.editorial && model.adaptivePlan), `campanha ${id} tem editorial`);
  const editorial = model.editorial!;
  assert(editorial.benefits === model.adaptivePlan!.benefits, `campanha ${id} respeita o plano de benefícios`);
  assert(editorial.cta?.href === model.adaptivePlan!.cta?.href, `campanha ${id} não inventa CTA`);
  if (model.adaptivePlan!.guarantee) assert(count(editorial, model.adaptivePlan!.guarantee) === 1, `campanha ${id} garantia única`);
  if (model.adaptivePlan!.price) assert(count(editorial, model.adaptivePlan!.price.statement) === 1, `campanha ${id} preço único`);
  if (model.adaptivePlan!.benefits === "omit") assert(!editorial.blocks.some((item) => item.id === "characteristics"), `campanha ${id} sem benefícios`);
  return editorial;
}

const editorial186 = campaignEditorial(186);
const editorial188 = campaignEditorial(188);
const editorial189 = campaignEditorial(189);
const editorial190 = campaignEditorial(190);
assert(editorial186.blocks.some((item) => item.id === "disclosure"), "campanha 186 preserva disclosure");
assert(block(editorial188, "ingredients")?.items.length === 10, "campanha 188 lista os ingredientes uma vez");
assert(!block(editorial188, "price") && editorial188.limitations.includes("PRICE_CONTEXT_INSUFFICIENT"), "campanha 188 omite preço sem contexto comercial");
assert(!editorial188.blocks.some((item) => item.id === "characteristics"), "campanha 188 não abre seção para uma característica");
assert(editorial189.limitations.every((code) => code.startsWith("NO_") || code.startsWith("PPC_") || code.startsWith("PRICE_")), "campanha 189 só registra limitações");
assert(editorial190.benefits === "omit" && editorial190.cta === null, "campanha 190 sem benefícios e sem CTA");
assert(Boolean(block(editorial190, "price")) && Boolean(block(editorial190, "guarantee")), "campanha 190 mostra preço e garantia elegíveis");
const page188 = lines(editorial188).join("\n");
const page190 = lines(editorial190).join("\n");
assert(!page188.includes("$140") && !page188.includes("@") && page188.includes("Simple Promise"), "188 fabricante sem contato e sem preco solto");
assert(!/cholesterol|peer-reviewed|blood pressure/i.test(page188), "188 sem alegacao medica");
assert(page190.includes("free shipping") && page190.includes("return unused product") && !/memory function/i.test(page190), "190 frete e devolucao, sem claim");
const depth186 = evaluateEditorialIntelligence(186);
const depth188 = evaluateEditorialIntelligence(188);
const depth190 = evaluateEditorialIntelligence(190);
assert(depth186?.depth === "INSUFFICIENT" && depth186.insufficiency.includes("EDITORIAL_DEPTH_INSUFFICIENT"), "186 insuficiente");
assert(depth188?.depth === "RICH" && depth190?.depth === "RICH", "188 e 190 ricas");
assert(!consumerText(editorial186).includes("EDITORIAL_DEPTH_INSUFFICIENT"), "diagnostico fora da copia");

const stored190 = readStoredLandingDocument(190);
assert(stored190?.metadata.gates?.grounding === "PASS" && stored190.metadata.gates.publication === "HELD", "gates da 190 intactos");
const invented = validateGrounding("This powder cures fatigue in three days.", thin, { productIdentity: thin.productName });
assert(invented.status !== "GROUNDED", "grounding rejeita inventado");

const rich = facts("Rich Bottle");
allow(rich, "description").description = "A daily capsule in a glass bottle.";
allow(rich, "features").features = ["Bottle of 30", "Measured cap included"];
allow(rich, "ingredientsOrComponents").ingredientsOrComponents = ["Northpetal", "Ambergill", "Cedar leaf", "River mint", "Amber root", "Quiet seed"];
allow(rich, "usageInformation").usageInformation = ["Take one capsule with water"];
allow(rich, "pricingInformation").pricingInformation = "One bottle for USD 49";
allow(rich, "guaranteeInformation").guaranteeInformation = "60-day refund";
allow(rich, "cautions").cautions = ["This product is not intended to diagnose, treat, cure, or prevent any disease."];
rich.confidence.manufacturer = "DIRECT_SOURCE";
rich.manufacturer = "Northwind Labs";
rich.productFormat = formatFact("capsule", "Once-daily capsule");
rich.returnsInformation = [{ statement: "Return the sealed bottle within 60 days for a refund.", kind: "RETURN_WINDOW", provenance: "DIRECT_SOURCE", copyEligibility: "YES", policyFindings: [], sourceUrl: "https://example.test/product", sourcePageCategory: "REFUNDS" }];
rich.shippingInformation = [{ statement: "Ships in a padded mailer.", kind: "OTHER", provenance: "DIRECT_SOURCE", copyEligibility: "YES", policyFindings: [], sourceUrl: "https://example.test/product", sourcePageCategory: "SHIPPING" }];
assert(assessEditorial(rich, documentFor(rich)).depth === "RICH", "A fatos ricos");
const fewOnly = facts("Two Leaf");
allow(fewOnly, "usageInformation").usageInformation = ["Take one capsule with water"];
assert(assessEditorial(fewOnly, documentFor(fewOnly)).depth === "LIMITED", "B poucos fatos");
const names = facts("Many Names");
allow(names, "ingredientsOrComponents").ingredientsOrComponents = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
allow(names, "features").features = ["Supports healthy cholesterol levels"];
const namesDoc = documentFor(names);
assert(assessEditorial(names, namesDoc).depth === "ADEQUATE" && !lines(namesDoc).join(" ").includes("cholesterol"), "C ingredientes sem beneficio");
const multi = facts("Multi Offer");
allow(multi, "pricingInformation").pricingInformation = "1 bottle $59; 3 bottles $147 total; 6 bottles $234 total.";
allow(multi, "ingredientsOrComponents").ingredientsOrComponents = ["Northpetal", "Ambergill"];
multi.productFormat = formatFact("capsule", "Once-daily capsule");
assert(count(documentFor(multi), "1 bottle $59") === 1 && !/save|discount/i.test(lines(documentFor(multi)).join(" ")), "D oferta unica sem desconto");
const barePlan = buildAdaptivePlan({ facts: rich });
assert(barePlan.limitations.includes("NO_APPROVED_PACKSHOT") && barePlan.limitations.includes("NO_AUTHORIZED_AFFILIATE_URL"), "E sem imagem nem hoplink");
const claimOnly = facts("Claim Only");
allow(claimOnly, "description").description = "Supports healthy cholesterol levels and heart health.";
const claimDepth = assessEditorial(claimOnly, documentFor(claimOnly));
assert(claimDepth.depth === "INSUFFICIENT" && claimDepth.insufficiency.includes("EDITORIAL_DEPTH_INSUFFICIENT"), "F alegacao inelegivel");
const repeated = facts("Repeated Fact");
allow(repeated, "features").features = ["Glass bottle", "Glass bottle", "30 servings"];
const repeatedDoc = documentFor(repeated);
assert(count(repeatedDoc, "Glass bottle") === 1 && assessEditorial(repeated, repeatedDoc).discarded.some((item) => /repetição/i.test(item.reason)), "G duplicata");
const quiet = facts("Quiet Product");
const quietDoc = documentFor(quiet);
const quietDepth = assessEditorial(quiet, quietDoc, { researchPresent: true, researchStatus: "COMPLETE", researchSourceCount: 8, analysisPresent: true, observedBenefits: ["Sellers mention overnight results"], observedClaims: [], scientificTopics: [], strategyPresent: false, strategyApproach: null, blueprintBlocking: [] });
assert(quietDepth.depth === "INSUFFICIENT" && !lines(quietDoc).join(" ").includes("overnight") && quietDepth.gaps.some((item) => item.disposition === "UNVERIFIED"), "H pesquisa sem fato");

function manufacturerLead(value: string) {
  const source = facts("Fictional Tonic");
  source.confidence.manufacturer = "DIRECT_SOURCE";
  source.manufacturer = value;
  const document = documentFor(source);
  assert((block(document, "introduction")?.paragraphs ?? []).length === 0, "fabricante nunca entra na introdução");
  return { document, paragraphs: block(document, "provenance")?.paragraphs ?? [], report: assessEditorial(source, document) };
}
const nameFirst = manufacturerLead("Acme Labs\nSupport Email:\nhelp@acme.test\nCustomer Support:\nhttps://help.acme.test");
assert(nameFirst.paragraphs.join("|") === "Acme Labs" && !lines(nameFirst.document).join(" ").includes("help@acme.test"), "I fabricante com nome primeiro, sem contato");
assert(
  nameFirst.report.records.some((item) => item.disposition === "INELIGIBLE" && /contato/i.test(item.reason))
    && !nameFirst.report.records.some((item) => item.disposition === "AVAILABLE_BUT_DISCARDED" && /support|help\.acme/i.test(item.text)),
  "I rotulos e link ficam como evidencia de contato",
);
assert(manufacturerLead("Customer Support:\nhttps://help.acme.test\nAcme Labs").paragraphs.join("|") === "Acme Labs", "J rotulo de suporte nao vira fabricante");
assert(manufacturerLead("https://help.acme.test").paragraphs.length === 0, "K link sozinho nao vira fabricante");
assert(manufacturerLead("Support Email:\nhelp@acme.test").paragraphs.length === 0, "L rotulo e email nao viram fabricante");

async function main() {
  const response = await fetch("http://127.0.0.1:3000/p/neuroprime");
  assert(response.status === 404, "rascunho público 404");
  const frame = await fetch("http://127.0.0.1:3000/visual-frame/neuroprime");
  const frameHtml = await frame.text();
  assert(frame.ok && !frameHtml.includes("data-editorial-depth"), "preview limpo sem diagnostico");
  const admin = await fetch("http://127.0.0.1:3000/admin/190/edit?aba=validacao");
  const adminHtml = await admin.text();
  assert(admin.ok && adminHtml.includes("data-editorial-depth") && adminHtml.includes("Profundidade editorial"), "admin mostra a profundidade");
  console.log("EDITORIAL_ENGINE_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
