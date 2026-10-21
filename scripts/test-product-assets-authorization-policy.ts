/**
 * Execution 47B - authorization policy for product images.
 *
 * Fictional product ("Lumina Drops"), synthetic image bytes, no network. The last block reads the local
 * database read-only to check that no real campaign gains an image it has no evidence for.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import type { OfficialPromoAsset } from "../src/lib/official-assets/store.ts";
import { AUTHORIZATION_MAX_AGE_DAYS, assessAuthorization } from "../src/lib/product-assets/authorization.ts";
import { buildProductAssetsContract, evaluateCandidates, showcaseImageFromContract } from "../src/lib/product-assets/evaluate.ts";
import { candidateFromOfficialRow } from "../src/lib/product-assets/from-official.ts";
import {
  authorizationRegistryFile,
  parseAuthorizationRegistry,
  readAuthorizationRegistry,
  recordAssetAuthorization,
  validateAuthorizationRecord,
  type AuthorizationRecord,
} from "../src/lib/product-assets/registry.ts";
import { measureBytes } from "../src/lib/product-assets/technical.ts";
import type { AuthorizationEvidence, EvaluationContext, MeasuredImage, ProductAssetCandidate } from "../src/lib/product-assets/types.ts";
import { adaptLandingToShowcase as adaptModel, officialCampaignImage } from "../src/lib/product-showcase/adapt.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

// ---------- synthetic bytes ----------

function png(width: number, height: number, salt = 0): Buffer {
  const head = Buffer.alloc(600, 7);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  head[500] = salt;
  return head;
}

function avifBytes(width: number, height: number): Buffer {
  const box = (type: string, content: Buffer) => {
    const out = Buffer.alloc(8 + content.length);
    out.writeUInt32BE(8 + content.length, 0);
    out.write(type, 4, "ascii");
    content.copy(out, 8);
    return out;
  };
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("avif"), Buffer.alloc(4), Buffer.from("avifmif1")]));
  const ispe = Buffer.alloc(12);
  ispe.writeUInt32BE(width, 4);
  ispe.writeUInt32BE(height, 8);
  const meta = box("meta", Buffer.concat([Buffer.alloc(4), box("iprp", box("ipco", box("ispe", ispe)))]));
  const body = Buffer.concat([ftyp, meta]);
  return Buffer.concat([body, Buffer.alloc(Math.max(0, 600 - body.length), 7)]);
}

const NOW = "2026-10-20T12:00:00.000Z";
const measure = (buffer: Buffer, contentType: string): MeasuredImage => measureBytes(buffer, { httpStatus: 200, contentType, checkedAt: NOW });

// ---------- fixtures ----------

const MATERIALS = "https://luminadrops.example/affiliates/materials";
const CONTEXT: EvaluationContext = {
  productName: "Lumina Drops",
  officialHosts: ["luminadrops.example"],
  programHosts: ["affiliatehub.example"],
  otherProducts: ["Harbor Tonic", "Northwind Capsule"],
  now: NOW,
};

const LIBRARY: AuthorizationEvidence = {
  kind: "OFFICIAL_AFFILIATE_ASSET_LIBRARY",
  sourceUrl: MATERIALS,
  statement: "The program lists this packshot in its affiliate material library for promotion.",
  verifiedAt: NOW,
  program: "Lumina Affiliate Program",
  product: "Lumina Drops",
  materialId: "MAT-104",
  offeredForPromotion: true,
  useScope: "PROMOTIONAL_GENERAL",
  restrictions: [{ text: "No before/after photos without permission.", appliesToThisAsset: false }],
  restrictionsReviewedAt: NOW,
  validUntil: null,
  revokedAt: null,
};

function candidate(overrides: Partial<ProductAssetCandidate> & { id: string }): ProductAssetCandidate {
  return {
    productName: CONTEXT.productName,
    url: "https://luminadrops.example/library/lumina-drops-bottle.png",
    origin: "MANUFACTURER_AFFILIATE_TOOLS",
    kind: "PACKSHOT",
    fileName: "lumina-drops-bottle.png",
    alt: null,
    declaredProduct: null,
    listing: { sourcePage: MATERIALS, section: "PRODUCT_IMAGES", observedAt: NOW },
    authorizationEvidence: LIBRARY,
    policyBlock: null,
    humanRejection: null,
    approval: null,
    localFile: "/media/campaign-asset/9/1.png",
    measured: measure(png(800, 1000, 1), "image/png"),
    ...overrides,
  };
}

const evidence = (changes: Partial<AuthorizationEvidence>): AuthorizationEvidence => ({ ...LIBRARY, ...changes });
const evaluate = (item: ProductAssetCandidate, context: EvaluationContext = CONTEXT) => evaluateCandidates([item], context)[0];

async function main() {
  // ============ 1. Offered officially to affiliates ============

  const offered = evaluate(candidate({ id: "o1" }));
  assert(offered.authorization.status === "DOCUMENTED", "imagem da biblioteca oficial de afiliados tem autorizacao documentada");
  assert(offered.status === "APPROVED" && offered.approvalMode === "POLICY" && offered.blockers.length === 0, "aprovada pela politica, sem aprovacao individual, quando todas as condicoes valem");
  const offeredContract = buildProductAssetsContract("Lumina Drops", [candidate({ id: "o1" })], [offered]);
  const hero = offeredContract.hero;
  assert(hero?.id === "o1" && hero.approvalMode === "POLICY", "o contrato entrega o packshot aprovado pela politica");
  assert(hero?.authorization.kind === "OFFICIAL_AFFILIATE_ASSET_LIBRARY" && hero.authorization.program === "Lumina Affiliate Program" && hero.authorization.materialId === "MAT-104", "o contrato registra programa, identificador e tipo de autorizacao");
  assert(hero?.authorization.sourceUrl === MATERIALS && hero.authorization.verifiedAt === NOW && hero.authorization.useScope === "PROMOTIONAL_GENERAL", "o contrato registra origem, data da verificacao e escopo");
  assert(hero?.authorization.restrictions.length === 1 && hero.authorization.restrictions[0].includes("before/after"), "o contrato registra as restricoes do programa");
  assert(hero?.alt === "Lumina Drops product image" && !JSON.stringify(offeredContract).includes("affiliate material library"), "o texto de evidencia nunca vira texto de pagina");
  assert(showcaseImageFromContract(offeredContract)?.src === "/media/campaign-asset/9/1.png", "o showcase recebe a imagem do contrato");

  const pack = evaluate(candidate({ id: "o2", listing: { sourcePage: MATERIALS, section: "DOWNLOAD_PACK", observedAt: NOW } }));
  assert(pack.authorization.status === "DOCUMENTED" && pack.status === "APPROVED", "arquivo de um pacote oferecido na biblioteca tambem vale");

  const promo = evaluate(candidate({
    id: "o3",
    origin: "OFFICIAL_PRODUCT_PAGE",
    authorizationEvidence: evidence({ kind: "MANUFACTURER_PROMOTIONAL_MATERIAL", useScope: "LANDING_PAGE", statement: "Press kit terms: the files may be used on promotional pages." }),
    listing: { sourcePage: MATERIALS, section: "DOWNLOAD_PACK", observedAt: NOW },
  }));
  assert(promo.authorization.status === "DOCUMENTED" && promo.status === "APPROVED", "material promocional do fabricante com termos que permitem pagina promocional vale");
  const promoUnscoped = evaluate(candidate({ id: "o4", authorizationEvidence: evidence({ kind: "MANUFACTURER_PROMOTIONAL_MATERIAL", useScope: "UNSPECIFIED" }), listing: { sourcePage: MATERIALS, section: "DOWNLOAD_PACK", observedAt: NOW } }));
  assert(promoUnscoped.authorization.status === "NOT_DOCUMENTED" && promoUnscoped.status === "CANDIDATE", "material do fabricante sem termos de uso em pagina promocional nao basta");

  const written = evaluate(candidate({
    id: "o5",
    listing: { sourcePage: MATERIALS, section: "DISPLAYED_ONLY", observedAt: NOW },
    authorizationEvidence: evidence({ kind: "EXPLICIT_WRITTEN_PERMISSION", sourceUrl: null, useScope: "LANDING_PAGE", statement: "Written reply from the affiliate manager: the packshots may be used on our landing pages." }),
  }));
  assert(written.authorization.status === "DOCUMENTED" && written.status === "APPROVED", "permissao escrita explicita vale mesmo para arquivo que a pagina so exibia");
  const writtenVague = evaluate(candidate({ id: "o6", authorizationEvidence: evidence({ kind: "EXPLICIT_WRITTEN_PERMISSION", sourceUrl: null, useScope: "UNSPECIFIED", statement: "We spoke by phone and they seemed fine with it." }) }));
  assert(writtenVague.authorization.status === "NOT_DOCUMENTED", "permissao escrita que nao menciona pagina promocional nao vale");

  // ============ 2. Official affiliate API ============

  const api = evaluate(candidate({
    id: "a1",
    url: "https://cdn.affiliatehub.example/creatives/9912.png",
    fileName: "9912.png",
    origin: "AFFILIATE_PLATFORM",
    declaredProduct: "Lumina Drops",
    listing: { sourcePage: "https://api.affiliatehub.example/v1/creatives", section: "OFFICIAL_API", observedAt: NOW },
    authorizationEvidence: evidence({ kind: "OFFICIAL_AFFILIATE_API", sourceUrl: "https://api.affiliatehub.example/v1/creatives", statement: "Creative returned by the affiliate API endpoint for product creatives.", materialId: "9912" }),
  }), { ...CONTEXT, officialHosts: ["luminadrops.example", "affiliatehub.example"] });
  assert(api.authorization.status === "DOCUMENTED" && api.match.status === "CONFIRMED", "criativo devolvido por API oficial tem autorizacao e o rotulo da fonte confirma o produto");
  assert(api.status === "APPROVED" && api.approvalMode === "POLICY", "imagem de API oficial passa pela politica");
  const apiHostOnly = evaluate(candidate({
    id: "a2",
    url: "https://cdn.affiliatehub.example/creatives/9913.png",
    fileName: "9913.png",
    declaredProduct: "Lumina Drops",
    listing: { sourcePage: "https://api.affiliatehub.example/v1/creatives", section: "OFFICIAL_API", observedAt: NOW },
    authorizationEvidence: evidence({ kind: "OFFICIAL_AFFILIATE_API", sourceUrl: "https://api.affiliatehub.example/v1/creatives" }),
  }), { ...CONTEXT, programHosts: [] });
  assert(apiHostOnly.authorization.status === "NOT_DOCUMENTED", "API de um host que nao e do programa nem da plataforma nao vale");
  const apiWrongSection = evaluate(candidate({
    id: "a3",
    listing: { sourcePage: MATERIALS, section: "PRODUCT_IMAGES", observedAt: NOW },
    authorizationEvidence: evidence({ kind: "OFFICIAL_AFFILIATE_API", sourceUrl: "https://api.affiliatehub.example/v1/creatives" }),
  }));
  assert(apiWrongSection.authorization.status === "NOT_DOCUMENTED", "evidencia de API para arquivo que nao veio da API nao vale");

  // ============ 3. Only displayed on the public site ============

  const displayed = evaluate(candidate({ id: "d1", authorizationEvidence: null, listing: { sourcePage: "https://luminadrops.example/", section: "DISPLAYED_ONLY", observedAt: NOW } }));
  assert(displayed.status === "CANDIDATE" && displayed.authorization.status === "NOT_DOCUMENTED" && displayed.provenance.status === "OFFICIAL", "imagem so exibida no site oficial segue candidata, mesmo hospedada no dominio oficial");
  const displayedAffiliatePage = evaluate(candidate({ id: "d2", authorizationEvidence: null, listing: { sourcePage: "https://luminadrops.example/affiliates/", section: "DISPLAYED_ONLY", observedAt: NOW } }));
  assert(displayedAffiliatePage.status === "CANDIDATE", "imagem que aparece na pagina de afiliados, sem oferta, segue candidata");
  const claimedButOnlyShown = evaluate(candidate({ id: "d3", listing: { sourcePage: MATERIALS, section: "DISPLAYED_ONLY", observedAt: NOW } }));
  assert(claimedButOnlyShown.status === "CANDIDATE" && claimedButOnlyShown.authorization.status === "NOT_DOCUMENTED", "evidencia de biblioteca para arquivo listado como apenas exibido nao vale");
  const notOffered = evaluate(candidate({ id: "d4", authorizationEvidence: evidence({ offeredForPromotion: false }) }));
  assert(notOffered.status === "CANDIDATE" && notOffered.authorization.reasons[0].includes("not recorded as offered"), "arquivo registrado como nao oferecido para promocao nao vale");
  const metaTag = evaluate(candidate({ id: "d5", authorizationEvidence: null, listing: { sourcePage: "https://luminadrops.example/", section: "META_TAG", observedAt: NOW } }));
  assert(metaTag.status === "CANDIDATE" && metaTag.authorization.reasons[0].includes("not a licensed image"), "og:image publico nao e imagem licenciada");

  // ============ 4. Wrong product ============

  const otherFile = evaluate(candidate({ id: "w1", url: "https://luminadrops.example/library/harbor-tonic-bottle.png", fileName: "harbor-tonic-bottle.png" }));
  assert(otherFile.status === "REJECTED" && otherFile.match.status === "CONTRADICTED", "arquivo que nomeia outro produto e rejeitado, mesmo com evidencia perfeita");
  const otherLabel = evaluate(candidate({ id: "w2", declaredProduct: "Harbor Tonic" }));
  assert(otherLabel.status === "REJECTED" && otherLabel.match.status === "CONTRADICTED", "rotulo da fonte de outro produto e rejeitado");
  const otherEvidence = evaluate(candidate({ id: "w3", authorizationEvidence: evidence({ product: "Harbor Tonic" }) }));
  assert(otherEvidence.authorization.status === "NOT_DOCUMENTED" && otherEvidence.status === "CANDIDATE", "permissao registrada para outro produto nao cobre este");
  const noName = evaluate(candidate({ id: "w4", url: "https://luminadrops.example/library/img_0042.png", fileName: "img_0042.png" }));
  assert(noName.status === "CANDIDATE" && noName.match.status === "PLAUSIBLE" && noName.approvalMode === null, "so o dominio oficial nao confirma o produto, a politica nao aprova sozinha");
  assert(noName.blockers.some((item) => item.includes("cannot pass without a person")), "o bloqueio diz que falta uma pessoa");
  const noNameHuman = evaluate(candidate({ id: "w5", url: "https://luminadrops.example/library/img_0042.png", fileName: "img_0042.png", approval: { approvedBy: "reviewer", approvedAt: NOW, embeddedTextReviewed: true, productMatchConfirmed: true } }));
  assert(noNameHuman.status === "APPROVED" && noNameHuman.approvalMode === "HUMAN", "com a confirmacao de uma pessoa a mesma imagem passa como aprovacao humana");

  // ============ 5. Restrictions ============

  const restricted = evaluate(candidate({ id: "r1", authorizationEvidence: evidence({ restrictions: [{ text: "Not for use on landing pages, banners in ads only.", appliesToThisAsset: true }] }) }));
  assert(restricted.status === "REJECTED" && restricted.authorization.status === "DENIED", "restricao do programa que cobre o arquivo impede o uso");
  assert(restricted.blockers.some((item) => item.includes("Not for use on landing pages")), "o motivo cita a restricao");
  const restrictionElsewhere = evaluate(candidate({ id: "r2" }));
  assert(restrictionElsewhere.status === "APPROVED", "restricao que nao cobre o arquivo nao o bloqueia");
  const channel = evaluate(candidate({ id: "r3", authorizationEvidence: evidence({ useScope: "CHANNEL_LIMITED" }) }));
  assert(channel.status === "REJECTED" && channel.authorization.status === "DENIED", "material limitado a canais sem pagina promocional e negado");
  const prohibitedScope = evaluate(candidate({ id: "r4", authorizationEvidence: evidence({ useScope: "PROHIBITED" }) }));
  assert(prohibitedScope.status === "REJECTED", "uso declarado como proibido e rejeitado");
  const unreviewed = evaluate(candidate({ id: "r5", authorizationEvidence: evidence({ restrictionsReviewedAt: null }) }));
  assert(unreviewed.status === "CANDIDATE" && unreviewed.authorization.status === "NOT_DOCUMENTED", "sem registro de que as restricoes foram lidas a politica nao aprova");
  const healthWithBlock = evaluate(candidate({ id: "r7", policyBlock: "Health claim in the file name." }));
  assert(healthWithBlock.status === "REJECTED" && healthWithBlock.blockers[0].startsWith("Policy:"), "bloqueio de politica de saude nao e superado por autorizacao");

  // ============ 6. Insufficient evidence ============

  const noProgram = evaluate(candidate({ id: "i1", authorizationEvidence: evidence({ program: null }) }));
  assert(noProgram.status === "CANDIDATE" && noProgram.authorization.reasons[0].includes("program"), "sem programa registrado nao e aprovado");
  const shortStatement = evaluate(candidate({ id: "i2", authorizationEvidence: evidence({ statement: "ok" }) }));
  assert(shortStatement.status === "CANDIDATE", "evidencia sem declaracao registrada nao e aprovada");
  const foreignSource = evaluate(candidate({ id: "i3", authorizationEvidence: evidence({ sourceUrl: "https://random-blog.example/free-assets" }) }));
  assert(foreignSource.status === "CANDIDATE" && foreignSource.authorization.status === "NOT_DOCUMENTED", "evidencia fora do programa ou do fabricante nao vale");
  const httpSource = evaluate(candidate({ id: "i4", authorizationEvidence: evidence({ sourceUrl: "http://luminadrops.example/affiliates/materials" }) }));
  assert(httpSource.status === "CANDIDATE", "evidencia em pagina sem HTTPS nao vale");
  const scene = evaluate(candidate({ id: "i5", kind: "CONTEXTUAL" }));
  assert(scene.status === "CANDIDATE" && scene.approvalMode === null, "imagem de cena pode ter texto embutido, entao exige uma pessoa mesmo com autorizacao");
  const banner = evaluate(candidate({ id: "i6", kind: "PROMO_BANNER" }));
  assert(banner.status === "REJECTED", "banner autorizado continua sem poder montar o produto");
  const noCopy = evaluate(candidate({ id: "i7", localFile: null }));
  assert(noCopy.status === "CANDIDATE" && noCopy.blockers.some((item) => item.includes("stored copy")), "sem copia armazenada nao e aprovada");
  const needsConversion = evaluate(candidate({ id: "i8", measured: measure(avifBytes(1100, 1100), "image/avif") }));
  assert(needsConversion.status === "CANDIDATE" && needsConversion.technical.status === "PASS_NEEDS_CONVERSION", "AVIF autorizado ainda precisa de copia convertida");
  const notFetched = evaluate(candidate({ id: "i9", measured: null }));
  assert(notFetched.status === "CANDIDATE" && notFetched.technical.status === "NOT_CHECKED", "arquivo nunca medido nao e aprovado");
  const forbidden = evaluate(candidate({ id: "i10", origin: "AI_GENERATED" }));
  assert(forbidden.status === "REJECTED" && forbidden.authorization.status === "DENIED", "origem gerada por IA nunca passa, nem com evidencia");
  const competitor = evaluate(candidate({ id: "i11", origin: "COMPETITOR" }));
  assert(competitor.status === "REJECTED", "origem concorrente nunca passa");
  const rejectedByPerson = evaluate(candidate({ id: "i12", humanRejection: { note: "Shows a different bottle design.", at: NOW } }));
  assert(rejectedByPerson.status === "REJECTED", "rejeicao de uma pessoa prevalece sobre a politica");

  // ============ 7. Approved earlier, authorization no longer valid ============

  const earlier = candidate({ id: "e1" });
  assert(evaluate(earlier).status === "APPROVED", "referencia: a imagem estava aprovada");
  const revoked = candidate({ id: "e1", authorizationEvidence: evidence({ revokedAt: "2026-10-19T09:00:00.000Z" }) });
  const revokedEvaluation = evaluate(revoked);
  assert(revokedEvaluation.status === "REJECTED" && revokedEvaluation.authorization.status === "DENIED", "permissao retirada derruba a imagem");
  const revokedContract = buildProductAssetsContract("Lumina Drops", [revoked], [revokedEvaluation]);
  assert(revokedContract.hero === null && revokedContract.approved.length === 0 && showcaseImageFromContract(revokedContract) === null, "imagem sem autorizacao vigente sai do contrato e a pagina volta ao fallback neutro");
  const expired = evaluate(candidate({ id: "e2", authorizationEvidence: evidence({ validUntil: "2026-10-01T00:00:00.000Z" }) }));
  assert(expired.status === "CANDIDATE" && expired.authorization.reasons[0].includes("expired"), "permissao vencida derruba a imagem ate ser verificada de novo");
  const stale = evaluate(candidate({ id: "e3", authorizationEvidence: evidence({ verifiedAt: "2026-03-01T00:00:00.000Z", restrictionsReviewedAt: "2026-03-01T00:00:00.000Z" }) }));
  assert(stale.status === "CANDIDATE" && stale.authorization.reasons[0].includes("verified again"), `termos verificados ha mais de ${AUTHORIZATION_MAX_AGE_DAYS} dias precisam de nova verificacao`);
  const recent = evaluate(candidate({ id: "e4", authorizationEvidence: evidence({ verifiedAt: "2026-05-01T00:00:00.000Z", restrictionsReviewedAt: "2026-05-01T00:00:00.000Z" }) }));
  assert(recent.status === "APPROVED", "termos verificados dentro do prazo seguem validos");
  const laterContext = evaluate(candidate({ id: "e5" }), { ...CONTEXT, now: "2027-06-01T00:00:00.000Z" });
  assert(laterContext.status === "CANDIDATE", "a mesma imagem deixa de valer quando o tempo passa, sem ninguem mexer nos dados");
  const brokenDate = evaluate(candidate({ id: "e6", authorizationEvidence: evidence({ validUntil: "not-a-date" }) }));
  assert(brokenDate.status === "CANDIDATE", "validade ilegivel nao e tratada como valida");
  const humanApprovedThenRevoked = evaluate(candidate({
    id: "e7",
    approval: { approvedBy: "reviewer", approvedAt: NOW, embeddedTextReviewed: true, productMatchConfirmed: true },
    authorizationEvidence: evidence({ revokedAt: "2026-10-19T09:00:00.000Z" }),
  }));
  assert(humanApprovedThenRevoked.status === "REJECTED", "aprovacao humana anterior nao sobrevive a uma permissao retirada");
  const sectionAlias = evaluate(candidate({
    id: "e8",
    approval: { approvedBy: "reviewer", approvedAt: NOW, embeddedTextReviewed: true, productMatchConfirmed: true },
    authorizationEvidence: { kind: "MANUFACTURER_ASSET_SECTION", sourceUrl: MATERIALS, statement: "The manufacturer lists this file under Product Images for affiliates.", verifiedAt: "2025-01-01T00:00:00.000Z" },
  }));
  assert(sectionAlias.status === "APPROVED" && sectionAlias.approvalMode === "HUMAN", "o nome 47A da secao do fabricante segue valendo, e continua exigindo aprovacao humana");
  const sectionAliasNoApproval = evaluate(candidate({
    id: "e9",
    authorizationEvidence: { kind: "MANUFACTURER_ASSET_SECTION", sourceUrl: MATERIALS, statement: "The manufacturer lists this file under Product Images for affiliates.", verifiedAt: NOW },
  }));
  assert(sectionAliasNoApproval.status === "CANDIDATE" && sectionAliasNoApproval.approvalMode === null, "a inferencia 47A de secao nao ganha aprovacao automatica");

  // ============ 8. Duplicates and the contract ============

  const first = candidate({ id: "c1" });
  const copy = candidate({ id: "c2", url: "https://luminadrops.example/library/lumina-drops-bottle.png?v=2" });
  const mixed = [
    first,
    copy,
    candidate({ id: "c3", url: "https://luminadrops.example/shop/lumina-drops-pouch.png", authorizationEvidence: null, listing: { sourcePage: "https://luminadrops.example/", section: "DISPLAYED_ONLY", observedAt: NOW }, measured: measure(png(900, 900, 3), "image/png") }),
    candidate({ id: "c4", url: "https://luminadrops.example/library/harbor-tonic.png", fileName: "harbor-tonic.png", measured: measure(png(900, 900, 4), "image/png") }),
    candidate({ id: "c5", url: "https://luminadrops.example/library/lumina-drops-old.png", fileName: "lumina-drops-old.png", authorizationEvidence: evidence({ revokedAt: "2026-10-19T09:00:00.000Z" }), measured: measure(png(900, 900, 5), "image/png") }),
  ];
  const mixedEvaluations = evaluateCandidates(mixed, CONTEXT);
  assert(mixedEvaluations.find((item) => item.id === "c2")?.duplicateOf === "c1" && mixedEvaluations.find((item) => item.id === "c2")?.status === "REJECTED", "copia da mesma imagem e duplicata");
  const mixedContract = buildProductAssetsContract("Lumina Drops", mixed, mixedEvaluations);
  assert(mixedContract.approved.length === 1 && mixedContract.approved[0].id === "c1", "so a imagem autorizada chega ao contrato");
  const serialized = JSON.stringify(mixedContract);
  assert(["pouch", "harbor", "old"].every((word) => !serialized.includes(word)), "nenhuma imagem sem autorizacao aparece no contrato");
  assert(mixedContract.counts.approved === 1 && mixedContract.counts.candidate === 1 && mixedContract.counts.rejected === 3, "o contrato so conta os demais");

  // ============ 9. Authorization is independent of technical validity ============

  const broken = evaluate(candidate({ id: "t1", measured: { ...measure(png(800, 1000), "image/png"), contentType: "text/html", format: "unknown" } }));
  assert(broken.authorization.status === "DOCUMENTED" && broken.status === "REJECTED", "autorizacao documentada nao salva um arquivo tecnicamente invalido");
  assert(assessAuthorization(candidate({ id: "t2", measured: null }), CONTEXT).status === "DOCUMENTED", "a autorizacao e avaliada sem depender de o arquivo ter sido medido");

  // ============ 10. Registry ============

  const directory = mkdtempSync(path.join(os.tmpdir(), "product-assets-registry-"));
  try {
    const url = "https://luminadrops.example/library/lumina-drops-bottle.png";
    const record: AuthorizationRecord = { originalUrl: url, recordedAt: "2026-10-20T10:00:00.000Z", listingSection: "PRODUCT_IMAGES", declaredProduct: "Lumina Drops", authorization: LIBRARY };
    assert(validateAuthorizationRecord(record) === null, "registro completo e valido");
    assert(validateAuthorizationRecord({ ...record, originalUrl: "http://luminadrops.example/a.png" }) !== null, "registro de arquivo sem HTTPS e recusado");
    assert(validateAuthorizationRecord({ ...record, authorization: { ...LIBRARY, statement: "" } }) !== null, "registro sem declaracao e recusado");
    assert(validateAuthorizationRecord({ ...record, authorization: { ...LIBRARY, kind: "MADE_UP" as never } }) !== null, "tipo de autorizacao desconhecido e recusado");
    let refused = false;
    try {
      recordAssetAuthorization(directory, { ...record, authorization: { ...LIBRARY, verifiedAt: "" } });
    } catch {
      refused = true;
    }
    assert(refused && !existsSync(authorizationRegistryFile(directory)), "registro invalido nao e gravado");

    recordAssetAuthorization(directory, record);
    recordAssetAuthorization(directory, { ...record, recordedAt: "2026-10-21T10:00:00.000Z", authorization: { ...LIBRARY, revokedAt: "2026-10-21T09:00:00.000Z" } });
    const lines = readFileSync(authorizationRegistryFile(directory), "utf8").trim().split("\n");
    assert(lines.length === 2, "o registro e so de acrescimo: a retirada nao apaga a evidencia anterior");
    const latest = readAuthorizationRegistry(directory).get(url);
    assert(latest?.authorization.revokedAt === "2026-10-21T09:00:00.000Z", "vale a linha mais recente de cada arquivo");
    assert(parseAuthorizationRegistry("not json\n{\"originalUrl\":\"https://x.example/a.png\"}\n").size === 0, "linhas ilegiveis ou incompletas sao ignoradas, nunca confiadas");
    assert(readAuthorizationRegistry(path.join(directory, "missing")).size === 0, "sem registro nao ha evidencia");

    const row: OfficialPromoAsset = {
      id: 7,
      campaignId: 9,
      sourcePage: MATERIALS,
      section: "product",
      originalUrl: url,
      fileName: "lumina-drops-bottle.png",
      status: "approved",
      blockReason: null,
      reviewNote: null,
      width: 800,
      height: 1000,
      bytes: 600,
      format: "png",
      productMatch: "confirmed",
      permissionEvidence: "Displayed on the page, permission not explicit.",
      verifiedAt: NOW,
      localFile: "/media/campaign-asset/9/7.png",
      isHero: true,
    };
    const measured = measure(png(800, 1000, 9), "image/png");
    const withoutRecord = candidateFromOfficialRow(row, "Lumina Drops", { measured });
    assert(withoutRecord.authorizationEvidence === null && withoutRecord.listing.section === "DISPLAYED_ONLY", "linha sem registro continua sem autorizacao");
    const withRecord = candidateFromOfficialRow(row, "Lumina Drops", { measured, record: { ...record, authorization: LIBRARY } });
    assert(withRecord.authorizationEvidence?.kind === "OFFICIAL_AFFILIATE_ASSET_LIBRARY" && withRecord.listing.section === "PRODUCT_IMAGES" && withRecord.declaredProduct === "Lumina Drops", "o registro entrega evidencia, secao e produto declarado");
    assert(evaluate(withRecord).authorization.status === "DOCUMENTED", "a linha com registro passa a ter autorizacao documentada");
    const withdrawnRecord = candidateFromOfficialRow(row, "Lumina Drops", { measured, record: latest ?? null });
    const withdrawnEvaluation = evaluate(withdrawnRecord);
    assert(withdrawnEvaluation.status === "REJECTED" && withdrawnEvaluation.authorization.status === "DENIED", "linha ja aprovada cuja autorizacao foi retirada no registro sai do contrato");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  // ============ 11. Integration, generic code ============

  const root = process.cwd();
  const moduleDir = path.join(root, "src/lib/product-assets");
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = ["types", "authorization", "evaluate", "registry", "from-official", "campaign"].map((name) => ({ name, text: code(readFileSync(path.join(moduleDir, `${name}.ts`), "utf8")) }));
  assert(files.every((file) => !/neuroprime|neuro xt|cholibrium|joint genesis|northwind capsule/i.test(file.text)), "sem regra por produto, slug ou caminho de origem na politica");
  assert(files.every((file) => !/product-facts|editorial|landing-composer|components\//.test(file.text.replace(/from "@\/lib\/official-assets[^"]*"/g, ""))), "a politica nao toca ProductFacts nem editorial");
  assert(files.every((file) => !/\bfetch\(|XMLHttpRequest/.test(file.text)), "a politica nao faz rede");
  const adaptSource = readFileSync(path.join(root, "src/lib/product-showcase/adapt.ts"), "utf8");
  assert(/options\.approvedImage !== undefined \? options\.approvedImage : officialCampaignImage\(campaign\)/.test(adaptSource), "um contrato resolvido e definitivo, inclusive quando e nulo");
  const adaptCampaign = readFileSync(path.join(root, "src/lib/product-showcase/adapt-campaign.ts"), "utf8");
  assert(/showcaseImageFromContract\(resolveCampaignProductAssets\(campaign\)\.contract\)/.test(adaptCampaign) && /approvedImage,/.test(adaptCampaign), "a entrada de servidor sempre passa o resultado do contrato");

  // ============ 12. Real data, read-only ============

  const serum = getCampaignById(183);
  if (serum) {
    const doc = readStoredLandingDocument(serum.id);
    if (doc && serum.productImageSrc) {
      const shell = { siteName: "Product Reviews", affiliateDisclosure: "Disclosure.", healthDisclaimer: null, review: null, footerLinks: [], channel: "presell" as const };
      const legacy = adaptModel(serum, doc, shell);
      const resolved = adaptModel(serum, doc, { ...shell, approvedImage: null });
      assert(resolved.image === null, "campanha 183: com o contrato resolvido e sem imagem aprovada, a imagem anexada nao e exibida");
      assert(JSON.stringify(legacy.image) === JSON.stringify(officialCampaignImage(serum)), "campanha 183: quem nao resolve o contrato segue com o caminho anterior, inalterado");
      assert(legacy.image !== null, "campanha 183: o caso so prova algo se o caminho anterior de fato exibia a imagem");
    }
  }
  const neuro = getCampaignById(190);
  if (neuro) {
    const { resolveCampaignProductAssets } = await import("../src/lib/product-assets/campaign.ts");
    const result = resolveCampaignProductAssets(neuro, () => new Date().toISOString());
    assert(result.contract.hero === null && result.contract.approved.length === 0, "campanha 190: sem evidencia de oferta aos afiliados, nenhuma imagem e aprovada");
    assert(result.evaluations.every((item) => item.status !== "APPROVED"), "campanha 190: nenhuma avaliacao aprovada");
    assert(neuro.publicationStatus === "draft", "campanha 190: status de publicacao intacto");

    // contract -> model -> Premium V3 hero, with a fictional approved packshot
    const doc = readStoredLandingDocument(neuro.id);
    if (doc) {
      (require as unknown as { extensions: Record<string, unknown> }).extensions[".css"] = () => {};
      const React = await import("react");
      (globalThis as unknown as { React: unknown }).React = React;
      const { renderToStaticMarkup } = await import("react-dom/server");
      const { PremiumV3 } = await import("../src/components/product-showcase/product-showcase-premium-v3.tsx");
      const shell = { siteName: "Product Reviews", affiliateDisclosure: "Disclosure.", healthDisclaimer: null, review: null, footerLinks: [], channel: "presell" as const };
      const render = (image: { src: string; alt: string } | null) =>
        renderToStaticMarkup(React.createElement(PremiumV3, { model: adaptModel(neuro, doc, { ...shell, approvedImage: image }), fontClassName: "f" } as never));
      const approvedPackshot = candidate({ id: "v1", productName: "NeuroPrime" });
      const approvedContract = buildProductAssetsContract("Lumina Drops", [approvedPackshot], evaluateCandidates([approvedPackshot], CONTEXT));
      const withImage = render(showcaseImageFromContract(approvedContract));
      const revokedPackshot = candidate({ id: "v2", authorizationEvidence: evidence({ revokedAt: "2026-10-19T09:00:00.000Z" }) });
      const revokedContractNow = buildProductAssetsContract("Lumina Drops", [revokedPackshot], evaluateCandidates([revokedPackshot], CONTEXT));
      const withoutImage = render(showcaseImageFromContract(revokedContractNow));
      assert(/data-has-image="1"/.test(withImage) && /psp-hero-figure/.test(withImage) && withImage.includes(`src="/media/campaign-asset/9/1.png"`), "V3: o packshot aprovado pelo contrato aparece no hero");
      assert(/data-has-image="0"/.test(withoutImage) && !/psp-hero-media|psp-hero-figure/.test(withoutImage) && !withoutImage.includes("/media/campaign-asset/9/1.png"), "V3: com a autorizacao retirada o hero volta ao fallback neutro, sem midia");
      const textOnly = (html: string) => html.replace(/<img[^>]*>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      assert(!/MAT-104|Lumina Affiliate Program|affiliate material library|OFFICIAL_AFFILIATE/.test(withImage), "V3: a evidencia de autorizacao nunca chega ao HTML da pagina");
      assert(textOnly(withImage).length > 0 && textOnly(withoutImage).length > 0, "V3: os dois estados renderizam texto");
    }
  }

  console.log("PRODUCT_ASSETS_AUTHORIZATION_POLICY_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
