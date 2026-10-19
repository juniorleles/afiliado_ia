import { existsSync } from "node:fs";
import path from "node:path";
import { DEMO_FORMAT, DEMO_HERO, DEMO_INGREDIENTS, demoDocument } from "../src/lib/product-showcase/demo-art.ts";
import { buildProductShowcase } from "../src/lib/product-showcase/model.ts";
import type { LandingDocument } from "../src/lib/landing-composer/types.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

function document(sections: LandingDocument["sections"]): LandingDocument {
  return {
    version: 1,
    campaignId: 1,
    language: "en",
    generatedAt: "2026-10-14T00:00:00.000Z",
    sections,
    seo: null,
    schema: null,
    metadata: { approachId: null, compositionTimeMs: 1, inputFingerprint: "showcase", cached: false, included: [], omitted: [] },
    validationStatus: "PASS",
    renderStatus: "READY",
    warnings: [],
    errors: [],
  };
}

const shown = buildProductShowcase(document([
  { sectionId: "hero", content: { headline: "Harbor Capsule", subheadline: null }, warnings: [] },
  { sectionId: "benefits", content: { fromFacts: ["Natural mushroom-based formula", "Easy once-daily capsule", "Supports healthy cholesterol levels", "Helps reduce inflammation"] }, warnings: [] },
  { sectionId: "ingredients", content: { names: ["Harbor mycelium", "Harbor reishi"] }, warnings: [] },
  { sectionId: "guarantee", content: { text: "60-day refund" }, warnings: [] },
  { sectionId: "problem", content: { cautions: ["This product is not intended to diagnose, treat, cure, or prevent any disease."] }, warnings: [] },
]), {
  siteName: "Product Reviews",
  affiliateDisclosure: "Disclosure: I may earn a commission if you purchase through links on this page.",
  footerLinks: [{ href: "/privacy", label: "Privacy Policy" }],
});

assert(shown.template === "PRODUCT_SHOWCASE_PREMIUM_V1", "o protótipo usa o template isolado");
assert(shown.productName === "Harbor Capsule", "o nome vem do documento");
assert(shown.eyebrow === "Natural mushroom-based formula" && shown.lead === "Easy once-daily capsule", "a descrição neutra fica no hero e o formato no destaque");
assert(shown.highlights.join("|") === "2 declared ingredients", "chips não repetem eyebrow nem descrição");
assert(shown.characteristics.length === 1 && shown.characteristics[0].label === "Format" && shown.characteristics[0].text === "Easy once-daily capsule", "o formato autorizado entra como característica");
assert(shown.ingredients.map((item) => item.name).join("|") === "Harbor mycelium|Harbor reishi", "os ingredientes declarados permanecem");
assert(shown.ingredientPhotos === false, "foto parcial não libera a grade ilustrada");
assert(shown.guarantee?.text === "60-day refund" && shown.guarantee.origin === "Product source", "a garantia restaura a origem da fonte");
assert(shown.notices.some((item) => /not intended to diagnose/i.test(item)), "o aviso legal permanece");
const visible = JSON.stringify({ eyebrow: shown.eyebrow, lead: shown.lead, highlights: shown.highlights, characteristics: shown.characteristics, ingredients: shown.ingredients, guarantee: shown.guarantee, notices: shown.notices }).toLowerCase();
assert(!/cholesterol|inflammation/.test(visible), "claim de saúde não entra no protótipo");
assert(shown.cta === null, "o modelo não cria CTA");

const rejected = buildProductShowcase(document([
  { sectionId: "hero", content: { headline: "Harbor Capsule", subheadline: null }, warnings: [] },
  { sectionId: "benefits", content: { fromFacts: ["Easy once-daily capsule"] }, warnings: [] },
  { sectionId: "ingredients", content: { names: ["Harbor mycelium", "Harbor reishi"] }, warnings: [] },
]), {
  siteName: "Product Reviews",
  affiliateDisclosure: "Disclosure.",
  footerLinks: [],
  cta: { href: "javascript:alert(1)", label: "Buy" },
  ingredientImages: [{ name: "Harbor mycelium", src: "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'/%3E", alt: "Fictional swatch" }],
});
assert(rejected.cta === null, "URL que não é http fica fora do CTA");
assert(rejected.ingredientPhotos === false && rejected.ingredients[0].image && rejected.ingredients[1].image === null, "imagem sem par para cada nome não vira grade completa");

const sparse = buildProductShowcase(document([
  { sectionId: "hero", content: { headline: "Harbor Capsule", subheadline: "Harbor Capsule is a daily capsule." }, warnings: [] },
  { sectionId: "benefits", content: { fromFacts: ["Daily capsule"] }, warnings: [] },
]), {
  siteName: "Product Reviews",
  affiliateDisclosure: "Disclosure.",
  footerLinks: [],
});
assert(sparse.eyebrow === "Harbor Capsule is a daily capsule." && sparse.characteristics.length === 0 && sparse.lead === null, "fato já usado no hero não vira outra seção");
assert(sparse.ingredients.length === 0 && sparse.guarantee === null, "seções sem conteúdo ficam de fora");

const demo = buildProductShowcase(demoDocument(), {
  mode: "demo",
  image: DEMO_HERO,
  ingredientImages: DEMO_INGREDIENTS,
  formatImage: DEMO_FORMAT,
  siteName: "Demo Reviews",
  affiliateDisclosure: "Disclosure.",
  footerLinks: [],
});
assert(demo.mode === "demo" && demo.productName === "Harbor Capsule" && demo.ingredientPhotos, "a demo usa produto fictício e só mostra fotos quando todos os nomes têm imagem");
assert(demo.eyebrow === null && demo.lead === "Easy once-daily capsule" && demo.highlights.join("|") === "10 declared ingredients", "a demo não repete o mesmo fato no eyebrow, na descrição e nos chips");
assert(!JSON.stringify(demo).toLowerCase().includes("cholibrium") && !JSON.stringify(demo).toLowerCase().includes("cholesterol"), "a demo não usa a identidade real nem o claim removido");
assert(demo.image?.src.endsWith("/hero-photo.jpg") && demo.formatImage?.src.endsWith("/capsules-photo.jpg"), "a demo aponta para as fotos do hero e das cápsulas");
assert(DEMO_INGREDIENTS.length === 10 && DEMO_INGREDIENTS.every((item) => demo.ingredients.some((row) => row.name === item.name && row.image?.src === item.src)), "cada ingrediente fictício tem o arquivo correspondente");
const paper = DEMO_INGREDIENTS.find((item) => item.name === "Paper Cap");
assert(paper?.src.endsWith("/ingredient-paper-cap.jpg") === true, "Paper Cap tem o recorte próprio");
for (const image of [DEMO_HERO, DEMO_FORMAT, ...DEMO_INGREDIENTS]) {
  const relative = image.src.replace(/^\//, "");
  assert(existsSync(path.join("public", relative)), "o arquivo da demo existe: " + relative);
}

console.log("test-product-showcase: ok");
