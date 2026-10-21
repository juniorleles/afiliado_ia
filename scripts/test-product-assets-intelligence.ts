/**
 * Execution 47A - Product Assets Intelligence tests.
 *
 * Fictional products and synthetic image bytes only, no network. The last block reads the
 * local database (read-only) to check the real campaigns, and is skipped when they are absent.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import type { OfficialPromoAsset } from "../src/lib/official-assets/store.ts";
import { permissionEvidence } from "../src/lib/official-assets/review.ts";
import { buildProductAssetsContract, evaluateCandidates, normalizedAssetUrl, showcaseImageFromContract } from "../src/lib/product-assets/evaluate.ts";
import { candidateFromLegacyHero, candidateFromOfficialRow, declaredHostsFrom, officialHostsFrom } from "../src/lib/product-assets/from-official.ts";
import { distinctiveTokens, matchProduct } from "../src/lib/product-assets/match.ts";
import { fetchAndMeasure, measureBytes, readAvifDimensions, validateTechnical, type FetchLike } from "../src/lib/product-assets/technical.ts";
import type { EvaluationContext, MeasuredImage, ProductAssetCandidate } from "../src/lib/product-assets/types.ts";
import { assessAuthorization } from "../src/lib/product-assets/authorization.ts";
import { adaptLandingToShowcase as adaptModel } from "../src/lib/product-showcase/adapt.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

// ---------- synthetic image bytes ----------

function pad(buffer: Buffer, size = 512): Buffer {
  return buffer.length >= size ? buffer : Buffer.concat([buffer, Buffer.alloc(size - buffer.length, 7)]);
}

function png(width: number, height: number, salt = 0): Buffer {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  const body = pad(head);
  body[600 % body.length] = salt;
  return Buffer.concat([body, Buffer.from([salt, salt, salt])]);
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.alloc(19);
  sof[0] = 0xff;
  sof[1] = 0xc0;
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return pad(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]));
}

function webp(width: number, height: number): Buffer {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(32, 4);
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return pad(b);
}

function gif(): Buffer {
  const b = Buffer.alloc(40);
  b.write("GIF89a", 0, "ascii");
  b.writeUInt16LE(600, 6);
  b.writeUInt16LE(600, 8);
  return pad(b);
}

function box(type: string, content: Buffer): Buffer {
  const out = Buffer.alloc(8 + content.length);
  out.writeUInt32BE(8 + content.length, 0);
  out.write(type, 4, "ascii");
  content.copy(out, 8);
  return out;
}

function avif(width: number, height: number): Buffer {
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("avif"), Buffer.alloc(4), Buffer.from("avifmif1")]));
  const ispeBody = Buffer.alloc(12);
  ispeBody.writeUInt32BE(width, 4);
  ispeBody.writeUInt32BE(height, 8);
  const meta = box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", box("ispe", ispeBody)))]));
  return pad(Buffer.concat([ftyp, meta]));
}

function html(): Buffer {
  return pad(Buffer.from("<!doctype html><html><body>Not Found</body></html>"));
}

const NOW = "2026-10-20T12:00:00.000Z";

function measure(buffer: Buffer, contentType: string | null = null): MeasuredImage {
  return measureBytes(buffer, { httpStatus: 200, contentType, checkedAt: NOW });
}

// ---------- candidate factory ----------

const PAGE = "https://luminadrops.example/affiliates";
const CONTEXT: EvaluationContext = {
  productName: "Lumina Drops",
  officialHosts: ["luminadrops.example"],
  declaredAssetHosts: ["files.lumina-cdn.example"],
  otherProducts: ["Harbor Tonic", "Northwind Capsule"],
};

function candidate(overrides: Partial<ProductAssetCandidate> & { id: string }): ProductAssetCandidate {
  return {
    productName: CONTEXT.productName,
    url: "https://luminadrops.example/assets/lumina-drops-bottle.png",
    origin: "MANUFACTURER_AFFILIATE_TOOLS",
    kind: "PACKSHOT",
    fileName: "lumina-drops-bottle.png",
    alt: null,
    declaredProduct: null,
    listing: { sourcePage: PAGE, section: "PRODUCT_IMAGES", observedAt: NOW },
    authorizationEvidence: {
      kind: "MANUFACTURER_ASSET_SECTION",
      sourceUrl: PAGE,
      statement: "The manufacturer lists this file under Product Images for affiliates.",
      verifiedAt: NOW,
    },
    policyBlock: null,
    humanRejection: null,
    approval: { approvedBy: "reviewer", approvedAt: NOW, embeddedTextReviewed: true, productMatchConfirmed: true },
    localFile: "/media/campaign-asset/9/1.png",
    measured: measure(png(800, 1000, 1), "image/png"),
    ...overrides,
  };
}

function evaluateOne(item: ProductAssetCandidate, context: EvaluationContext = CONTEXT) {
  return evaluateCandidates([item], context)[0];
}

async function main() {
// ============ 1. Technical validation ============

assert(validateTechnical(measure(png(800, 1000), "image/png")).status === "PASS", "PNG valido passa");
assert(validateTechnical(measure(jpeg(900, 900), "image/jpeg")).status === "PASS", "JPEG valido passa");
assert(validateTechnical(measure(webp(700, 900), "image/webp")).status === "PASS", "WebP valido passa");
const avifMeasured = measure(avif(1200, 1200), "image/avif");
assert(avifMeasured.format === "avif" && avifMeasured.width === 1200 && avifMeasured.height === 1200, "dimensoes de AVIF sao lidas");
assert(readAvifDimensions(avif(640, 480))?.height === 480, "readAvifDimensions le a caixa ispe");
assert(validateTechnical(avifMeasured).status === "PASS_NEEDS_CONVERSION", "AVIF valido exige conversao, nao e aprovado como esta");
assert(validateTechnical(measure(html(), "image/png")).status === "FAIL", "HTML com content-type de imagem falha");
assert(validateTechnical(measure(html(), "text/html")).findings[0]?.code === "NOT_AN_IMAGE", "content-type text/html e recusado");
assert(validateTechnical(measure(gif(), "image/gif")).status === "FAIL", "GIF nao e aceito");
assert(validateTechnical(measure(png(120, 120), "image/png")).status === "FAIL", "imagem minuscula falha");
assert(validateTechnical(measure(png(300, 300), "image/png")).status === "FAIL", "abaixo do piso de 400px falha");
assert(validateTechnical(measure(png(1600, 200), "image/png")).findings.some((item) => item.code === "BANNER_LIKE"), "formato de banner falha");
assert(validateTechnical(measure(Buffer.alloc(300, 1), "image/png")).findings[0]?.code === "UNRECOGNIZED_FORMAT", "bytes desconhecidos falham");
assert(validateTechnical(null).status === "NOT_CHECKED", "arquivo nunca buscado fica NOT_CHECKED");
assert(validateTechnical(measure(png(800, 1000), "image/jpeg")).findings.some((item) => item.code === "CONTENT_TYPE_MISMATCH"), "content-type divergente e registrado");

const ok = (bytes: Buffer, init: { status?: number; url?: string; type?: string; length?: string } = {}): FetchLike => async (url) => ({
  status: init.status ?? 200,
  url: init.url ?? url,
  headers: { get: (name: string) => (name === "content-type" ? init.type ?? "image/png" : name === "content-length" ? init.length ?? null : null) },
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
});
const now = () => NOW;
const fetched = await fetchAndMeasure("https://luminadrops.example/a.png", ok(png(800, 1000)), now);
assert(validateTechnical(fetched.measured).status === "PASS" && fetched.bytes !== null && fetched.measured.sha256?.length === 64, "URL disponivel e medida, com hash");
const missing = (await fetchAndMeasure("https://luminadrops.example/missing.png", ok(html(), { status: 404, type: "text/html" }), now)).measured;
assert(missing.httpStatus === 404 && validateTechnical(missing).status === "FAIL", "URL 404 falha");
assert((await fetchAndMeasure("not a url", ok(png(800, 1000)), now)).measured.fetchError === "INVALID_URL", "URL invalida falha");
assert((await fetchAndMeasure("http://luminadrops.example/a.png", ok(png(800, 1000)), now)).measured.fetchError === "NOT_HTTPS", "URL sem HTTPS falha");
assert((await fetchAndMeasure("https://luminadrops.example/a.png", ok(png(800, 1000), { url: "http://luminadrops.example/a.png" }), now)).measured.fetchError === "REDIRECTED_TO_NON_HTTPS", "redirecionamento para HTTP falha");
assert((await fetchAndMeasure("https://luminadrops.example/a.png", ok(png(800, 1000), { length: "99000000" }), now)).measured.fetchError === "TOO_LARGE", "arquivo gigante e recusado sem baixar");
const refused: FetchLike = async () => {
  throw new Error("ENOTFOUND");
};
assert((await fetchAndMeasure("https://nowhere.invalid/a.png", refused, now)).measured.fetchError === "UNREACHABLE", "host inexistente falha");
const timedOut: FetchLike = async () => {
  const error = new Error("timeout");
  error.name = "TimeoutError";
  throw error;
};
assert((await fetchAndMeasure("https://slow.example/a.png", timedOut, now)).measured.fetchError === "TIMEOUT", "timeout e classificado");

// ============ 2. Product correspondence ============

assert(distinctiveTokens("Lumina Drops").join(",") === "lumina", "palavras genericas saem dos tokens");
assert(distinctiveTokens("Capsule Pro").length === 1, "nome so com palavras genericas ainda tem token de reserva");
assert(matchProduct(candidate({ id: "m1" }), CONTEXT).status === "CONFIRMED", "nome no arquivo confirma");
assert(matchProduct(candidate({ id: "m2", url: "https://luminadrops.example/img/IMG_2231.png", fileName: "IMG_2231.png" }), CONTEXT).status === "PLAUSIBLE", "so o dominio oficial e plausivel, nao confirmado");
assert(matchProduct(candidate({ id: "m3", url: "https://stock.example/photo/9.png", fileName: "9.png" }), CONTEXT).status === "UNCONFIRMED", "arquivo sem nome e sem host oficial nao tem correspondencia");
assert(matchProduct(candidate({ id: "m4", url: "https://luminadrops.example/img/harbor-tonic-bottle.png", fileName: "harbor-tonic-bottle.png" }), CONTEXT).status === "CONTRADICTED", "arquivo que nomeia outro produto e contradito");
assert(matchProduct(candidate({ id: "m5", declaredProduct: "Harbor Tonic" }), CONTEXT).status === "CONTRADICTED", "a fonte rotula outro produto: contradito");
assert(matchProduct(candidate({ id: "m6", declaredProduct: "Lumina Drops Original" }), CONTEXT).status === "CONFIRMED", "a fonte rotula o produto certo: confirmado");
assert(matchProduct(candidate({ id: "m7", url: "https://luminadrops.example/img/lumina-harbor-tonic.png", fileName: "lumina-harbor-tonic.png" }), CONTEXT).status === "UNCONFIRMED", "arquivo que nomeia os dois exige decisao humana");

// ============ 3. Authorization, separate from technical validity ============

assert(assessAuthorization(candidate({ id: "a1" }), CONTEXT).status === "DOCUMENTED", "secao Product Images do fabricante documenta autorizacao");
assert(assessAuthorization(candidate({ id: "a2", authorizationEvidence: null, listing: { sourcePage: PAGE, section: "DISPLAYED_ONLY", observedAt: NOW } }), CONTEXT).status === "NOT_DOCUMENTED", "imagem apenas exibida nao tem autorizacao");
assert(assessAuthorization(candidate({ id: "a3", authorizationEvidence: null, listing: { sourcePage: PAGE, section: "META_TAG", observedAt: NOW } }), CONTEXT).reasons[0].includes("public image is not a licensed image"), "og:image publico nao e imagem licenciada");
assert(assessAuthorization(candidate({ id: "a4", listing: { sourcePage: "https://other.example/tools", section: "PRODUCT_IMAGES", observedAt: NOW }, authorizationEvidence: { kind: "MANUFACTURER_ASSET_SECTION", sourceUrl: "https://other.example/tools", statement: "Listed under Product Images for affiliates.", verifiedAt: NOW } }), CONTEXT).status === "NOT_DOCUMENTED", "secao fora de dominio do fabricante nao vale");
assert(assessAuthorization(candidate({ id: "a5", listing: { sourcePage: PAGE, section: "DISPLAYED_ONLY", observedAt: NOW } }), CONTEXT).status === "NOT_DOCUMENTED", "evidencia de secao com listagem so exibida nao vale");
for (const origin of ["AI_GENERATED", "COMPETITOR", "RECREATED"] as const) {
  assert(assessAuthorization(candidate({ id: `a-${origin}`, origin }), CONTEXT).status === "DENIED", `${origin} nunca e autorizado`);
}
assert(assessAuthorization(candidate({ id: "a6", origin: "OPERATOR_UPLOAD", authorizationEvidence: { kind: "OPERATOR_RIGHTS_DECLARATION", sourceUrl: null, statement: "short", verifiedAt: NOW } }), CONTEXT).status === "NOT_DOCUMENTED", "declaracao do operador sem texto nao vale");
assert(assessAuthorization(candidate({ id: "a7", origin: "OPERATOR_UPLOAD", authorizationEvidence: { kind: "OPERATOR_RIGHTS_DECLARATION", sourceUrl: null, statement: "I own the photograph and license it for this page.", verifiedAt: NOW } }), CONTEXT).reasons[0].includes("did not verify"), "declaracao do operador e marcada como nao verificada");

// ============ 4. Evaluation scenarios ============

const approved = evaluateOne(candidate({ id: "s1" }));
assert(approved.status === "APPROVED" && approved.blockers.length === 0, "S1 produto com imagem aprovada: APPROVED");
const approvedContract = buildProductAssetsContract("Lumina Drops", [candidate({ id: "s1" })], [approved]);
assert(approvedContract.hero?.src === "/media/campaign-asset/9/1.png" && approvedContract.hero.alt === "Lumina Drops product image", "S1 o contrato entrega a imagem e um alt so com o nome do produto");
assert(approvedContract.hero?.sha256.length === 64 && approvedContract.hero.authorization.kind === "MANUFACTURER_ASSET_SECTION", "S1 o contrato carrega hash e autorizacao");
assert(showcaseImageFromContract(approvedContract)?.src === "/media/campaign-asset/9/1.png", "S1 a imagem chega ao renderer so pelo contrato");

const empty = buildProductAssetsContract("Lumina Drops", [], []);
assert(empty.hero === null && empty.approved.length === 0 && showcaseImageFromContract(empty) === null && showcaseImageFromContract(null) === null, "S2 produto sem imagem: sem hero, fallback neutro");

const dead = evaluateOne(candidate({ id: "s3", measured: { ...measure(png(800, 1000)), httpStatus: 404 } }));
assert(dead.status === "REJECTED" && dead.technical.status === "FAIL", "S3 URL que nao responde 200: REJECTED");
const invalidUrl = evaluateOne(candidate({ id: "s3b", url: "not a url", measured: (await fetchAndMeasure("not a url", ok(png(800, 1000)), now)).measured }));
assert(invalidUrl.status === "REJECTED", "S3 URL invalida: REJECTED");

const other = evaluateOne(candidate({ id: "s4", url: "https://luminadrops.example/img/northwind-capsule.png", fileName: "northwind-capsule.png" }));
assert(other.status === "REJECTED" && other.match.status === "CONTRADICTED", "S4 imagem de produto diferente: REJECTED");

const unauthorized = candidate({ id: "s5", authorizationEvidence: null, listing: { sourcePage: PAGE, section: "DISPLAYED_ONLY", observedAt: NOW } });
const unauthorizedEval = evaluateOne(unauthorized);
assert(unauthorizedEval.technical.status === "PASS" && unauthorizedEval.match.status === "CONFIRMED", "S5 a imagem e tecnicamente valida e corresponde ao produto");
assert(unauthorizedEval.status === "CANDIDATE" && unauthorizedEval.blockers.some((line) => line.includes("authorization")), "S5 sem autorizacao comprovada: CANDIDATE");
const unauthorizedContract = buildProductAssetsContract("Lumina Drops", [unauthorized], [unauthorizedEval]);
assert(unauthorizedContract.hero === null && unauthorizedContract.approved.length === 0 && unauthorizedContract.counts.candidate === 1, "S5 candidato nao autorizado nao chega ao renderer");
assert(!JSON.stringify(unauthorizedContract).includes(unauthorized.url), "S5 o contrato nem expoe a URL do candidato");

const first = candidate({ id: "d1" });
const copyOfBytes = candidate({ id: "d2", url: "https://luminadrops.example/assets/lumina-drops-bottle-copy.png", fileName: "lumina-drops-bottle-copy.png", localFile: "/media/campaign-asset/9/2.png" });
const sameUrl = candidate({ id: "d3", url: "https://www.luminadrops.example/assets/Lumina-Drops-Bottle.png?v=2", localFile: "/media/campaign-asset/9/3.png", measured: measure(png(800, 1000, 9), "image/png") });
const dupEvals = evaluateCandidates([first, copyOfBytes, sameUrl], CONTEXT);
assert(dupEvals[0].status === "APPROVED" && dupEvals[1].duplicateOf === "d1" && dupEvals[1].status === "REJECTED", "S6 mesmo conteudo em outra URL e duplicado");
assert(dupEvals[2].duplicateOf === "d1" && dupEvals[2].status === "REJECTED", "S6 mesma URL com query diferente e duplicada");
assert(normalizedAssetUrl("https://WWW.Example.com/a/B.png?x=1#y") === "example.com/a/b.png", "URL normalizada ignora www, caixa, query e fragmento");
assert(buildProductAssetsContract("Lumina Drops", [first, copyOfBytes, sameUrl], dupEvals).approved.length === 1, "S6 so uma copia chega ao contrato");

const noApproval = evaluateOne(candidate({ id: "s7", approval: null }));
assert(noApproval.status === "CANDIDATE" && noApproval.blockers.some((line) => line.includes("approved")), "S7 sem aprovacao humana: CANDIDATE");
const partial = evaluateOne(candidate({ id: "s7b", approval: { approvedBy: "r", approvedAt: NOW, embeddedTextReviewed: false, productMatchConfirmed: true } }));
assert(partial.status === "CANDIDATE", "S7 aprovacao sem revisao de texto incorporado: CANDIDATE");
assert(evaluateOne(candidate({ id: "s7c", localFile: null })).status === "CANDIDATE", "S7 sem copia armazenada: CANDIDATE");

const plausible = candidate({ id: "s8", url: "https://luminadrops.example/img/IMG_2231.png", fileName: "IMG_2231.png" });
assert(evaluateOne({ ...plausible, approval: { approvedBy: "r", approvedAt: NOW, embeddedTextReviewed: true, productMatchConfirmed: false } }).status === "CANDIDATE", "S8 correspondencia so plausivel sem confirmacao humana: CANDIDATE");
assert(evaluateOne(plausible).status === "APPROVED", "S8 correspondencia plausivel com confirmacao humana: APPROVED");

const converted = evaluateOne(candidate({ id: "s9", measured: measure(avif(1200, 1200), "image/avif"), localFile: "/media/campaign-asset/9/1.png" }));
assert(converted.status === "CANDIDATE" && converted.blockers.some((line) => line.includes("JPEG, PNG or WebP")), "S9 AVIF aprovado por pessoa ainda precisa de copia convertida");

assert(evaluateOne(candidate({ id: "s10", policyBlock: "Health claim in the file name." })).status === "REJECTED", "S10 bloqueio de politica de nome de arquivo nao e anulado por aprovacao");
assert(evaluateOne(candidate({ id: "s11", kind: "PROMO_BANNER" })).status === "REJECTED", "S11 banner promocional nunca encena o produto");
assert(evaluateOne(candidate({ id: "s11b", kind: "BRAND_LOGO" })).status === "REJECTED", "S11 logotipo nunca encena o produto");
assert(evaluateOne(candidate({ id: "s12", humanRejection: { note: "Shows another bottle.", at: NOW } })).status === "REJECTED", "S12 rejeicao humana vence");
for (const origin of ["AI_GENERATED", "COMPETITOR", "RECREATED"] as const) {
  assert(evaluateOne(candidate({ id: `s13-${origin}`, origin })).status === "REJECTED", `S13 ${origin} e REJECTED mesmo com aprovacao e URL oficial`);
}

const contextual = candidate({ id: "c1", kind: "CONTEXTUAL" });
const packshot = candidate({ id: "c2", url: "https://luminadrops.example/assets/lumina-drops-box.png", fileName: "lumina-drops-box.png", localFile: "/media/campaign-asset/9/4.png", measured: measure(png(900, 900, 4), "image/png") });
const both = buildProductAssetsContract("Lumina Drops", [contextual, packshot], evaluateCandidates([contextual, packshot], CONTEXT));
assert(both.approved.length === 2 && both.hero?.id === "c2", "S14 o packshot e preferido como hero");
const onlyContextual = buildProductAssetsContract("Lumina Drops", [contextual], evaluateCandidates([contextual], CONTEXT));
assert(onlyContextual.hero === null && onlyContextual.approved.length === 1, "S14 imagem contextual sozinha nao vira hero");

const claimAlt = candidate({ id: "g1", alt: "Cures everything overnight", declaredProduct: "Lumina Drops" });
const claimContract = buildProductAssetsContract("Lumina Drops", [claimAlt], evaluateCandidates([claimAlt], CONTEXT));
assert(claimContract.hero?.alt === "Lumina Drops product image" && !JSON.stringify(claimContract).toLowerCase().includes("cures"), "G1 metadados da imagem nao viram texto da pagina");

// ============ 5. Adapters over stored data ============

function row(overrides: Partial<OfficialPromoAsset>): OfficialPromoAsset {
  const base: OfficialPromoAsset = {
    id: 1,
    campaignId: 9,
    sourcePage: PAGE,
    section: "product",
    originalUrl: "https://luminadrops.example/assets/lumina-drops-bottle.png",
    fileName: "lumina-drops-bottle.png",
    status: "pending",
    blockReason: null,
    reviewNote: null,
    width: null,
    height: null,
    bytes: null,
    format: "png",
    productMatch: "confirmed",
    permissionEvidence: "",
    verifiedAt: NOW,
    localFile: null,
    isHero: false,
  };
  const merged = { ...base, ...overrides };
  return { ...merged, permissionEvidence: overrides.permissionEvidence ?? permissionEvidence(merged.section, merged.sourcePage, merged.verifiedAt) };
}

const sectionRow = candidateFromOfficialRow(row({}), "Lumina Drops");
assert(sectionRow.listing.section === "PRODUCT_IMAGES" && sectionRow.authorizationEvidence?.kind === "MANUFACTURER_ASSET_SECTION", "linha da secao Product Images carrega autorizacao de secao");
const noteRow = candidateFromOfficialRow(row({ originalUrl: "https://luminadrops.example/assets/neuro-xt.avif", fileName: "neuro-xt.avif", permissionEvidence: "Shown on the page. Permission is not explicit.", blockReason: "Format not accepted.", status: "rejected" }), "Lumina Drops");
assert(noteRow.listing.section === "DISPLAYED_ONLY" && noteRow.authorizationEvidence === null, "texto livre de 'permissao nao explicita' nao vira autorizacao");
assert(noteRow.humanRejection === null, "bloqueio automatico de formato nao e rejeicao humana");
const humanRow = candidateFromOfficialRow(row({ status: "rejected", reviewNote: "Wrong bottle." }), "Lumina Drops");
assert(humanRow.humanRejection?.note === "Wrong bottle.", "rejeicao sem bloqueio automatico e decisao humana");
const zipRow = candidateFromOfficialRow(row({ section: "campaign", originalUrl: "https://tracker.example/l/pack", fileName: "banner-collection.zip" }), "Lumina Drops");
assert(zipRow.kind === "PROMO_BANNER" && zipRow.listing.section === "DOWNLOAD_PACK", "pacote ZIP e promocional e nunca packshot");
const claimRow = candidateFromOfficialRow(row({ originalUrl: "https://luminadrops.example/assets/clears-arteries-overnight.png", fileName: "clears-arteries-overnight.png" }), "Lumina Drops");
assert(claimRow.policyBlock !== null && evaluateOne(claimRow).status === "REJECTED", "promessa no nome do arquivo continua bloqueada");
const approvedRow = candidateFromOfficialRow(row({ status: "approved", localFile: "/media/campaign-asset/9/1.png" }), "Lumina Drops", { measured: measure(png(800, 1000), "image/png") });
assert(approvedRow.approval !== null && approvedRow.localFile === "/media/campaign-asset/9/1.png" && evaluateOne(approvedRow).status === "APPROVED", "linha aprovada e armazenada vira APPROVED");
const legacy = candidateFromLegacyHero({ productName: "Lumina Drops", src: "/media/product/abc.png", provenance: "DIRECT_SOURCE", observedAt: NOW });
const legacyEval = evaluateOne(legacy);
assert(legacyEval.status === "CANDIDATE" && legacyEval.authorization.status === "NOT_DOCUMENTED", "imagem DIRECT_SOURCE anexada a campanha nao ganha autorizacao por estar anexada");
assert(officialHostsFrom(["https://www.luminadrops.example/", null, "https://shop.luminadrops.example/x"]).join(",") === "luminadrops.example,shop.luminadrops.example", "hosts oficiais sao normalizados");
assert(declaredHostsFrom([row({ originalUrl: "https://files.lumina-cdn.example/a.png" }), row({ originalUrl: "https://random.example/b.png", permissionEvidence: "free text" })]).join(",") === "files.lumina-cdn.example", "so hosts de secoes do fabricante sao declarados");

// ============ 6. Grounding and structure ============

const root = process.cwd();
const moduleDir = path.join(root, "src/lib/product-assets");
const moduleFiles = ["types", "technical", "match", "authorization", "evaluate", "from-official", "campaign"].map((name) => ({ name, text: readFileSync(path.join(moduleDir, `${name}.ts`), "utf8") }));
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
assert(moduleFiles.every((file) => !/product-facts|product-showcase|editorial|landing-composer|components\//.test(code(file.text).replace(/from "@\/lib\/official-assets[^"]*"/g, ""))), "o modulo nao toca ProductFacts, editorial, showcase nem componentes");
assert(moduleFiles.every((file) => !/neuroprime|neuro serge|cholibrium|joint genesis|northwind|harbor/i.test(code(file.text))), "sem regra por produto, slug ou campanha no modulo");
assert(moduleFiles.every((file) => !/\bfetch\(|XMLHttpRequest/.test(code(file.text).replace(/fetcher\(/g, ""))), "o modulo nao faz rede por conta propria");
const adaptSource = readFileSync(path.join(root, "src/lib/product-showcase/adapt.ts"), "utf8");
assert(!/product-assets/.test(adaptSource), "adapt.ts compartilhado com o cliente nao importa o modulo de assets");
assert(/options\.approvedImage !== undefined \? options\.approvedImage : officialCampaignImage\(campaign\)/.test(adaptSource), "o contrato tem precedencia e o caminho anterior permanece");
const adaptCampaign = readFileSync(path.join(root, "src/lib/product-showcase/adapt-campaign.ts"), "utf8");
assert(/showcaseImageFromContract\(resolveCampaignProductAssets\(campaign\)\.contract\)/.test(adaptCampaign), "a entrada do servidor usa o contrato");
const publicPage = path.join(root, "src/app/p/[slug]/page.tsx");
if (existsSync(publicPage)) assert(!/product-assets/.test(readFileSync(publicPage, "utf8")), "a rota publica nao le candidatos");

// ============ 7. Real data, read-only ============

const neuro = getCampaignById(190);
if (neuro) {
  const { resolveCampaignProductAssets } = await import("../src/lib/product-assets/campaign.ts");
  const result = resolveCampaignProductAssets(neuro, now);
  assert(result.contract.hero === null && result.contract.approved.length === 0, "campanha 190: nenhuma imagem aprovada, fallback neutro");
  const packshotRow = result.candidates.find((item) => item.fileName.endsWith(".avif"));
  const packshotEval = result.evaluations.find((item) => item.id === packshotRow?.id);
  assert(packshotEval?.status === "CANDIDATE" && packshotEval.authorization.status === "NOT_DOCUMENTED", "campanha 190: o packshot AVIF segue candidato, sem autorizacao documentada");
  assert(packshotEval?.match.status === "PLAUSIBLE", "campanha 190: so o host oficial liga o arquivo ao produto (plausivel, nao confirmado)");
  assert(result.candidates.filter((item) => item.kind === "PROMO_BANNER").every((item) => result.evaluations.find((entry) => entry.id === item.id)?.status === "REJECTED"), "campanha 190: pacotes de banner sao rejeitados");
  const docNeuro = readStoredLandingDocument(neuro.id);
  if (docNeuro) {
    const shell = { siteName: "Product Reviews", affiliateDisclosure: "Disclosure.", healthDisclaimer: null, review: null, footerLinks: [], channel: "presell" as const };
    const withoutImage = adaptModel(neuro, docNeuro, shell);
    const withImage = adaptModel(neuro, docNeuro, { ...shell, approvedImage: { src: "/media/campaign-asset/9/1.png", alt: "NeuroPrime product image" } });
    assert(withoutImage.image === null, "campanha 190: sem contrato aprovado, a pagina fica sem imagem");
    assert(withImage.image?.src === "/media/campaign-asset/9/1.png", "imagem aprovada chega ao modelo do showcase");
    const editorialWith = withImage.editorial!;
    const editorialWithout = withoutImage.editorial!;
    assert(JSON.stringify(editorialWith.blocks) === JSON.stringify(editorialWithout.blocks), "grounding: todos os blocos de texto sao identicos com e sem imagem");
    assert(editorialWith.productName === editorialWithout.productName && JSON.stringify(editorialWith.benefits) === JSON.stringify(editorialWithout.benefits) && JSON.stringify(editorialWith.cta) === JSON.stringify(editorialWithout.cta), "grounding: nome, beneficios e CTA nao mudam");
    assert(editorialWithout.limitations.includes("NO_APPROVED_PACKSHOT") && !editorialWith.limitations.includes("NO_APPROVED_PACKSHOT") && editorialWith.limitations.filter((item) => item !== "NO_APPROVED_PACKSHOT").join() === editorialWithout.limitations.filter((item) => item !== "NO_APPROVED_PACKSHOT").join(), "grounding: a unica diferenca interna e o codigo de pacote ausente");
    assert(JSON.stringify({ ...withImage, image: null, adaptivePlan: null, editorial: null }) === JSON.stringify({ ...withoutImage, image: null, adaptivePlan: null, editorial: null }), "grounding: fora a imagem, o plano de hero e o codigo de limitacao, o modelo e identico");
  }
}
const serum = getCampaignById(183);
if (serum) {
  const { resolveCampaignProductAssets } = await import("../src/lib/product-assets/campaign.ts");
  const result = resolveCampaignProductAssets(serum, now);
  const attached = result.evaluations.find((item) => item.id === "campaign-hero");
  assert(result.contract.hero === null && attached?.status === "CANDIDATE", "campanha 183: a imagem DIRECT_SOURCE anexada e candidata sem autorizacao documentada (achado, nao bloqueio)");
}

console.log("PRODUCT_ASSETS_INTELLIGENCE_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
