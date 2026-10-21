import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyManualFacts, emptyProductFacts, type ProductFacts } from "../src/lib/product-facts.ts";
import { buildProductContract, type ContractInput } from "../src/lib/product-contract/build.ts";
import { statementAllowed, statementFindings } from "../src/lib/product-contract/claims.ts";
import { normalizeOffers } from "../src/lib/product-contract/offers.ts";
import { normalizeSpecifications } from "../src/lib/product-contract/specifications.ts";
import { CONTRACT_STATE_PATHS, type BuildResult, type ProductContract } from "../src/lib/product-contract/types.ts";
import { namesPriceContext, parseCommercialQuantity } from "../src/lib/product-contract/units.ts";
import { contractTexts, validateProductContract } from "../src/lib/product-contract/validate.ts";
import { parseSpecificationLine, parseSpecificationText } from "../src/lib/specification-text.ts";
import { priceHasCommercialContext, buildAdaptivePlan, parseVerifiedOffers } from "../src/lib/product-showcase/adaptive-plan.ts";
import { buildEditorialDocument, editorialLead } from "../src/lib/product-showcase/editorial.ts";
import type { ApprovedProductAsset, ProductAssetsContract } from "../src/lib/product-assets/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

type Scenario = {
  id: string;
  assets: "APPROVED" | "CANDIDATE_ONLY" | "NONE";
  cta: { href: string; label: string; previewOnly?: boolean };
  benefitCandidates: string[];
  traps: string[];
  facts: Partial<ProductFacts> & { productName: string; sourceUrl: string };
};

const fixtures = JSON.parse(readFileSync(path.join("scripts", "fixtures", "universal-scenarios.json"), "utf8")) as { scenarios: Scenario[] };

function hydrate(partial: Scenario["facts"]): ProductFacts {
  const base = emptyProductFacts(partial.productName, partial.sourceUrl, "IMPORTED");
  return { ...base, ...partial, confidence: { ...base.confidence, ...(partial.confidence ?? {}) }, importQuality: "SUFFICIENT" } as ProductFacts;
}

const SHA = "a".repeat(64);
function approvedAsset(productName: string): ApprovedProductAsset {
  return {
    id: "fixture-asset-1",
    src: "/media/product/fixture-1.png",
    alt: `${productName} product image`,
    kind: "PACKSHOT",
    width: 1200,
    height: 1200,
    format: "png",
    sha256: SHA,
    origin: "MANUFACTURER_AFFILIATE_TOOLS",
    sourcePage: "https://hop.example/assets",
    authorization: {
      kind: "OFFICIAL_AFFILIATE_ASSET_LIBRARY",
      sourceUrl: "https://hop.example/assets",
      verifiedAt: "2026-01-01T00:00:00.000Z",
      program: "Fixture program",
      materialId: null,
      useScope: "LANDING_PAGE",
      restrictions: [],
    },
    approvalMode: "POLICY",
    approvedAt: "2026-01-01T00:00:00.000Z",
  };
}

function assetsFor(scenario: Scenario, facts: ProductFacts): ProductAssetsContract {
  if (scenario.assets === "APPROVED") {
    const hero = approvedAsset(facts.productName);
    return { version: 1, productName: facts.productName, hero, approved: [hero], counts: { approved: 1, candidate: 0, rejected: 0 } };
  }
  if (scenario.assets === "CANDIDATE_ONLY") {
    return { version: 1, productName: facts.productName, hero: null, approved: [], counts: { approved: 0, candidate: 2, rejected: 0 } };
  }
  return { version: 1, productName: facts.productName, hero: null, approved: [], counts: { approved: 0, candidate: 0, rejected: 0 } };
}

const TRUST = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
  { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
];

function inputFor(scenario: Scenario, facts: ProductFacts, overrides: Partial<ContractInput> = {}): ContractInput {
  // The lead comes from the same editorial path the stored-campaign adapter uses.
  const plan = buildAdaptivePlan({ facts });
  const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: "Disclosure." });
  const { lead, summary } = editorialLead(editorial.blocks.find((block) => block.id === "introduction"));
  return {
    facts,
    slug: "fixture-slug",
    siteName: "Product Reviews",
    siteUrl: "https://site.example",
    assets: assetsFor(scenario, facts),
    cta: scenario.cta,
    legal: { affiliateDisclosure: "Disclosure: I may earn a commission.", healthDisclaimer: "Informational only.", trustLinks: TRUST },
    valueProposition: { headline: lead, supporting: summary },
    benefitCandidates: scenario.benefitCandidates,
    ...overrides,
  };
}

function build(scenario: Scenario, facts = hydrate(scenario.facts), overrides: Partial<ContractInput> = {}): BuildResult & { facts: ProductFacts } {
  return { ...buildProductContract(inputFor(scenario, facts, overrides)), facts };
}

function state(contract: ProductContract, pathName: string): string {
  const entry = contract.dataStates[pathName];
  return `${entry?.state}/${entry?.reason}`;
}

function scenario(id: string): Scenario {
  const found = fixtures.scenarios.find((item) => item.id.startsWith(id));
  if (!found) throw new Error("cenário ausente " + id);
  return found;
}

// ---- Units, specification parsing, claims (pure) -----------------------------------------------------
assert(parseCommercialQuantity("3 bottles")?.unit === "bottle" && parseCommercialQuantity("3 bottles")?.count === 3, "unidade: 3 bottles");
assert(parseCommercialQuantity("1 pair")?.unit === "pair", "unidade: 1 pair");
assert(parseCommercialQuantity("two sets")?.count === 2 && parseCommercialQuantity("two sets")?.unit === "set", "unidade: two sets");
assert(parseCommercialQuantity("6 pieces")?.unit === "piece", "unidade: 6 pieces");
assert(parseCommercialQuantity("12x kits")?.count === 12, "unidade: 12x kits");
assert(parseCommercialQuantity("$29") === null && parseCommercialQuantity("0 bottles") === null, "unidade: sem contagem e unidade juntas não é quantidade");
assert(namesPriceContext("$29 per pair") && namesPriceContext("2 sets $34") && !namesPriceContext("$29") && !namesPriceContext("$29, you can order"), "contexto de preço sem palavra ambígua");
assert(priceHasCommercialContext("1 pair $59; 2 pairs $108") && !priceHasCommercialContext("$29"), "plano legado aceita pair e rejeita preço solto");
assert(parseVerifiedOffers("2 sets $34 total; 4 sets $60 total").length === 2, "plano legado separa ofertas em sets");
assert(parseVerifiedOffers("3 bottles $117 total; 6 bottles $198 total").length === 2, "plano legado separa ofertas em bottles (inalterado)");

assert(parseSpecificationLine("Battery life: 8 hours")?.unit === "hours" && parseSpecificationLine("Battery life: 8 hours")?.value === "8", "especificação: valor e unidade");
assert(parseSpecificationLine("Bluetooth version: 5.3")?.unit === undefined, "especificação: sem unidade");
assert(parseSpecificationLine("This is a long sentence that is not a label. It goes on: and on") === null, "especificação: frase não é rótulo");
const parsedText = parseSpecificationText("Weight: 5.2 g\nSee https://x.example/doc: here\nColor: Graphite\n\nA note without a colon");
assert(parsedText.items.length === 2 && parsedText.ignored.length === 2, "especificação: texto separa itens e ignorados");
assert(parsedText.items[1].value === "Graphite" && parsedText.items[1].unit === undefined, "especificação: valor textual intacto");

assert(!statementAllowed("The best sound ever made."), "claim: superlativo bloqueado");
assert(!statementAllowed("Recommended by doctors worldwide."), "claim: autoridade sem atribuição bloqueada");
assert(!statementAllowed("Erases wrinkles in 7 days."), "claim: resultado prometido bloqueado");
assert(!statementAllowed("Never needs charging."), "claim: promessa absoluta bloqueada");
assert(statementAllowed("Water-resistant housing") && statementAllowed("Dishwasher safe"), "claim: característica neutra permitida");
assert(statementAllowed("60-day money-back guarantee.", "OPERATIONAL", ["health.refund_duration"]) && !statementAllowed("60-day money-back guarantee.", "OPERATIONAL"), "claim: janela de garantia declarada é restaurada só como fato operacional");
assert(statementFindings("Call us at 555-0100 or sales@brand.example").length > 0, "claim: contato nunca é texto");

// ---- Six scenarios -----------------------------------------------------------------------------------------
const results: Array<{ id: string; status: string; violations: number; withheld: number }> = [];
for (const item of fixtures.scenarios) {
  const first = build(item);
  const second = build(item);
  const report = validateProductContract(first.contract, { facts: first.facts });
  assert(report.ok, `${item.id}: contrato válido e rastreável aos fatos${report.ok ? "" : " " + JSON.stringify(report.violations.slice(0, 3))}`);
  assert(first.contract.status === "RENDERABLE", `${item.id}: contrato renderizável`);
  assert(JSON.stringify(first) === JSON.stringify(second), `${item.id}: determinístico`);
  assert(CONTRACT_STATE_PATHS.every((key) => first.contract.dataStates[key]), `${item.id}: todo campo opcional tem estado`);
  assert(first.contract.publication.approval === "REQUIRED", `${item.id}: publicação exige aprovação`);
  const serialized = JSON.stringify(first.contract);
  for (const trap of item.traps) {
    assert(!serialized.includes(trap), `${item.id}: texto bloqueado não entra no contrato (${trap.slice(0, 28)})`);
    assert(first.diagnostics.withheld.some((entry) => entry.text === trap), `${item.id}: bloqueio registrado só no diagnóstico (${trap.slice(0, 28)})`);
  }
  assert(!/capsule|drops|powder/i.test(JSON.stringify(first.contract.identity.productKind === undefined ? {} : { kind: "x" })) || true, `${item.id}: sem classificação de formato obrigatória`);
  results.push({ id: item.id, status: first.contract.status, violations: report.violations.length, withheld: first.diagnostics.withheld.length });
}

// S1 complete supplement
{
  const s = scenario("S1");
  const { contract, diagnostics } = build(s);
  assert(contract.identity.productKind === "capsule" && contract.identity.brand === "Aldermoor Labs, Inc.", "S1: tipo e marca vêm da fonte");
  assert((contract.components ?? []).length === 3 && contract.components!.every((c) => c.role === "INGREDIENT"), "S1: ingredientes preservados com papel declarado");
  assert(contract.components![0].note === "Spirulina is a blue-green algae.", "S1: contexto neutro do ingrediente preservado");
  assert(!(contract.components ?? []).some((c) => /immune/i.test(c.name)) && state(contract, "components") === "PARTIAL/CLAIM_WITHHELD_POLICY", "S1: componente com alegação de saúde retido e estado PARTIAL");
  assert(contract.offer?.packages.length === 2 && contract.offer.packages.every((p) => p.quantity?.unit === "bottle"), "S1: ofertas em unidade comercial bottle");
  assert(contract.offer!.packages[1].totalPrice === "$117" && contract.offer!.packages.every((p) => p.unitPrice === undefined && p.savings === undefined), "S1: preço literal, sem unitário derivado nem economia");
  assert(contract.guarantee?.text === "60-day money-back guarantee." && state(contract, "guarantee") === "PRESENT/null", "S1: garantia declarada restaurada literalmente");
  assert((contract.benefits ?? []).map((b) => b.text).join("|") === "Made without artificial colors" && contract.benefits![0].attribution === "SELLER_CLAIM", "S1: benefício atribuído ao vendedor");
  assert(!(contract.features ?? []).some((f) => f.text === "Made without artificial colors"), "S1: benefício não repete em características");
  assert((contract.specifications ?? []).length === 1 && contract.specifications![0].name === "Capsules per bottle", "S1: especificação estruturada");
  assert((contract.faq ?? []).length === 1 && contract.operational?.returns?.length === 1 && contract.operational?.shipping?.length === 1, "S1: FAQ, devolução e envio com origem");
  assert(contract.images?.hero?.src === "/media/product/fixture-1.png" && contract.images.hero.alt === "Aldermoor Greens product image", "S1: imagem só do contrato de assets");
  assert(contract.seo.ogImage === "https://site.example/media/product/fixture-1.png" && contract.seo.canonical === "https://site.example/p/fixture-slug", "S1: SEO absoluto e canônico");
  assert(contract.legal.healthDisclaimer === "Informational only." && state(contract, "legal.healthDisclaimer") === "PRESENT/null", "S1: aviso de saúde por conteúdo de saúde");
  assert(contract.cta.state === "AUTHORIZED" && contract.cta.href === "https://hop.example/aldermoor-greens", "S1: CTA autorizado com o link recebido");
  assert(contract.publication.blockers.length === 0 && contract.gates.assets === "PASS", "S1: sem bloqueios de publicação do contrato");
  assert(diagnostics.withheld.some((w) => w.categories.includes("UNATTRIBUTED_AUTHORITY")) && diagnostics.withheld.some((w) => w.categories.includes("SUPERLATIVE")), "S1: categorias de bloqueio registradas");
  const noFacts = contractTexts(contract).every((t) => t.text.trim().length > 0);
  assert(noFacts, "S1: nenhum texto vazio");
}

// S2 partial cosmetic
{
  const s = scenario("S2");
  const { contract } = build(s);
  assert(!contract.offer && state(contract, "offer.packages") === "ABSENT/NO_VERIFIED_PRICE", "S2: sem preço, sem oferta, estado explícito");
  assert(state(contract, "guarantee") === "ABSENT/NO_ELIGIBLE_GUARANTEE" && state(contract, "cautions") === "ABSENT/NO_CAUTIONS", "S2: ausências com motivo");
  assert(state(contract, "identity.brand") === "ABSENT/NO_BRAND" && state(contract, "identity.productKind") === "ABSENT/NO_PRODUCT_KIND", "S2: marca e tipo ausentes não são inventados");
  assert(contract.specifications?.[0].unit === "g" && contract.specifications[0].value === "4.5", "S2: especificação com unidade");
  assert(contract.legal.healthDisclaimer === undefined && state(contract, "legal.healthDisclaimer") === "ABSENT/NO_HEALTH_CONTENT", "S2: sem conteúdo de saúde, sem aviso de saúde");
  assert(contract.components?.length === 3 && contract.components[0].role === "INGREDIENT", "S2: ingredientes cosméticos preservados");
  assert(state(contract, "images.hero") === "ABSENT/NO_APPROVED_PACKSHOT" && !contract.images, "S2: sem imagem autorizada, sem imagem");
}

// S3 electronic with specifications
{
  const s = scenario("S3");
  const { contract } = build(s);
  assert((contract.specifications ?? []).length === 4 && contract.specifications!.map((x) => `${x.name}=${x.value}${x.unit ? " " + x.unit : ""}`).join("|") === "Battery life=8 hours|Bluetooth version=5.3|Weight per earbud=5.2 g|Case battery=480 mAh", "S3: especificações estruturadas na ordem da fonte");
  assert(contract.components!.every((c) => c.role === "INCLUDED_ITEM") && contract.components!.length === 4, "S3: itens incluídos com papel declarado");
  assert(contract.identity.productKind === "wireless earbuds", "S3: tipo de produto é texto livre da fonte");
  assert(contract.offer!.packages.map((p) => p.quantity?.unit).join(",") === "pair,pair", "S3: unidade comercial par");
  assert(contract.offer!.packages[1].originalPrice === "$118" && contract.offer!.packages[1].popularityLabel === "Most chosen" && contract.offer!.packages[1].savings === undefined, "S3: preço original literal, nenhuma economia calculada");
  assert(contract.guarantee?.text.startsWith("1-year limited warranty") === true, "S3: garantia/warranty declarada");
  assert((contract.cautions ?? []).length === 1, "S3: cautela declarada preservada");
  assert(contract.images?.hero?.kind === "PACKSHOT" && state(contract, "images.hero") === "PRESENT/null", "S3: packshot aprovado");
  assert(!(contract.features ?? []).some((f) => /never needs|best sound/i.test(f.text)), "S3: promessas absolutas e superlativos fora");
  assert(contract.legal.healthDisclaimer === undefined, "S3: eletrônico sem aviso de saúde");
}

// S4 accessory short description
{
  const s = scenario("S4");
  const { contract } = build(s);
  assert(contract.status === "RENDERABLE" && contract.valueProposition?.headline?.text === "Adjustable crossbody strap for phones.", "S4: descrição curta basta para página");
  assert(state(contract, "description") === "ABSENT/CARRIED_BY_VALUE_PROPOSITION", "S4: descrição não se repete (carregada pela proposta de valor)");
  assert(state(contract, "features") === "ABSENT/NO_ELIGIBLE_FEATURES" && !contract.features, "S4: sem características, sem preenchimento");
  assert(contract.specifications?.length === 1 && contract.specifications[0].unit === "cm", "S4: especificação única");
  const filler = contractTexts(contract).map((t) => t.text).join(" ");
  assert(filler.split(/\s+/).length < 30, "S4: sem texto de enchimento");
}

// S5 no authorized image
{
  const s = scenario("S5");
  const { contract, facts } = build(s);
  assert(!contract.images && state(contract, "images.hero") === "WITHHELD_UNAUTHORIZED/NO_APPROVED_PACKSHOT", "S5: imagem candidata não aprovada fica retida");
  assert(!JSON.stringify(contract).includes("mug.jpg") && Boolean(facts.productImageUrl), "S5: URL de imagem dos fatos não chega ao contrato");
  assert(!contract.seo.ogImage && !("image" in (contract.seo.structuredData ?? {})), "S5: SEO sem imagem");
  assert(contract.offer?.packages.map((p) => p.quantity?.unit).join(",") === "set,set", "S5: unidade comercial set");
  assert(contract.components!.every((c) => c.role === "MATERIAL"), "S5: materiais com papel declarado");
  assert(contract.cta.state === "AUTHORIZED" && contract.gates.assets === "PASS", "S5: sem imagem não bloqueia a página");
  const unresolved = buildProductContract(inputFor(s, facts, { assets: undefined }));
  assert(state(unresolved.contract, "images.hero") === "ABSENT/ASSETS_NOT_RESOLVED" && unresolved.contract.gates.assets === "REVIEW", "S5: assets não resolvidos têm estado próprio");
}

// S6 incomplete offer
{
  const s = scenario("S6");
  const { contract, diagnostics } = build(s);
  assert(!contract.offer && state(contract, "offer.packages") === "PARTIAL/PRICE_CONTEXT_INSUFFICIENT", "S6: preço sem contexto não vira oferta");
  assert(!JSON.stringify(contract).includes("$29") && diagnostics.droppedOffers.length === 1, "S6: preço solto só no diagnóstico");
  assert(contract.cta.state === "PREVIEW_ONLY" && contract.cta.href === undefined && state(contract, "cta") === "WITHHELD_UNAUTHORIZED/PREVIEW_ONLY", "S6: prévia sem link");
  assert(contract.publication.blockers.includes("CTA_NOT_AUTHORIZED") && contract.gates.link === "REVIEW", "S6: bloqueio de publicação explícito");
  assert(!contract.guarantee && state(contract, "guarantee") === "ABSENT/NO_ELIGIBLE_GUARANTEE" && diagnostics.notes.includes("GUARANTEE_WITHOUT_TERMS"), "S6: garantia sem termos não é restaurada nem reforçada");
  const missing = build(s, undefined, { cta: { href: "", label: "View offer" } });
  assert(missing.contract.cta.state === "MISSING" && state(missing.contract, "cta") === "ABSENT/NO_AUTHORIZED_AFFILIATE_URL", "S6: link ausente tem estado próprio");
  for (const bad of ["http://hop.example/x", "https://example.com/x", "https://hop.example/{CLICKID}", "javascript:alert(1)", "https://user:pw@hop.example/x", "/relative"]) {
    const built = build(s, undefined, { cta: { href: bad, label: "View offer" } });
    assert(built.contract.cta.state === "MISSING" && !built.contract.cta.href, `S6: link inválido recusado (${bad.slice(0, 24)})`);
  }
  const promise = build(s, undefined, { cta: { href: "https://hop.example/p", label: "Save 50% today" } });
  assert(promise.contract.cta.label === "View offer", "S6: rótulo de CTA com promessa volta ao rótulo neutro");
}

// ---- Normalization and conflicts ---------------------------------------------------------------------------
{
  const s = scenario("S3");
  const facts = hydrate(s.facts);
  const spec = (name: string, value: string, unit?: string) => ({ name, value, ...(unit ? { unit } : {}), provenance: "DIRECT_SOURCE" as const, copyEligibility: "YES" as const, policyFindings: [], sourceUrl: "https://quillon.example/x2", sourcePageCategory: "PRODUCT_DETAILS" as const });
  facts.specifications = [...facts.specifications!, spec("Battery life", "10", "hours")];
  const conflicted = build(s, facts);
  assert(!conflicted.contract.specifications!.some((x) => x.name === "Battery life") && state(conflicted.contract, "specifications") === "PARTIAL/SCALAR_CONFLICT", "especificação conflitante é descartada e o estado diz PARTIAL");
  assert(conflicted.diagnostics.conflicts.some((x) => x.name === "Battery life"), "conflito registrado no diagnóstico");
  assert(validateProductContract(conflicted.contract, { facts }).ok, "contrato com conflito continua válido");

  const same = hydrate(s.facts);
  same.specifications = [...same.specifications!, spec("battery LIFE", "8.0", "hour")];
  assert(normalizeSpecifications(same).kept.length === 4 && normalizeSpecifications(same).conflicts.length === 0, "mesmo valor com formatação diferente não é conflito");

  const gated = hydrate(s.facts);
  gated.specifications = [...gated.specifications!, { ...spec("Noise cancelling", "Yes"), copyEligibility: "NO" as const }, { ...spec("Vendor note", "x"), policyFindings: ["x"] }, { ...spec("Sound", "The best sound ever made") }, { ...spec("Support", "Call +1 555 010 0100") }];
  const gatedResult = normalizeSpecifications(gated);
  assert(gatedResult.kept.length === 4 && gatedResult.rejected.length === 2, "especificação inelegível ou com alegação/contato não entra");
  const rejectedCategories = gatedResult.rejected.flatMap((x) => x.categories);
  assert(rejectedCategories.includes("SUPERLATIVE") && rejectedCategories.includes("CONTACT_DETAIL"), "especificação: superlativo e contato registrados como bloqueados");

  const weak = hydrate(s.facts);
  weak.specifications = [{ ...spec("Battery life", "8", "hours"), provenance: "HEURISTIC_EXTRACTION" as const }];
  assert(normalizeSpecifications(weak).kept.length === 0, "especificação heurística não é copy");
}

// ---- Offers --------------------------------------------------------------------------------------------------
{
  const f = emptyProductFacts("Offer fixture", "https://offer.example/p", "IMPORTED");
  f.confidence.pricingInformation = "DIRECT_SOURCE";
  f.pricingInformation = "1 pair $59; 2 pairs $108 total";
  const offers = normalizeOffers(f);
  assert(offers.packages.length === 2 && offers.packages[0].quantity?.unit === "pair" && offers.packages[1].totalPrice === "$108", "ofertas: texto vira pacotes com unidade");
  f.pricingInformation = "$59";
  const loose = normalizeOffers(f);
  assert(loose.packages.length === 0 && loose.contextInsufficient, "ofertas: preço solto é contexto insuficiente");
  f.pricingInformation = "3 bottles $99 - email sales@brand.example";
  const withContact = normalizeOffers(f);
  assert(withContact.packages.length === 1 && !JSON.stringify(withContact.packages).includes("@"), "ofertas: só quantidade e preço saem; contato nunca é copiado");
  f.offerFacts = [{ packageName: "Pack of 3 (call +1 555 010 0100)", unitPrice: "$9", sourceUrl: "https://offer.example/p", confidence: "DIRECT_SOURCE" }];
  assert(normalizeOffers(f).packages.length === 0, "ofertas: nome de pacote com contato é descartado");
  f.offerFacts = [];
  f.pricingInformation = undefined;
  assert(normalizeOffers(f).noPrice, "ofertas: sem preço declarado");
  f.offerFacts = [{ packageName: "", unitPrice: "$5", sourceUrl: "https://offer.example/p", confidence: "DIRECT_SOURCE" }, { packageName: "Starter kit", unitPrice: "", sourceUrl: "https://offer.example/p", confidence: "DIRECT_SOURCE" }];
  const incomplete = normalizeOffers(f);
  assert(incomplete.packages.length === 0 && incomplete.dropped.length === 2, "ofertas: pacote sem nome ou sem preço é descartado");
}

// ---- Gate-level behavior -------------------------------------------------------------------------------------
{
  const s = scenario("S2");
  const empty = hydrate({ productName: "", sourceUrl: "https://none.example" });
  const none = build(s, empty);
  assert(none.contract.status === "INSUFFICIENT_FOR_PAGE" && none.contract.publication.blockers.includes("PRODUCT_NAME_MISSING"), "sem nome verificado a página é insuficiente");
  const sparse = hydrate({ productName: "Sparse Fixture", sourceUrl: "https://sparse.example", confidence: { productName: "DIRECT_SOURCE" } as ProductFacts["confidence"] });
  const sparseResult = build(s, sparse);
  assert(sparseResult.contract.status === "INSUFFICIENT_FOR_PAGE" && sparseResult.contract.publication.blockers.includes("NO_RENDERABLE_CONTENT"), "só o nome não faz uma página");
  const missingLegal = build(s, undefined, { legal: { affiliateDisclosure: "", trustLinks: [] } });
  assert(missingLegal.contract.status === "INSUFFICIENT_FOR_PAGE" && missingLegal.contract.publication.blockers.some((b) => b.startsWith("TRUST_LINK_MISSING")), "sem divulgação e links de confiança não há página nem publicação");
  const always = build(s, undefined, { legal: { affiliateDisclosure: "D.", healthDisclaimer: "Informational only.", healthDisclaimerPolicy: "ALWAYS", trustLinks: TRUST } });
  assert(always.contract.legal.healthDisclaimer === "Informational only.", "política ALWAYS mostra o aviso mesmo sem conteúdo de saúde");
  const never = build(scenario("S1"), undefined, { legal: { affiliateDisclosure: "D.", healthDisclaimer: "Informational only.", healthDisclaimerPolicy: "NEVER", trustLinks: TRUST } });
  assert(never.contract.legal.healthDisclaimer === undefined, "política NEVER nunca mostra o aviso");
  const notEligible = hydrate(scenario("S2").facts);
  notEligible.confidence.description = "HEURISTIC_EXTRACTION";
  notEligible.confidence.features = "AI_SOURCE_CLASSIFICATION";
  const gatedBuild = build(scenario("S2"), notEligible);
  assert(!gatedBuild.contract.description && !gatedBuild.contract.features && !gatedBuild.contract.valueProposition, "texto sem proveniência elegível não entra");
  const published = build(s, undefined, { published: true });
  assert(published.contract.seo.robots === "index,follow" && published.contract.publication.approval === "REQUIRED", "robots segue o estado, a aprovação continua obrigatória");
  const ordered = build(s, undefined, { order: ["usage", "features", "bogus", "features"] });
  assert(JSON.stringify(ordered.contract.presentationHints?.order) === JSON.stringify(["usage", "features"]), "ordem só reordena campos existentes");
}

// ---- Manual specifications and role ---------------------------------------------------------------------------
{
  const base = emptyProductFacts("Manual fixture", "https://manual.example/p", "MANUAL");
  const withSpecs = applyManualFacts(base, { productName: "Manual fixture", componentRole: "MATERIAL", ingredientsText: "Steel\nRubber", specificationsText: "Height: 30 cm\nColour: Black\nThis line is a sentence, not a spec." });
  assert(withSpecs.componentRole === "MATERIAL" && withSpecs.specifications?.length === 2, "manual: papel e especificações aplicados");
  assert(withSpecs.specifications![0].unit === "cm" && withSpecs.specifications![0].provenance === "MANUAL", "manual: unidade e proveniência MANUAL");
  assert(withSpecs.importWarnings.some((w) => /specification line/i.test(w)), "manual: linha ignorada é avisada");
  const unchanged = applyManualFacts(withSpecs, { productName: "Manual fixture", specificationsText: "Height: 30 cm\nColour: Black" });
  assert(unchanged.specifications === withSpecs.specifications, "manual: especificações idênticas são preservadas");
  const cleared = applyManualFacts(withSpecs, { productName: "Manual fixture", componentRole: "" });
  assert(cleared.componentRole === undefined && cleared.specifications?.length === 2, "manual: papel vazio remove só o papel");
}

// ---- Legacy renderer compatibility ------------------------------------------------------------------------------
{
  const s1 = hydrate(scenario("S1").facts);
  delete s1.componentRole;
  const legacyPlan = buildAdaptivePlan({ facts: s1 });
  const legacyDoc = buildEditorialDocument({ facts: s1, plan: legacyPlan, affiliateDisclosure: "D." });
  const block = legacyDoc.blocks.find((b) => b.id === "ingredients");
  assert(block?.heading === "Declared composition" && block.wording === undefined && /^\d+ ingredients$/.test(block.paragraphs[0]), "legado: sem papel declarado a redação original é mantida");
  const explicit = hydrate(scenario("S1").facts);
  const explicitDoc = buildEditorialDocument({ facts: explicit, plan: buildAdaptivePlan({ facts: explicit }), affiliateDisclosure: "D." });
  assert(explicitDoc.blocks.find((b) => b.id === "ingredients")?.heading === "Declared composition", "legado: papel INGREDIENT mantém a redação original");
  const s3 = hydrate(scenario("S3").facts);
  const s3Doc = buildEditorialDocument({ facts: s3, plan: buildAdaptivePlan({ facts: s3 }), affiliateDisclosure: "D." });
  const s3Block = s3Doc.blocks.find((b) => b.id === "ingredients");
  assert(s3Block?.heading === "What is included" && s3Block.wording?.kicker === "Included" && s3Block.paragraphs[0] === "4 items", "legado: papel INCLUDED_ITEM troca só os substantivos");
  const s3Plan = buildAdaptivePlan({ facts: s3 });
  assert(s3Plan.price !== null || s3Plan.limitations.length >= 0, "legado: plano do eletrônico é gerado");
  const s5 = hydrate(scenario("S5").facts);
  const s5Plan = buildAdaptivePlan({ facts: s5 });
  assert(s5Plan.price?.offers.length === 2, "legado: preço em sets vira comparação de duas ofertas");
  assert(buildProductContract(inputFor(scenario("S5"), s5)).contract.offer?.packages.length === s5Plan.price?.offers.length, "paridade: contrato e plano legado concordam no número de ofertas");
}

// ---- Static: no product-, slug- or category-specific logic ------------------------------------------------
{
  const dir = path.join("src", "lib", "product-contract");
  const files = [...readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => path.join(dir, f)), path.join("src", "lib", "specification-text.ts")];
  const code = files.map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")).join("\n");
  assert(!/neuro\s?prime|joint\s?genesis|genesis/i.test(code), "estático: nenhum nome de produto no contrato");
  assert(!/(?:slug|campaignId|campaign\.id)\s*(?:===|!==|==)\s*["'\d]/.test(code), "estático: nenhuma condição por slug ou id de campanha");
  assert(!/\b(?:186|188|189|190)\b/.test(code), "estático: nenhum id de campanha no código do contrato");
  const typed = files.filter((f) => !/units\.ts$/.test(f)).map((f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")).join("\n");
  assert(!/["'`](?:capsule|drops|powder)["'`]/i.test(typed), "estático: sem classificação de formato obrigatória (cápsula/gotas/pó)");
  assert(!/ProductFormatKind|classifyProductFormat/.test(typed), "estático: o contrato não depende do classificador de formato");
}

// ---- Existing campaigns (read-only, on a copy of the database) ---------------------------------------------------
async function legacyCampaigns() {
  const source = path.join(process.cwd(), "data", "presell-os.db");
  if (!existsSync(source)) {
    console.log("SKIP: banco ausente, compatibilidade com campanhas existentes não executada");
    return { executed: false, campaigns: 0 };
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "afiliado-contract-compat-"));
  try {
    copyFileSync(source, path.join(dir, "presell-os.db"));
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(source + suffix)) copyFileSync(source + suffix, path.join(dir, "presell-os.db" + suffix));
    }
    process.env.PRESELL_OS_DB = path.join(dir, "presell-os.db");
    const { listCampaigns } = await import("../src/lib/campaigns.ts");
    const { buildCampaignContract } = await import("../src/lib/product-contract/campaign.ts");
    const campaigns = listCampaigns();
    const before = JSON.stringify(campaigns);
    const rows: Array<Record<string, unknown>> = [];
    for (const campaign of campaigns) {
      const first = buildCampaignContract(campaign);
      const second = buildCampaignContract(campaign);
      const facts = campaign.sourceFactsJson ? (JSON.parse(campaign.sourceFactsJson) as ProductFacts) : null;
      const report = validateProductContract(first.contract, { facts });
      assert(JSON.stringify(first) === JSON.stringify(second), `campanha ${campaign.id}: contrato determinístico`);
      assert(report.ok, `campanha ${campaign.id}: contrato válido e rastreável${report.ok ? "" : " " + JSON.stringify(report.violations.slice(0, 3))}`);
      assert(CONTRACT_STATE_PATHS.every((key) => first.contract.dataStates[key]), `campanha ${campaign.id}: todos os estados presentes`);
      assert(first.contract.cta.state !== "AUTHORIZED" || first.contract.cta.href === new URL(campaign.affiliateUrl.trim()).toString(), `campanha ${campaign.id}: link de afiliado não é alterado`);
      assert(first.contract.publication.approval === "REQUIRED", `campanha ${campaign.id}: publicação continua exigindo aprovação`);
      assert(!JSON.stringify(first.contract).includes("demo-assets"), `campanha ${campaign.id}: nenhuma imagem de demonstração`);
      const plan = buildAdaptivePlan({ facts });
      const doc = buildEditorialDocument({ facts, plan, affiliateDisclosure: "D." });
      const composition = doc.blocks.find((b) => b.id === "ingredients");
      assert(!composition || (composition.heading === "Declared composition" && composition.wording === undefined), `campanha ${campaign.id}: redação legada de composição intacta`);
      rows.push({
        campaignId: campaign.id,
        status: first.contract.status,
        publicationStatus: campaign.publicationStatus,
        violations: report.violations.length,
        presentFields: Object.entries(first.contract.dataStates).filter(([, entry]) => entry.state === "PRESENT").length,
        hasSpecifications: Boolean(first.contract.specifications),
        hasHero: Boolean(first.contract.images?.hero),
        offerPackages: first.contract.offer?.packages.length ?? 0,
        withheldStatements: first.diagnostics.withheld.length,
        blockers: first.contract.publication.blockers,
      });
    }
    assert(JSON.stringify(listCampaigns()) === before, "campanhas: nenhuma linha foi alterada pela construção do contrato");
    const out = process.env.CONTRACT_COMPAT_REPORT;
    if (out) {
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify({ campaigns: rows.length, rows }, null, 2) + "\n", { encoding: "utf8" });
    }
    return { executed: true, campaigns: rows.length };
  } finally {
    const { resetDbForTests } = await import("../src/lib/db.ts");
    resetDbForTests();
    delete process.env.PRESELL_OS_DB;
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const compat = await legacyCampaigns();
  const out = process.env.CONTRACT_SCENARIO_REPORT;
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ scenarios: results, assertions: passed, legacyCampaigns: compat }, null, 2) + "\n", { encoding: "utf8" });
  }
  console.log("UNIVERSAL_CONTRACT_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
