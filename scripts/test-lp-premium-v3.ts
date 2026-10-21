/**
 * Execution 46 - Premium V3 regression tests.
 *
 * Usage: npx tsx scripts/test-lp-premium-v3.ts [--probe <path-to-probe.json>] [--no-probe]
 * Needs the dev server on 127.0.0.1:3000 for the HTTP part.
 * Fictional products only. No product, slug or campaign specific rule is asserted.
 * Responsiveness is asserted from the real-browser probe written by capture-lp-premium-v2.ts.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { emptyProductFacts, type OperationalFact, type ProductFacts } from "../src/lib/product-facts.ts";
import { buildAdaptivePlan } from "../src/lib/product-showcase/adaptive-plan.ts";
import { buildEditorialDocument, editorialLead, type EditorialBlock, type EditorialDocument } from "../src/lib/product-showcase/editorial.ts";
import { DEFAULT_SECTION_ORDER, presentationGuidance } from "../src/lib/product-showcase/presentation-order.ts";
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

const SOURCE = "https://example.test/product";
const DISCLOSURE = "Disclosure: I may earn a commission if you purchase through links on this page.";

function base(name: string): ProductFacts {
  return emptyProductFacts(name, SOURCE, "IMPORTED");
}

function operational<K extends string>(kind: K, statement: string, eligible = true): OperationalFact<K> {
  return { statement, kind, provenance: "DIRECT_SOURCE", copyEligibility: eligible ? "YES" : "NO", policyFindings: [], sourceUrl: SOURCE, sourcePageCategory: "PRODUCT_DETAILS" };
}

function documentFor(facts: ProductFacts): EditorialDocument {
  const plan = buildAdaptivePlan({ facts });
  return buildEditorialDocument({ facts, plan, affiliateDisclosure: DISCLOSURE });
}

function block(document: EditorialDocument, id: EditorialBlock["id"]): EditorialBlock | undefined {
  return document.blocks.find((item) => item.id === id);
}

function allLines(document: EditorialDocument): string[] {
  return document.blocks.flatMap((item) => [...item.paragraphs, ...item.items]);
}

function occurrences(document: EditorialDocument, text: string): number {
  return allLines(document).filter((line) => line === text).length;
}

const OPERATIONAL_FIELDS = ["manufacturer", "shippingInformation", "returnsInformation"];

function introHasOnlyPropositionOrDescription(document: EditorialDocument): boolean {
  const intro = block(document, "introduction");
  if (!intro) return true;
  return intro.trace.every((item) => item.field === "productName" || (!OPERATIONAL_FIELDS.includes(item.field) && (item.role === "PROPOSITION" || item.role === "DESCRIPTION_AND_DIFFERENTIATORS")));
}

const SHIP = "Ships in a padded mailer.";
const RET = "Unopened items may be returned within 30 days.";
const SHIP2 = "Ships within two business days.";

// P1 shipping only
const p1 = base("Alpha Drink");
p1.shippingInformation = [operational("METHOD", SHIP)];
const p1Doc = documentFor(p1);
assert(editorialLead(block(p1Doc, "introduction")).lead === null, "P1 envio sozinho nao vira lead");
assert((block(p1Doc, "introduction")?.paragraphs ?? []).length === 0, "P1 introducao fica vazia");
assert(block(p1Doc, "fulfillment")?.paragraphs.includes(SHIP) === true && occurrences(p1Doc, SHIP) === 1, "P1 envio aparece uma vez em fulfillment");

// P2 manufacturer + shipping + returns, no guarantee, no description
const p2 = base("Beta Works Mist");
p2.manufacturer = "Beta Works";
p2.confidence.manufacturer = "DIRECT_SOURCE";
p2.returnsInformation = [operational("RETURN_WINDOW", RET)];
p2.shippingInformation = [operational("DELIVERY_ESTIMATE", SHIP2)];
const p2Doc = documentFor(p2);
assert(editorialLead(block(p2Doc, "introduction")).lead === null && introHasOnlyPropositionOrDescription(p2Doc), "P2 fabricante/envio/devolucao nao abrem a pagina");
assert(block(p2Doc, "provenance")?.paragraphs.join("|") === "Beta Works", "P2 fabricante em provenance");
assert(block(p2Doc, "fulfillment")?.paragraphs.includes(SHIP2) === true && block(p2Doc, "fulfillment")?.paragraphs.includes(RET) === true, "P2 devolucao sem garantia vai para fulfillment");
assert(block(p2Doc, "fulfillment")?.trace.find((item) => item.text === RET)?.role === "RETURNS", "P2 papel RETURNS");
assert(block(p2Doc, "provenance")?.trace[0]?.role === "IDENTITY_PROVENANCE" && block(p2Doc, "fulfillment")?.trace.find((item) => item.text === SHIP2)?.role === "FULFILLMENT", "P2 papeis de proveniencia e envio");

// P3 description + shipping
const p3 = base("Gamma Glass");
p3.confidence.description = "DIRECT_SOURCE";
p3.description = "A glass bottle with a measured cap.";
p3.shippingInformation = [operational("METHOD", SHIP)];
const p3Doc = documentFor(p3);
const p3Lead = editorialLead(block(p3Doc, "introduction"));
assert(p3Lead.lead === "A glass bottle with a measured cap." && p3Lead.summary.length === 0, "P3 descricao e o lead; envio fica fora");
assert(block(p3Doc, "introduction")?.trace.find((item) => item.text === p3Lead.lead)?.role === "PROPOSITION", "P3 lead tem papel PROPOSITION");
assert(block(p3Doc, "fulfillment")?.paragraphs.includes(SHIP) === true, "P3 envio em fulfillment");

// P4 guarantee + returns + shipping, no description
const p4 = base("Delta Tea");
p4.confidence.guaranteeInformation = "DIRECT_SOURCE";
p4.guaranteeInformation = "45-day refund";
p4.returnsInformation = [operational("RETURN_WINDOW", RET)];
p4.shippingInformation = [operational("METHOD", SHIP)];
const p4Doc = documentFor(p4);
assert(editorialLead(block(p4Doc, "introduction")).lead === null && introHasOnlyPropositionOrDescription(p4Doc), "P4 sem proposicao, sem lead");
assert(block(p4Doc, "guarantee")?.paragraphs.includes(RET) === true && !block(p4Doc, "fulfillment")?.paragraphs.includes(RET), "P4 devolucao fica no bloco de garantia");
assert(block(p4Doc, "fulfillment")?.paragraphs.includes(SHIP) === true && !block(p4Doc, "provenance"), "P4 envio em fulfillment, sem fabricante");

// Eligibility and contact never survive; every eligible fact appears once
const p5 = base("Epsilon Oil");
p5.manufacturer = "Support Email:\nhelp@epsilon.test\nEpsilon Labs";
p5.confidence.manufacturer = "DIRECT_SOURCE";
p5.shippingInformation = [operational("METHOD", SHIP), operational("OTHER", "Ships from a warehouse that nobody verified.", false)];
const p5Doc = documentFor(p5);
const p5Text = allLines(p5Doc).join(" ");
assert(block(p5Doc, "provenance")?.paragraphs.join("|") === "Epsilon Labs" && !p5Text.includes("help@epsilon.test"), "fabricante sem contato");
assert(!p5Text.includes("nobody verified") && occurrences(p5Doc, SHIP) === 1, "fato nao elegivel fora, elegivel uma vez");

// No invented claims: every traced line is a verbatim fact or a fixed label
const FIXED = new Set(["Declared by the product source", DISCLOSURE]);
function tracedLinesAreFacts(document: EditorialDocument, facts: ProductFacts): boolean {
  const haystack = JSON.stringify(facts);
  return document.blocks.every((item) => item.trace.every((entry) => {
    if (["productName", "affiliateDisclosure", "healthDisclaimer"].includes(entry.field)) return true;
    if (/^\d+ ingredients$/.test(entry.text)) return true;
    return FIXED.has(entry.text) || haystack.includes(entry.text);
  }));
}
for (const [label, facts, doc] of [["P1", p1, p1Doc], ["P2", p2, p2Doc], ["P3", p3, p3Doc], ["P4", p4, p4Doc], ["P5", p5, p5Doc]] as const) {
  assert(tracedLinesAreFacts(doc, facts), `${label} toda linha rastreada vem de fato`);
}
const ALLOWED_BLOCKS = new Set(["introduction", "format", "ingredients", "characteristics", "usage", "price", "guarantee", "important", "provenance", "fulfillment", "disclosure"]);
assert([p1Doc, p2Doc, p3Doc, p4Doc, p5Doc].every((doc) => doc.blocks.every((item) => ALLOWED_BLOCKS.has(item.id))), "nenhum bloco FAQ, prova ou depoimento e gerado");
const nothing = documentFor(base("Zeta Nothing"));
assert(nothing.blocks.map((item) => item.id).join(",") === "introduction,disclosure", "produto sem fatos so tem nome e divulgacao");

// Strategy integration: deterministic ordering only, never copy, never facts
const defaultOrder = DEFAULT_SECTION_ORDER.join(">");
assert(presentationGuidance(null).basis === "default" && presentationGuidance(undefined).order.join(">") === defaultOrder, "sem estrategia: ordem padrao");
assert(presentationGuidance("unknown_approach").order.join(">") === defaultOrder && presentationGuidance("unknown_approach").basis === "default", "abordagem desconhecida: ordem padrao");
const guide = presentationGuidance("buyer_guide");
assert(guide.basis === "strategy-approach" && guide.order.join(">") === "composition>details>offers>usage", "abordagem de decisao antecipa a oferta");
assert(presentationGuidance("COMPARISON").order.join(">") === guide.order.join(">"), "comparacao usa a mesma ordem de decisao");
assert(new Set(guide.order).size === DEFAULT_SECTION_ORDER.length && DEFAULT_SECTION_ORDER.every((key) => guide.order.includes(key)), "reordenar nunca remove nem duplica secoes");
const guideKeys = Object.keys(guide).sort().join(",");
assert(guideKeys === "approach,basis,order", "a orientacao carrega so ordem, sem texto");

// Source contracts
const root = process.cwd();
const dispatch = readFileSync(path.join(root, "src/components/product-showcase/product-showcase-premium-v1.tsx"), "utf8");
const componentPath = path.join(root, "src/components/product-showcase/product-showcase-premium-v3.tsx");
const component = readFileSync(componentPath, "utf8");
assert(/model\.editorial && model\.adaptivePlan/.test(dispatch) && dispatch.includes("<PremiumV3"), "dispatch usa V3 quando ha editorial e plano");
assert(component.includes('data-design="premium-v3"') && component.includes("editorialLead("), "renderer V3 marca o design e usa o lead por papel");
assert(!/index === 0 \? "psp-lead"/.test(component) && /data-role="lead"/.test(component) && /view\.lead \?/.test(component), "lead so existe quando ha proposicao");
assert(!/faq/i.test(component), "renderer V3 nao renderiza FAQ sem fonte fundamentada");
const componentCode = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
assert(!/testimonial|rating|stars|countdown|urgency|only \d+ left|% off/i.test(componentCode), "sem prova social, urgencia ou desconto inventados");
assert(component.includes("psp-hero-editorial") && component.includes("psp-names"), "ganchos do contrato V1 preservados");
assert(!/LpQuality|data-lp-quality-gate|data-editorial-depth/.test(component), "renderer sem painel de diagnostico");
assert(component.includes("ctaPreview") && component.includes("data-cta-placeholder") && /disabled/.test(component) && !/href=\{[^}]*placeholder/i.test(component), "placeholder de CTA desabilitado, so em preview, sem href");
assert(/ctaPreview \?/.test(component), "placeholder condicionado a ctaPreview");
assert(!/<img[^>]*src=["'][^"']*(logo|manufacturer)/i.test(component), "sem logotipo de fabricante inventado");
const cssPath = path.join(root, "src/app/product-showcase-v3.css");
const css = readFileSync(cssPath, "utf8");
const hardcoded = /neuroprime|cholibrium|northwind-qa|campanha-testes|campaign-?\d{3}/i;
assert(!hardcoded.test(component) && !hardcoded.test(css) && !hardcoded.test(readFileSync(path.join(root, "src/lib/product-showcase/presentation-order.ts"), "utf8")) && !hardcoded.test(readFileSync(path.join(root, "src/lib/product-showcase/editorial.ts"), "utf8")), "sem regra por produto, campanha ou slug");
const selectorLines = css.split(/\r?\n/).filter((line) => /^\s*[.#][^;{}]*[,{]\s*$/.test(line));
assert(selectorLines.length > 40 && selectorLines.every((line) => line.includes('data-design="premium-v3"')), "todo seletor V3 e escopado em data-design");
assert(/min-width: 560px/.test(css) && /min-width: 768px/.test(css) && /min-width: 960px/.test(css), "CSS cobre mobile, tablet e desktop");
assert(/prefers-reduced-motion/.test(css) && /focus-visible/.test(css), "foco visivel e movimento reduzido");
assert(!/(?:^|\W)(?:animation|transition)[^;]*infinite/.test(css), "sem animacao infinita decorativa");
const landing = readFileSync(path.join(root, "src/components/presell/showcase-landing.tsx"), "utf8");
assert(landing.includes("ctaPreview={disableAffiliateNavigation}"), "placeholder liga so com navegacao de afiliado desabilitada");
const publicPage = path.join(root, "src/app/p/[slug]/page.tsx");
if (existsSync(publicPage)) {
  const source = readFileSync(publicPage, "utf8");
  assert(!/ctaPreview|disableAffiliateNavigation/.test(source), "rota publica nunca ativa o placeholder");
}
assert(!!getCampaignById(190), "campanha de referencia existe para os testes HTTP");

// ---------- HTTP ----------

const BASE = "http://127.0.0.1:3000";

async function page(route: string): Promise<{ status: number; html: string }> {
  const response = await fetch(`${BASE}${route}`, { signal: AbortSignal.timeout(120_000) });
  return { status: response.status, html: await response.text() };
}

function section(html: string, pattern: RegExp): string {
  return html.match(pattern)?.[1] ?? "";
}

const hero = (html: string) => section(html, /<section class="psp3-top" id="psp-top">([\s\S]*?)<\/section>/);
const orderDetails = (html: string) => section(html, /<section[^>]*data-role="order-details"[^>]*>([\s\S]*?)<\/section>/);
const count = (html: string, pattern: RegExp) => (html.match(pattern) ?? []).length;

async function httpChecks() {
  const ref = await page("/visual-frame/neuroprime");
  assert(ref.status === 200 && /data-design="premium-v3"/.test(ref.html), "referencia renderiza V3");
  assert(count(ref.html, /<h1[ >]/g) === 1, "um unico h1");
  const navHtml = section(ref.html, /<nav class="psp-nav"[^>]*>([\s\S]*?)<\/nav>/);
  const navLabels = [...navHtml.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((match) => match[1]);
  assert(["Ingredients", "Format", "Use", "Guarantee"].every((label) => navLabels.includes(label)), "navegacao mantem os rotulos que o quality gate espera");
  for (const [label, id] of [["Ingredients", "psp-ingredients"], ["Format", "psp-format"], ["Use", "psp-usage"], ["Price", "psp-price"], ["Guarantee", "psp-guarantee"]] as const) {
    assert(count(ref.html, new RegExp(`id="${id}"`, "g")) === 1, `ancora ${label} existe uma vez`);
    assert(navLabels.includes(label) && new RegExp(`href="#${id}"`).test(navHtml), `navegacao ${label} aponta para a ancora`);
  }
  assert(/data-lead="0"/.test(ref.html) && !/data-role="lead"/.test(ref.html), "sem proposicao comprovada, sem lead");
  assert(!/shipping/i.test(hero(ref.html)) && /shipping/i.test(orderDetails(ref.html)), "envio fora do hero e em order details");
  assert(/data-cta="preview-disabled"/.test(ref.html) && /data-cta-placeholder/.test(hero(ref.html)), "sem destino autorizado: CTA desabilitado em preview");
  assert(count(ref.html, /class="psp-cta"/g) === 0, "nenhum link de afiliado inventado");
  const placeholder = ref.html.match(/<button[^>]*data-cta-placeholder[^>]*>/)?.[0] ?? "";
  assert(/disabled/.test(placeholder) && /aria-disabled="true"/.test(placeholder) && !/href=/.test(placeholder), "placeholder sem href, desabilitado e acessivel");
  assert(/Disclosure:/.test(hero(ref.html)), "divulgacao de afiliado visivel no hero");
  assert(!/faq|frequently asked/i.test(section(ref.html, /(<article[\s\S]*<\/article>)/)), "sem FAQ sem fonte fundamentada");
  assert(/psp-hero-editorial/.test(ref.html) && /psp-names/.test(ref.html), "contrato V1 no HTML");
  assert(!/official image not available|NO_APPROVED_PACKSHOT|PRICE_CONTEXT_INSUFFICIENT|PPC_PROHIBITED/i.test(ref.html), "sem texto tecnico");
  assert(!/psp-hero-media/.test(ref.html), "sem imagem, sem midia vazia");
  assert(!/countdown|only \d+ left|limited time|testimonial|\d(\.\d)? ?\/ ?5 stars|verified buyer/i.test(ref.html), "sem urgencia, contador, avaliacao ou depoimento");
  const domOrder = (ref.html.match(/data-order="([^"]*)"/)?.[1] ?? "").replace(/&gt;/g, ">");
assert(domOrder === "composition>usage>offers", "sem estrategia, ordem padrao declarada no DOM");
const domIndex = (id: string) => ref.html.indexOf(`id="${id}"`);
assert(domIndex("psp-ingredients") < domIndex("psp-usage") && domIndex("psp-usage") < domIndex("psp-price"), "ordem real do DOM segue a ordem declarada");

  const operationalCase = await page("/admin/lab/homologation/operational");
  assert(operationalCase.status === 200 && /data-lead="0"/.test(operationalCase.html) && !/data-role="lead"/.test(operationalCase.html), "somente fatos operacionais: sem lead, apresentacao neutra");
  assert(!/Harbor Works|ship within|returned within/i.test(hero(operationalCase.html)), "fabricante, envio e devolucao fora do hero");
  const details = orderDetails(operationalCase.html);
  assert(/Harbor Works/.test(details) && /ship within two business days/.test(details) && /returned within 30 days/.test(details), "fabricante, envio e devolucao em order details");
  assert(/Manufacturer/.test(details) && /Shipping/.test(details) && /Returns/.test(details), "linhas operacionais rotuladas pelo fato");
  assert(/<h1[^>]*>Harbor Tonic<\/h1>/.test(operationalCase.html), "h1 com o nome do produto");
  assert(/data-role="limited-note"/.test(operationalCase.html), "estado vazio elegante para pouca informacao");

  const described = await page("/admin/lab/homologation/described");
  assert(/data-lead="1"/.test(described.html) && />A bottled herbal tonic\.</.test(hero(described.html)), "descricao comprovada vira lead");
  assert(!/Harbor Works|ship within/i.test(hero(described.html)), "com descricao, operacional continua fora do hero");
  assert(/data-role="returns"/.test(described.html) && !/returned within/.test(orderDetails(described.html)), "devolucao com garantia fica no cartao de garantia");

  const capsule = await page("/admin/lab/homologation/capsule");
  assert(/data-cta="authorized"/.test(capsule.html) && count(capsule.html, /class="psp-cta"/g) === 1, "CTA autorizado: exatamente um");
  assert(/<a class="psp-cta" href="https:\/\/hop\.example\/northwind"/.test(capsule.html), "CTA aponta para o destino autorizado");
  assert(/psp-hero-figure/.test(hero(capsule.html)) && /<img[^>]*alt="[^"]+"/.test(hero(capsule.html)), "imagem aprovada com alt no hero");
  assert(/data-has-image="1"/.test(capsule.html) && /data-fact="format"/.test(capsule.html), "com imagem, fatos comprovados na faixa abaixo do hero");
  assert(!/data-cta-placeholder/.test(capsule.html), "sem placeholder quando ha CTA");

  const thin = await page("/admin/lab/homologation/thin");
  assert(thin.status === 200 && !/psp3-composition|psp3-offers|psp3-assurance|psp3-details/.test(thin.html) && /data-role="limited-note"/.test(thin.html), "produto sem profundidade: sem secoes vazias");
  assert(/data-cta="preview-disabled"/.test(thin.html) && /psp3-panel|data-panel="graphic"/.test(thin.html), "sem imagem: apresentacao tipografica neutra, sem embalagem inventada");

  for (const route of ["/admin/lab/homologation/few", "/admin/lab/product-showcase/cholibrium", "/admin/lab/product-showcase/northwind-qa", "/admin/lab/product-showcase/campanha-testes"]) {
    const result = await page(route);
    assert(result.status === 200 && /data-design="premium-v3"/.test(result.html) && /data-editorial="1"/.test(result.html), `${route} renderiza V3 sem migrar template`);
  }
  for (const slug of ["neuroprime", "cholibrium", "campanha-testes", "northwind-qa"]) {
    const result = await page(`/p/${slug}`);
    assert(result.status === 404, `/p/${slug} continua 404 (publicacao intacta)`);
  }
  for (const id of [186, 188, 189, 190]) {
    const campaign = getCampaignById(id);
    assert(!!campaign && campaign.publicationStatus === "draft", `campanha ${id} segue em draft`);
  }
  assert(getCampaignById(190)?.presentationTemplate === "PRODUCT_SHOWCASE_PREMIUM_V1", "template persistido da referencia intacto");
}

// ---------- Real browser probe ----------

type ProbeResult = {
  label: string;
  /** The probe records the measured browser viewport object. */
  viewport: { width: number; height: number };
  status: number;
  horizontalOverflow: boolean;
  overflowingElements: string[];
  clippedText: string[];
  brokenImages: string[];
  smallTapTargets: string[];
  h1: { contrast: number | null; fontSizePx: number } | null;
  lead: { role: string | null } | null;
  cta: { placeholder: boolean; ariaDisabled: string | null; href: string | null; height: number; insideFirstViewport: boolean } | null;
  disclosure: { contrast: number | null } | null;
  dataDesign: string | null;
};

function probeChecks(file: string) {
  const data = JSON.parse(readFileSync(file, "utf8")) as { results: ProbeResult[]; lighthouse: string };
  const results = data.results;
  assert(results.length >= 30, `probe real com ${results.length} capturas (10 alvos x 3 viewports)`);
  assert(data.lighthouse === "NOT_RUN", "Lighthouse nao foi executado");
  for (const [name, width] of [["desktop", 1440], ["tablet", 768], ["mobile", 390]] as const) {
    assert(new Set(results.filter((item) => item.viewport.width === width).map((item) => item.label)).size >= 10, `viewport ${name} (${width}px) cobre todos os alvos`);
  }
  // The Next.js dev overlay adds a skip link that does not exist in production.
  const devOverlay = /left-ds-16/;
  const bad = (predicate: (item: ProbeResult) => boolean) => results.filter(predicate).map((item) => `${item.label}@${item.viewport.width}`);
  assert(bad((item) => item.status !== 200 || item.dataDesign !== "premium-v3").length === 0, "todas as capturas renderizam V3 com status 200");
  assert(bad((item) => item.horizontalOverflow || item.overflowingElements.length > 0).length === 0, "sem overflow horizontal em desktop, tablet e mobile");
  assert(bad((item) => item.clippedText.length > 0).length === 0, "sem texto cortado");
  assert(bad((item) => item.brokenImages.length > 0).length === 0, "sem imagem quebrada");
  assert(bad((item) => item.smallTapTargets.some((entry) => !devOverlay.test(entry))).length === 0, "alvos de toque com pelo menos 44px");
  assert(bad((item) => (item.h1?.contrast ?? 0) < 4.5).length === 0, "contraste do h1 >= 4.5");
  assert(bad((item) => item.disclosure === null || (item.disclosure.contrast ?? 0) < 4.5).length === 0, "divulgacao visivel com contraste >= 4.5");
  assert(bad((item) => item.lead !== null && item.lead.role !== "lead").length === 0, "todo lead carrega o papel lead");
  assert(bad((item) => item.cta === null || item.cta.height < 44 || !item.cta.insideFirstViewport).length === 0, "CTA ou placeholder acessivel (>=44px) na primeira dobra");
  assert(bad((item) => item.cta !== null && item.cta.placeholder && (item.cta.href !== null || item.cta.ariaDisabled !== "true")).length === 0, "placeholder nunca tem href e e aria-disabled");
  assert(bad((item) => item.cta !== null && !item.cta.placeholder && !item.cta.href).length === 0, "CTA real sempre tem destino");
}

async function main() {
  await httpChecks();
  const args = process.argv.slice(2);
  if (args.includes("--no-probe")) {
    console.log("PROBE_SKIPPED");
  } else {
    const flag = args.indexOf("--probe");
    const file = flag >= 0 ? path.resolve(args[flag + 1]) : path.join(root, "data/evidence/lp-premium-v3/after/probe.json");
    assert(existsSync(file), `probe existe: ${path.relative(root, file)}`);
    probeChecks(file);
  }
  console.log("LP_PREMIUM_V3_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
