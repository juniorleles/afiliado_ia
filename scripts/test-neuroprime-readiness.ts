import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getCampaignBySlug } from "../src/lib/campaigns.ts";
import { readAffiliateProgram } from "../src/lib/affiliate-program.ts";
import { listOfficialPromoAssets } from "../src/lib/official-assets/store.ts";
import { getDb } from "../src/lib/db.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  console.log("OK: " + message);
}

async function main() {
  const campaign = getCampaignBySlug("neuroprime");
  assert(!!campaign, "campanha neuroprime existe");
  assert(campaign!.publicationStatus === "draft", "publicação permanece draft");
  assert(!campaign!.publishedAt, "sem publishedAt");
  assert(!campaign!.affiliateUrl, "sem hoplink pessoal");
  assert(!campaign!.productImageSrc, "sem packshot associado");
  assert(
    campaign!.presentationTemplate === null || campaign!.presentationTemplate === "PRODUCT_SHOWCASE_PREMIUM_V1",
    "renderer legado ou Premium V1",
  );
  assert(!campaign!.headline && !campaign!.body, "headline/body brutos permanecem vazios");

  const facts = JSON.parse(campaign!.sourceFactsJson || "{}");
  assert(facts.productName === "NeuroPrime", "nome do produto");
  assert(facts.sourceUrl === "https://theneuroprime.com/", "fonte oficial de vendas");
  assert(facts.confidence.ingredientsOrComponents === "DIRECT_SOURCE", "ingredientes oficiais");
  assert(facts.ingredientsOrComponents.length === 9, "nove ingredientes listados");
  assert(facts.confidence.manufacturer === "NOT_FOUND", "fabricante legal não inventado");
  assert(facts.features.length === 0, "features terapêuticas não viraram facts copy-ready");
  assert(
    Array.isArray(facts.ingredientContext)
      && facts.ingredientContext.every((entry: { copyEligibility: string }) => entry.copyEligibility === "NO"),
    "claim de memória fica seller-attributed e não copy-eligible",
  );
  assert(
    !JSON.stringify(facts).toLowerCase().includes("market intelligence")
      || facts.importWarnings.some((w: string) => /Market Intelligence was not used/i.test(w)),
    "Market Intelligence não é fonte",
  );

  const program = readAffiliateProgram(campaign!.id);
  assert(!!program, "programa de afiliados registrado");
  assert(program!.platform === "ClickBank", "plataforma ClickBank");
  assert(program!.vendorId === "neuroprime", "vendor ClickBank");
  assert(program!.brandPpc === "BLOCKED", "brand bidding BLOCKED");
  assert(program!.genericSearchPpc === "UNKNOWN", "generic search UNKNOWN");
  assert(program!.googleAdsPolicy === "REVIEW_REQUIRED", "Google Ads policy em revisão");
  assert(program!.directCheckoutLinking === "FORBIDDEN", "checkout direto proibido");
  assert(program!.personalHoplink === null, "sem hoplink pessoal");
  assert(program!.affiliatePageUrl === "https://theneuroprime.com/affiliates/", "página de afiliados");
  assert(!!program!.termsVerifiedAt, "data dos termos");

  const assets = listOfficialPromoAssets(campaign!.id);
  assert(assets.length >= 3, "candidatos de imagem registrados");
  assert(assets.every((asset) => asset.status !== "approved"), "nenhuma imagem aprovada");
  assert(assets.every((asset) => asset.isHero === false && !asset.localFile), "nenhum asset associado ao hero");
  assert(assets.every((asset) => !asset.originalUrl.includes("demo-assets")), "sem demo-assets");

  const ads = getDb()
    .prepare("SELECT COUNT(*) AS n FROM google_ads_publications WHERE local_campaign_id = ?")
    .get(campaign!.id) as { n: number };
  assert(ads.n === 0, "sem publicação Google Ads");

  const evidence = path.join(process.cwd(), "data", "evidence", "neuroprime-readiness-v1", "readiness.json");
  assert(existsSync(evidence), "artefato de evidência versionado");
  const report = JSON.parse(readFileSync(evidence, "utf8"));
  assert(report.brandPpc === "BLOCKED" && report.genericSearchPpc === "UNKNOWN", "evidência espelha PPC");

  for (const slug of ["neuroprime", "cholibrium", "campanha-testes", "northwind-qa"]) {
    const page = await fetch(`http://127.0.0.1:3000/p/${slug}`);
    assert(page.status === 404, `rascunho /p/${slug} segue 404`);
  }

  const duplicates = getDb()
    .prepare("SELECT COUNT(*) AS n FROM campaigns WHERE lower(slug) = 'neuroprime' OR lower(name) = 'neuroprime'")
    .get() as { n: number };
  assert(duplicates.n === 1, "sem duplicata NeuroPrime");

  console.log("NEUROPRIME_READINESS_OK", campaign!.id);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
