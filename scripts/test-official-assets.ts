import { deflateSync } from "node:zlib";
import { rmSync } from "node:fs";
import { getCampaignById, setCampaignHeroPackshot } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { extractOfficialPromoImages, officialToolsPageAllowed } from "../src/lib/official-assets/extract.ts";
import { promoImageLandingBlock } from "../src/lib/official-assets/review.ts";
import { officialCampaignImage } from "../src/lib/product-showcase/adapt.ts";
import {
  approveOfficialPromoAsset,
  campaignAssetDir,
  discoverOfficialPromoHtml,
  listOfficialPromoAssets,
  readApprovedCampaignAsset,
  rejectOfficialPromoAsset,
  storedProductName,
} from "../src/lib/official-assets/store.ts";

const SOURCE = "https://cb.cholibrium.com/aff/afftools.php";
const REVIEW_NOTES: Record<string, string> = {
  "Cholibrium-Slider2.png": "Texto incorporado contém alegações de saúde: coração, colesterol, pressão, peso e energia.",
  "Cholibrium-Slider3.png": "Texto incorporado contém alegação de saúde no rótulo e tabela de doses.",
  "71p6TPX+iOL._AC_SL1500_.jpg": "Texto incorporado contém alegações de saúde: imunidade, coração e circulação.",
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

function png(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const index = row + 1 + x * 4;
      raw[index] = 30;
      raw[index + 1] = 90;
      raw[index + 2] = 70;
      raw[index + 3] = 255;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc(buffer: Buffer): number {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function adsCount(campaignId: number): number {
  try {
    const row = getDb().prepare("SELECT COUNT(*) AS n FROM google_ads_publications WHERE local_campaign_id = ?").get(campaignId) as { n: number };
    return row.n;
  } catch {
    return -1;
  }
}

const fixture = `
  <h3>Product Images</h3>
  <img src="https://files.example/northwind-bottle.png">
  <img src="https://cdn.example/logo.svg">
  <h3>Campaign Images</h3>
  <img src="https://files.example/clears-cholesterol-overnight.jpg">
  <h3>Contact</h3>
  <img src="https://files.example/footer-logo.png">
`;

async function main() {
  assert(officialToolsPageAllowed("https://www.google.com/search?q=packshot") === false, "busca do Google não é fonte");
  assert(extractOfficialPromoImages(fixture, "https://www.google.com/search").length === 0, "HTML de busca não gera candidatos");
  const extracted = extractOfficialPromoImages(fixture, "https://files.example/tools");
  assert(extracted.length === 2, "só as duas seções oficiais");
  assert(extracted.some((item) => item.fileName === "northwind-bottle.png" && item.section === "product"), "packshot de produto");
  assert(extracted.some((item) => item.section === "campaign"), "imagem de campanha");
  assert(!extracted.some((item) => item.fileName.includes("footer") || item.fileName.endsWith(".svg")), "logo e rodapé ficam de fora");
  assert(promoImageLandingBlock("clears-cholesterol-overnight.jpg") !== null, "claim no nome bloqueia a LP");

  const before188 = getCampaignById(188);
  const before186 = getCampaignById(186);
  const before189 = getCampaignById(189);
  if (!before188 || !before186 || !before189) throw new Error("campanhas de teste ausentes");
  const adsBefore = adsCount(188);

  const response = await fetch(SOURCE);
  if (!response.ok) throw new Error("página oficial indisponível");
  const html = await response.text();
  const live = extractOfficialPromoImages(html, SOURCE);
  assert(live.some((item) => item.section === "product") && live.some((item) => item.section === "campaign"), "página oficial tem as duas seções");
  assert(!live.some((item) => /puraburn|footer-logo|facebook\.com/i.test(item.originalUrl)), "outras imagens da página não entram");

  discoverOfficialPromoHtml({
    campaignId: 188,
    pageUrl: SOURCE,
    html,
    productName: storedProductName(before188.sourceFactsJson, before188.name),
    verifiedAt: "2026-10-15T15:00:00.000Z",
  });
  for (const asset of listOfficialPromoAssets(188)) {
    if (asset.section !== "product" || asset.status !== "pending") continue;
    const note = REVIEW_NOTES[asset.fileName];
    if (!note) throw new Error("imagem de produto sem revisão visual: " + asset.fileName);
    rejectOfficialPromoAsset(188, asset.id, note);
  }

  const saved = listOfficialPromoAssets(188);
  assert(saved.length === live.length, "candidatos persistidos");
  assert(saved.every((asset) => asset.sourcePage === SOURCE), "página de origem registrada");
  assert(saved.every((asset) => asset.permissionEvidence.includes("não comprova alegação médica")), "permissão não vira evidência médica");
  assert(saved.every((asset) => asset.verifiedAt.startsWith("2026-10-15")), "data de verificação");
  assert(saved.filter((asset) => asset.section === "campaign").every((asset) => asset.status === "rejected"), "campanhas com claim ficam rejeitadas");
  assert(saved.filter((asset) => asset.section === "product").every((asset) => asset.status === "rejected" && asset.reviewNote), "produtos com texto incorporado ficam rejeitados");
  assert(saved.every((asset) => !asset.isHero && !asset.localFile), "nenhuma imagem foi associada");
  assert(readApprovedCampaignAsset(188, "1.jpg") === null, "rejeitada não é servida");

  const after188 = getCampaignById(188);
  if (!after188) throw new Error("188 ausente");
  assert(after188.productImageSrc === before188.productImageSrc, "hero real permanece vazio");
  assert(after188.sourceFactsJson === before188.sourceFactsJson, "Product Facts intactos");
  assert(after188.publicationStatus === "draft" && after188.publishedAt === before188.publishedAt, "publicação intacta");
  assert(after188.presentationTemplate === before188.presentationTemplate, "renderer intacto");
  assert(adsCount(188) === adsBefore, "PPC não foi alterado");
  assert(getCampaignById(186)?.productImageSrc === before186.productImageSrc, "campanha sem imagem continua igual");

  const db = getDb();
  db.exec("BEGIN");
  try {
    discoverOfficialPromoHtml({
      campaignId: 189,
      pageUrl: "https://files.example/tools",
      html: fixture,
      productName: "Northwind Capsule",
      verifiedAt: "2026-10-15T15:00:00.000Z",
    });
    const rows = listOfficialPromoAssets(189);
    const pending = rows.find((asset) => asset.fileName === "northwind-bottle.png");
    const blocked = rows.find((asset) => asset.fileName === "clears-cholesterol-overnight.jpg");
    if (!pending || !blocked) throw new Error("fila fictícia incompleta");
    assert(blocked.status === "rejected", "claim fictício rejeitado na descoberta");
    let refused = false;
    try {
      approveOfficialPromoAsset({ campaignId: 189, assetId: blocked.id, bytes: png(120, 120), embeddedTextCleared: true, productMatchConfirmed: true });
    } catch {
      refused = true;
    }
    assert(refused, "rejeitada não pode ser aprovada");
    const approved = approveOfficialPromoAsset({
      campaignId: 189,
      assetId: pending.id,
      bytes: png(120, 120),
      embeddedTextCleared: true,
      productMatchConfirmed: true,
    });
    const heroCampaign = getCampaignById(189);
    if (!heroCampaign) throw new Error("189 ausente");
    assert(heroCampaign.productImageSrc === approved.localFile, "hero usa só o arquivo aprovado");
    assert(!approved.localFile?.includes("demo-assets"), "arquivo aprovado fica fora da demo");
    assert(officialCampaignImage(heroCampaign)?.src === approved.localFile, "showcase lê o packshot aprovado");
    assert(heroCampaign.productImageSrc !== blocked.originalUrl, "rejeitada não entra na LP");
    assert(heroCampaign.sourceFactsJson === before189.sourceFactsJson, "facts do teste fictício intactos");
    assert(heroCampaign.publicationStatus === before189.publicationStatus, "publicação do teste fictício intacta");
  } finally {
    db.exec("ROLLBACK");
    rmSync(campaignAssetDir(189), { recursive: true, force: true });
  }

  const restored = getCampaignById(189);
  assert(restored?.productImageSrc === before189.productImageSrc, "hero fictício não persistiu");
  assert(listOfficialPromoAssets(189).every((asset) => asset.sourcePage !== "https://files.example/tools"), "fila fictícia revertida");
  let demoRefused = false;
  try {
    setCampaignHeroPackshot(189, "/demo-assets/harbor-demo-assets/hero-photo.jpg", "MANUAL");
  } catch {
    demoRefused = true;
  }
  assert(demoRefused && getCampaignById(189)?.productImageSrc === before189.productImageSrc, "demo não entra em campanha real");

  for (const slug of ["cholibrium", "campanha-testes", "northwind-qa"]) {
    const page = await fetch(`http://127.0.0.1:3000/p/${slug}`);
    assert(page.status === 404, `rascunho /p/${slug} segue 404`);
  }
  console.log("OFFICIAL_ASSETS_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
