import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readAffiliateProgram } from "../src/lib/affiliate-program.ts";
import { presentLandingDocument } from "../src/lib/landing-composer/present.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { listOfficialPromoAssets } from "../src/lib/official-assets/store.ts";
import { adaptLandingToShowcase } from "../src/lib/product-showcase/adapt.ts";
import { getDb } from "../src/lib/db.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

async function main() {
  const campaign = getCampaignById(190);
  assert(!!campaign && campaign.slug === "neuroprime", "campanha 190");
  assert(campaign!.publicationStatus === "draft" && !campaign!.publishedAt, "rascunho");
  assert(campaign!.presentationTemplate === "PRODUCT_SHOWCASE_PREMIUM_V1", "Premium V1 só na 190");
  assert(!campaign!.productImageSrc && !campaign!.affiliateUrl && !campaign!.ctaLabel, "sem packshot/CTA");

  const document = readStoredLandingDocument(190);
  assert(!!document, "landing document existe");
  assert(document!.metadata.gates?.policy === "PASS", "policy gate");
  assert(document!.metadata.gates?.structural === "PASS", "sem features elegíveis structural PASS");
  assert(document!.metadata.gates?.grounding === "PASS", "conteúdo presente fundamentado");
  assert(document!.metadata.gates?.publication === "HELD", "HELD não publica");
  assert(!document!.sections.some((section) => section.sectionId === "benefits"), "benefits omitido sem features");

  const presented = presentLandingDocument(document!);
  assert(presented.sections.some((section) => section.kind === "ingredients"), "ingredientes visíveis");
  assert(presented.sections.some((section) => section.kind === "guarantee"), "garantia visível");
  assert(!presented.repeatsSourceHealthClaim, "sem claim de saúde na apresentação");
  assert(!/\bmemory\b|\bcognitive\b/i.test(JSON.stringify(presented)), "sem alegação cognitiva no consumer present");

  const facts = JSON.parse(campaign!.sourceFactsJson || "{}");
  assert(
    facts.ingredientContext?.some((entry: { copyEligibility: string; statement: string }) => entry.copyEligibility === "NO" && /memory/i.test(entry.statement)),
    "claim cognitivo permanece nos dados",
  );

  const showcase = adaptLandingToShowcase(campaign!, document!, {
    channel: "presell",
    siteName: "Product Reviews",
    affiliateDisclosure: "Disclosure.",
    footerLinks: [],
  });
  assert(showcase.ingredients.length === 9, "9 ingredientes");
  assert(!showcase.image && !showcase.cta, "sem imagem e sem CTA");
  assert(!showcase.gallery.some((image) => /demo-assets/i.test(image.src)), "sem demo");

  const assets = listOfficialPromoAssets(190);
  assert(assets.every((asset) => asset.status !== "approved"), "assets rejeitados não aprovados");

  const program = readAffiliateProgram(190);
  assert(program?.brandPpc === "BLOCKED" && program.genericSearchPpc === "UNKNOWN", "PPC preservado");

  const peers = getDb()
    .prepare("SELECT id, presentationTemplate, publicationStatus FROM campaigns WHERE id IN (186,188,189)")
    .all() as Array<{ id: number; presentationTemplate: string | null; publicationStatus: string }>;
  assert(peers.every((row) => row.presentationTemplate === null && row.publicationStatus === "draft"), "186/188/189 intactas");

  const dir = path.join(process.cwd(), "data", "evidence", "neuroprime-premium-draft-v1");
  assert(existsSync(path.join(dir, "preview-desktop-1440.png")), "screenshot desktop");
  assert(existsSync(path.join(dir, "preview-mobile-390.png")), "screenshot mobile");
  const summary = JSON.parse(readFileSync(path.join(dir, "summary.json"), "utf8"));
  assert(summary.template === "PRODUCT_SHOWCASE_PREMIUM_V1", "summary template");

  for (const slug of ["neuroprime", "cholibrium", "campanha-testes", "northwind-qa"]) {
    const page = await fetch(`http://127.0.0.1:3000/p/${slug}`);
    assert(page.status === 404, `/p/${slug} 404`);
  }

  const builder = await fetch(`http://127.0.0.1:3000/admin/lp-builder/190`);
  assert(builder.status === 200, "builder 200");

  console.log("NEUROPRIME_PREMIUM_DRAFT_OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
