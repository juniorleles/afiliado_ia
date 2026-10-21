import { getCampaignById, setCampaignPresentationTemplate } from "../src/lib/campaigns.ts";
import { getDb } from "../src/lib/db.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import {
  applyAuthorizedOverrides,
  isDemoAssetSrc,
  officialCampaignImage,
  presentationUsesShowcase,
  presellShowcaseCta,
} from "../src/lib/product-showcase/adapt.ts";
import { adaptLandingToShowcase } from "../src/lib/product-showcase/adapt-campaign.ts";
import { demoDocument } from "../src/lib/product-showcase/demo-art.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const shell = {
  siteName: "Product Reviews",
  affiliateDisclosure: "Disclosure.",
  healthDisclaimer: null,
  review: null,
  footerLinks: [],
};

function visible(model: ReturnType<typeof adaptLandingToShowcase>): string {
  return JSON.stringify({
    name: model.productName,
    eyebrow: model.eyebrow,
    lead: model.lead,
    highlights: model.highlights,
    ingredients: model.ingredients.map((item) => item.name),
    guarantee: model.guarantee,
    notices: model.notices,
    cta: model.cta,
    image: model.image,
  }).toLowerCase();
}

assert(presentationUsesShowcase(null) === false && presentationUsesShowcase("REVIEW") === false, "campanha sem seleção continua no renderer atual");
assert(presentationUsesShowcase("PRODUCT_SHOWCASE_PREMIUM_V1"), "a seleção premium é explícita");
assert(isDemoAssetSrc("/demo-assets/harbor-demo-assets/hero-photo.jpg"), "o caminho da demo é reconhecido");
assert(officialCampaignImage({ productImageSrc: "/demo-assets/harbor-demo-assets/hero-photo.jpg", productImageProvenance: "MANUAL", headline: "Harbor" }) === null, "imagem da demo não entra numa campanha");
assert(presellShowcaseCta("See offer", "javascript:alert(1)", "presell") === null, "CTA javascript fica de fora");
assert(presellShowcaseCta("Continue with this educational page.", "https://shop.example/hop", "presell") === null, "frase educacional não vira botão");
assert(presellShowcaseCta("See offer", "https://shop.example/hop", null) === null, "sem canal de presell não há CTA");
assert(presellShowcaseCta("See offer", "https://shop.example/demo-assets/hop", "presell") === null, "URL da demo não vira hop");

for (const id of [188, 186, 189]) {
  const campaign = getCampaignById(id);
  const document = campaign ? readStoredLandingDocument(campaign.id) : null;
  assert(Boolean(campaign && document), `campanha ${id} tem documento`);
  if (!campaign || !document) continue;
  const before = campaign.presentationTemplate ?? null;
  assert(before === null, `campanha ${id} não foi trocada automaticamente`);
  const model = adaptLandingToShowcase(campaign, document, { ...shell, channel: "presell" });
  const text = visible(model);
  assert(!text.includes("cholesterol") && !text.includes("inflammation") && !text.includes("carefully crafted"), `campanha ${id} não mostra claim não autorizado`);
  assert(!text.includes("demo-assets"), `campanha ${id} não usa asset da demo`);
  assert(model.cta === null, `campanha ${id} não ganha CTA sem rótulo e URL`);
  assert(model.mode === "facts", `campanha ${id} permanece em fatos`);
  if (id === 186) assert(model.ingredients.length === 0, "Joint Genesis não inventa ingredientes");
  if (id === 188) assert(model.ingredients.length === 10 && model.guarantee?.origin === "Product source", "Cholibrium mantém dez nomes e a origem da garantia");
}

const cholibrium = getCampaignById(188);
const cholibriumDocument = cholibrium ? readStoredLandingDocument(cholibrium.id) : null;
if (cholibrium && cholibriumDocument) {
  const patched = applyAuthorizedOverrides(cholibriumDocument, [
    { id: "hero.headline", effective: "Harbor Capsule", modified: true },
  ]);
  const model = adaptLandingToShowcase(cholibrium, patched, { ...shell, channel: "presell" });
  assert(model.productName === "Harbor Capsule", "override autorizado do builder entra na apresentação");
  assert(!JSON.stringify(model).includes("demo-assets"), "o override não puxa a demo");
}

const demo = demoDocument();
assert(demo.campaignId === 0, "Harbor Capsule continua só no documento da demo");

const db = getDb();
const statusBefore = db.prepare("SELECT presentationTemplate, publicationStatus FROM campaigns WHERE id = 188").get() as {
  presentationTemplate: string | null;
  publicationStatus: string;
};
const tx = db.transaction(() => {
  const updated = setCampaignPresentationTemplate(188, "PRODUCT_SHOWCASE_PREMIUM_V1");
  assert(updated.presentationTemplate === "PRODUCT_SHOWCASE_PREMIUM_V1", "a seleção premium é gravada");
  assert(updated.publicationStatus === statusBefore.publicationStatus, "trocar o template não publica");
  throw new Error("rollback");
});
try {
  tx();
} catch (error) {
  if (!(error instanceof Error) || error.message !== "rollback") throw error;
}
const statusAfter = db.prepare("SELECT presentationTemplate, publicationStatus FROM campaigns WHERE id = 188").get() as {
  presentationTemplate: string | null;
  publicationStatus: string;
};
assert(statusAfter.presentationTemplate === statusBefore.presentationTemplate, "o teste devolve a seleção anterior");
assert(statusAfter.publicationStatus === statusBefore.publicationStatus, "o status de publicação permanece");

console.log("test-showcase-integration: ok");
