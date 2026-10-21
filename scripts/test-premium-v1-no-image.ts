import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { adaptLandingToShowcase } from "../src/lib/product-showcase/adapt-campaign.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

async function main() {
  const campaign = getCampaignById(190);
  const document = campaign ? readStoredLandingDocument(campaign.id) : null;
  assert(!!campaign && !!document, "campanha 190 com documento");
  assert(campaign!.publicationStatus === "draft", "publicação intacta");
  assert(campaign!.presentationTemplate === "PRODUCT_SHOWCASE_PREMIUM_V1", "template intacto");
  assert(!campaign!.productImageSrc, "sem packshot aprovado");

  const showcase = adaptLandingToShowcase(campaign!, document!, {
    channel: "presell",
    siteName: "Product Reviews",
    affiliateDisclosure: "Disclosure.",
    footerLinks: [],
  });
  assert(!showcase.image, "modelo sem imagem oficial");
  assert(showcase.ingredients.length === 9, "nove ingredientes preservados");
  assert(!showcase.cta, "sem CTA sem hoplink");
  assert(document!.metadata.gates?.structural === "PASS", "structural gate intacto");
  assert(document!.metadata.gates?.grounding === "PASS", "grounding gate intacto");
  assert(document!.metadata.gates?.publication === "HELD", "publication HELD");

  const component = readFileSync(path.join(process.cwd(), "src/components/product-showcase/product-showcase-premium-v1.tsx"), "utf8");
  assert(!/Official image not available/i.test(component), "texto técnico removido do componente");
  assert(component.includes("psp-hero-editorial"), "hero editorial sem imagem");
  assert(component.includes("psp-names-type"), "grade tipográfica de ingredientes");

  const previewPage = readFileSync(path.join(process.cwd(), "src/app/admin/preview/[slug]/page.tsx"), "utf8");
  assert(previewPage.includes("/visual-frame/"), "admin preview aponta para clean LP");
  assert(previewPage.includes("DesignStudioPanel"), "painel admin de diagnóstico preservado");

  const dir = path.join(process.cwd(), "data", "evidence", "neuroprime-no-image-presentation-v1");
  assert(existsSync(path.join(dir, "clean-desktop-1440.png")), "screenshot desktop");
  assert(existsSync(path.join(dir, "clean-tablet-768.png")), "screenshot tablet");
  assert(existsSync(path.join(dir, "clean-mobile-390.png")), "screenshot mobile");
  const summary = JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8"));
  assert(summary.cleanPreviewRoute === "/visual-frame/neuroprime", "rota clean preview");
  assert(summary.publicDraft404 === true, "draft público 404 no capture");
  assert(summary.viewports?.every((item: { technicalMissing: boolean; adminChrome: boolean; overflow: boolean }) => !item.technicalMissing && !item.adminChrome && !item.overflow), "viewports limpos");

  for (const slug of ["neuroprime", "cholibrium", "campanha-testes", "northwind-qa"]) {
    const page = await fetch(`http://127.0.0.1:3000/p/${slug}`);
    assert(page.status === 404, `/p/${slug} 404`);
  }

  const clean = await fetch("http://127.0.0.1:3000/visual-frame/neuroprime");
  assert(clean.status === 200, "clean preview 200");
  const html = await clean.text();
  assert(!/official image not available/i.test(html), "sem texto técnico no HTML");
  assert(/psp-hero-editorial/.test(html), "hero editorial no HTML");
  assert(/psp-names-type/.test(html), "grade tipográfica no HTML");
  assert(!/PREVIEW — NOT PUBLISHED|CONTENT GATE/i.test(html), "sem chrome admin no clean preview");
  assert(!/demo-assets/i.test(html), "sem demo assets");

  const admin = await fetch("http://127.0.0.1:3000/admin/preview/neuroprime");
  assert(admin.status === 200, "admin preview preservada");
  const adminHtml = await admin.text();
  assert(/Clean LP preview/i.test(adminHtml), "link clean preview no admin");
  assert(/Design Studio|CONTENT GATE|PREVIEW — NOT PUBLISHED/i.test(adminHtml), "painel diagnóstico permanece");

  console.log("PREMIUM_V1_NO_IMAGE_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
