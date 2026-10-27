// npx tsx scripts/test-affiliate-source-54ad.ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCampaign } from "../src/lib/campaigns.ts";
import { sanitizeSharedUrl } from "../src/lib/campaign-sources/classify.ts";
import { classifyUrlRoles } from "../src/lib/campaign-sources/roles.ts";
import {
  publicAffiliateView,
  readUserProvidedAffiliateUrl,
  registerUserProvidedAffiliateUrl,
} from "../src/lib/campaign-sources/user-provided.ts";
import { inspectNonCheckoutUrl, relatedHostEvidence } from "../src/lib/campaign-sources/related-hosts.ts";
import { campaignIntegritySnapshot, resolveCampaignCommercialSources } from "../src/lib/campaign-sources/resolve-commercial.ts";
import { inspectPublicHttpsUrl } from "../src/lib/real-product-assets/ssrf.ts";
import { collectInformationalCandidates } from "../src/lib/research-coverage/discover.ts";
import { readCampaignSources } from "../src/lib/campaign-sources/store.ts";
import { snapshotProductResearch } from "../src/lib/product-research/run.ts";
import { QUALITY_TARGET } from "../src/lib/presell-quality/types.ts";

const CHECKOUT_WITH_HOP =
  "https://sugardefender24.com/c/order-now.php?hop=examplex&hopId=00000000-0000-0000-0000-000000000001";
const HISTORICAL =
  "https://sugardefender24.com/c/order-now.php?hop=zzzzz&hopId=6a6a539e-24ea-4351-a68a-c22d48a65d3f";

function campaign237Hop(): string {
  const fromEnv = process.env.AIA_USER_PROVIDED_HOP?.trim();
  if (fromEnv) return fromEnv;
  const stored = readUserProvidedAffiliateUrl(237);
  if (stored?.originalUrl) return stored.originalUrl;
  throw new Error("Campaign 237 hop is only read from private storage or AIA_USER_PROVIDED_HOP.");
}

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function withSourcesRoot<T>(fn: () => T): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), "54ad-sources-"));
  const previous = process.env.AIA_CAMPAIGN_SOURCES_ROOT;
  process.env.AIA_CAMPAIGN_SOURCES_ROOT = dir;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.AIA_CAMPAIGN_SOURCES_ROOT;
    else process.env.AIA_CAMPAIGN_SOURCES_ROOT = previous;
  }
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";

  const isolated = createCampaign({
    name: "Novalis 54AD",
    slug: `novalis-54ad-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });

  const hop = "https://shop.novalis.example/c/order-now.php?hop=novalisx&hopId=aaaa-bbbb";
  const recorded = withSourcesRoot(() => {
    mkdirSync(path.join(process.env.AIA_CAMPAIGN_SOURCES_ROOT!, String(isolated.id)), { recursive: true });
    writeFileSync(
      path.join(process.env.AIA_CAMPAIGN_SOURCES_ROOT!, String(isolated.id), "sources.json"),
      JSON.stringify({
        campaignId: isolated.id,
        sources: [
          {
            sourceId: "src-hist",
            campaignId: isolated.id,
            sourceType: "SALES_PAGE",
            originalUrl: HISTORICAL,
            normalizedUrl: HISTORICAL,
            finalUrl: null,
            sourceStatus: "CHECKOUT_SUSPECTED",
            sourceClassification: null,
            discoveryMethod: "OPERATOR",
            submittedBy: "OPERATOR",
            fetchedAt: null,
            verificationStatus: "UNVERIFIED",
            evidenceIds: [],
            notes: ["Checkout or order path detected. Do not navigate, extract, or authorize."],
          },
        ],
      }),
    );
    return registerUserProvidedAffiliateUrl({ campaignId: isolated.id, url: hop });
  });

  assert(recorded.origin === "USER_PROVIDED" && recorded.attribution.hop === "novalisx", "1. registro do hoplink fornecido");
  assert(recorded.attribution.hopId === "aaaa-bbbb" && recorded.commerciallyAuthorized === false, "2. parametros de atribuicao no armazenamento privado");
  const published = publicAffiliateView(recorded);
  assert(published.originalUrl.includes("REDACTED") && published.attribution.hop === "REDACTED", "3. sanitizacao dos parametros em visao publica");
  assert(!JSON.stringify(published).includes("novalisx"), "3. visao publica nao vaza hop");

  const tracking = classifyUrlRoles("https://zzzz.hop.clickbank.net/");
  const sales = classifyUrlRoles("https://shop.novalis.example/core");
  const checkout = classifyUrlRoles(hop);
  assert(tracking.roles.includes("AFFILIATE_TRACKING_URL") && !tracking.checkout, "4. hop ClickBank e tracking, nao checkout");
  assert(sales.roles.includes("SALES_LANDING_PAGE") && sales.fetchable, "4. pagina de vendas fetchable");
  assert(checkout.roles.includes("CHECKOUT_OR_ORDER_PAGE") && checkout.roles.includes("AFFILIATE_TRACKING_URL"), "4. order-now+hop tem os dois papeis");
  assert(!checkout.fetchable, "5. /c/order-now.php bloqueado para extracao");

  const related = relatedHostEvidence("https://sugardefender.com/", "https://sugardefender24.com/");
  assert(related.related && related.confidence === "MEDIUM", "6. dominios relacionados por token de marca");
  assert(!relatedHostEvidence("https://sugardefender.com/", "https://other.example/").related, "6. host nao relacionado permanece fechado");

  let fetchedCheckout = false;
  const stopped = await inspectNonCheckoutUrl(hop, async () => {
    fetchedCheckout = true;
    return { status: 200, location: null };
  });
  assert(!fetchedCheckout && stopped.blocked && stopped.checkoutNavigated === false, "6. checkout nao e requisitado");

  const hopHost = "https://zzzz.hop.clickbank.net/";
  const redirected = await inspectNonCheckoutUrl(hopHost, async (url) => {
    if (url.includes("order-now")) throw new Error("checkout must not be fetched");
    return { status: 307, location: hop };
  });
  assert(redirected.accessed && redirected.blocked && /checkout/i.test(redirected.reason), "6. redirect para checkout para no destino");

  assert(!inspectPublicHttpsUrl("http://sugardefender24.com/").ok, "7. HTTP nao HTTPS e bloqueado");
  assert(!inspectPublicHttpsUrl("https://localhost/c/order-now.php").ok, "7. host local bloqueado");
  assert(!inspectPublicHttpsUrl("https://127.0.0.1/").ok, "8. SSRF IP privado bloqueado");

  const afterHist = withSourcesRoot(() => {
    const dir = path.join(process.env.AIA_CAMPAIGN_SOURCES_ROOT!, "900237");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "sources.json"),
      JSON.stringify({
        campaignId: 900237,
        sources: [
          {
            sourceId: "src-zzzzz",
            campaignId: 900237,
            sourceType: "SALES_PAGE",
            originalUrl: HISTORICAL,
            normalizedUrl: HISTORICAL,
            finalUrl: null,
            sourceStatus: "CHECKOUT_SUSPECTED",
            sourceClassification: null,
            discoveryMethod: "OPERATOR",
            submittedBy: "OPERATOR",
            fetchedAt: null,
            verificationStatus: "UNVERIFIED",
            evidenceIds: [],
            notes: [],
          },
        ],
      }),
    );
    registerUserProvidedAffiliateUrl({ campaignId: 900237, url: CHECKOUT_WITH_HOP });
    return readCampaignSources(900237);
  });
  assert(
    afterHist.some((item) => item.origin === "HISTORICAL_FIXTURE" && item.originalUrl.includes("zzzzz")) &&
      afterHist.some((item) => item.origin === "USER_PROVIDED" && item.originalUrl.includes("REDACTED")),
    "9. fixture historica preservada e hoplink real sanitizado na lista publica",
  );

  const other = createCampaign({
    name: "Novalis 54AD B",
    slug: `novalis-54ad-b-${Date.now()}`,
    headline: "Other",
    body: "Other",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  const before237 = readUserProvidedAffiliateUrl(237);
  withSourcesRoot(() => registerUserProvidedAffiliateUrl({ campaignId: other.id, url: hop }));
  assert(readUserProvidedAffiliateUrl(237)?.originalUrl === before237?.originalUrl, "10. isolamento: registrar outra campanha nao reescreve 237");

  const beforeFacts = campaignIntegritySnapshot(237);
  const registered237 = registerUserProvidedAffiliateUrl({ campaignId: 237, url: campaign237Hop() });
  const afterFacts = campaignIntegritySnapshot(237);
  assert(JSON.stringify(beforeFacts.acceptedFacts) === JSON.stringify(afterFacts.acceptedFacts), "11. fatos aprovados de 237 preservados");
  assert(JSON.stringify(beforeFacts.approvedAssets) === JSON.stringify(afterFacts.approvedAssets), "11. aprovacoes de imagem preservadas");
  assert(afterFacts.affiliateUrl === "" && registered237.usedAsActiveCta === false, "12. CTA comercial nao habilitado");
  assert(afterFacts.publicationStatus !== "published" && afterFacts.qualityStatus === "QUALITY_REJECTED", "13. publicacao e quality intactos");

  const discovered = collectInformationalCandidates({
    html: '<a href="https://sugardefender24.com/info/returns.html">Returns</a><a href="https://sugardefender24.com/c/order-now.php">Buy</a>',
    pageUrl: "https://sugardefender.com/",
    relatedHosts: ["sugardefender24.com"],
  });
  assert(discovered.candidates.some((item) => /returns/.test(item.url)), "6. host relacionado pode render pagina informativa");
  assert(!discovered.candidates.some((item) => /order-now/.test(item.url)), "5. order-now continua fora da descoberta");

  const resolved = await resolveCampaignCommercialSources(237, { inspectRoot: false });
  assert(resolved.checkoutNavigated === false && resolved.commercialAuthorization === "BLOCKED", "12. autorizacao comercial bloqueada");
  assert(resolved.publicationReadiness === "BLOCKED", "13. publication readiness bloqueada");
  assert(resolved.publicAffiliate?.originalUrl.includes("REDACTED"), "3. resolucao publica redige hop");
  assert(!JSON.stringify(resolved.publicAffiliate).includes("examplex"), "3. relatorio publico sem hop real");

  assert(QUALITY_TARGET === 85, "14. regressao 54Z quality target");
  assert(process.env.AIA_ALLOW_PAID_AI === "0", "14. regressao 54AA paid gate");
  assert(snapshotProductResearch(237).latest?.campaignId === 237, "14. regressao 54AC isolamento de pesquisa");
  assert(sanitizeSharedUrl(CHECKOUT_WITH_HOP).includes("REDACTED"), "3. sanitizeSharedUrl cobre hop e hopId");

  console.log(`PASS test-affiliate-source-54ad.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
