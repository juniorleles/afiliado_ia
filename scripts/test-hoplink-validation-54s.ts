// npx tsx scripts/test-hoplink-validation-54s.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { validateHopLink, type HopProbe } from "../src/lib/campaign-sources/validate-hop.ts";
import { classifySubmittedUrl } from "../src/lib/campaign-sources/classify.ts";
import { readCampaignSources, syncCampaignSources, upsertTrackingHopSource } from "../src/lib/campaign-sources/store.ts";
import { createCampaign } from "../src/lib/campaigns.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

function fileHash(file: string): string | null {
  if (!existsSync(file)) return null;
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function probeMap(map: Record<string, { status: number; location?: string; body?: string }>): HopProbe {
  return async (url) => {
    if (url.includes("order-now") || url.includes("/checkout")) {
      throw new Error("checkout must not be fetched: " + url);
    }
    const row = map[url];
    if (!row) return { status: 404, location: null, contentType: "text/html", body: Buffer.from("") };
    return {
      status: row.status,
      location: row.location ?? null,
      contentType: "text/html",
      body: Buffer.from(row.body ?? ""),
    };
  };
}

async function main() {
  process.env.AIA_ALLOW_PAID_AI = "0";
  const hop = "https://zzzz.hop.clickbank.net/";
  const sales = "https://shop.novalis.example/core";
  const checkout = "https://shop.novalis.example/c/order-now.php";

  assert(classifySubmittedUrl(hop).sourceType === "TRACKING_HOPLINK", "hop host is tracking");
  const blocked = await validateHopLink({ url: "http://zzzz.hop.clickbank.net/" });
  assert(blocked.formatOk === false && blocked.destinationClassification === "BLOCKED", "non-HTTPS hops are blocked");

  const ok = await validateHopLink({
    url: hop,
    probe: probeMap({ [hop]: { status: 302, location: sales }, [sales]: { status: 200, body: "<html><title>Novalis Core</title><h1>Novalis Core</h1></html>" } }),
  });
  assert(ok.formatOk, "HTTPS hop format is accepted");
  assert(ok.redirectCount === 1, "one HTTP redirect is counted");
  assert(ok.finalHost === "shop.novalis.example", "final host is recorded");
  assert(ok.destinationClassification === "SALES_PAGE", "a titled consumer page can be a sales page");
  assert(ok.commercialAuthorization === "BLOCKED", "a working hop is not commercial authorization");

  const checkoutHop = await validateHopLink({
    url: hop,
    probe: probeMap({ [hop]: { status: 302, location: checkout } }),
  });
  assert(checkoutHop.checkoutDetected, "checkout destination is detected");
  assert(checkoutHop.destinationClassification === "CHECKOUT_SUSPECTED", "order-now is not classified as a sales page");
  assert(checkoutHop.chain.some((item) => item.via === "STOPPED"), "checkout navigation is stopped");

  const loop = await validateHopLink({
    url: hop,
    probe: probeMap({
      [hop]: { status: 302, location: "https://loop.novalis.example/a" },
      "https://loop.novalis.example/a": { status: 302, location: hop },
    }),
  });
  assert(loop.destinationClassification === "BLOCKED", "a redirect loop is blocked");

  const down = await validateHopLink({
    url: hop,
    probe: async () => {
      throw new Error("The operation was aborted due to timeout");
    },
  });
  assert(down.destinationClassification === "UNAVAILABLE", "a timeout is unavailable");

  const fail = await validateHopLink({
    url: hop,
    probe: probeMap({ [hop]: { status: 503 } }),
  });
  assert(fail.destinationClassification === "UNAVAILABLE", "an HTTP failure is unavailable");

  const jsHint = await validateHopLink({
    url: hop,
    probe: probeMap({
      [hop]: { status: 200, body: '<script>location.href="https://shop.novalis.example/c/order-now.php"</script>' },
    }),
  });
  assert(jsHint.checkoutDetected, "a JavaScript hint to checkout is recorded without opening checkout");

  const unknown = await validateHopLink({
    url: hop,
    probe: probeMap({ [hop]: { status: 200, body: "<html><body>ok</body></html>" } }),
  });
  assert(unknown.destinationClassification === "UNKNOWN", "HTTP 200 alone does not classify the page");

  const campaign = createCampaign({
    name: "Novalis 54S Hop",
    slug: `novalis-54s-hop-${Date.now()}`,
    headline: "Novalis",
    body: "Novalis",
    ctaLabel: "See offer",
    affiliateUrl: "",
    headScript: null,
    adHeadline: null,
  });
  syncCampaignSources(campaign.id, {
    salesUrl: "https://shop.novalis.example/core",
    affiliateResourceUrl: "https://help.novalis.example/info/affiliates.html",
  });
  const before = readCampaignSources(campaign.id);
  upsertTrackingHopSource(campaign.id, hop, {
    sourceStatus: checkoutHop.sourceStatus,
    finalUrl: checkoutHop.finalUrl,
    sourceClassification: checkoutHop.destinationClassification,
    notes: checkoutHop.limitations,
    redirectChain: checkoutHop.chain.map((item) => ({ status: item.status, host: item.host, path: item.path, via: item.via })),
    destinationClassification: checkoutHop.destinationClassification,
    blockReason: checkoutHop.blockReason,
    fetchedAt: checkoutHop.fetchedAt,
  });
  const after = readCampaignSources(campaign.id);
  assert(after.some((item) => item.sourceType === "SALES_PAGE"), "sales source remains after hop upsert");
  assert(after.some((item) => item.sourceType === "AFFILIATE_RESOURCE"), "affiliate source remains after hop upsert");
  assert(after.filter((item) => item.sourceType === "TRACKING_HOPLINK").length === 1, "exactly one tracking hop is stored");
  assert(!after.some((item) => item.sourceType === "AUTHORIZED_DESTINATION"), "authorized destination is not inferred from a hop");
  assert(before.filter((item) => item.sourceType === "SALES_PAGE").length === after.filter((item) => item.sourceType === "SALES_PAGE").length, "sales rows are not replaced");

  const lib = readFileSync(path.join(process.cwd(), "src/lib/campaign-sources/validate-hop.ts"), "utf8");
  assert(!/sugar defender|lymph tonic|prodentim|femicore/i.test(lib), "hop validator has no product-specific strings");
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json")) !== null, "FemiCore hop stays readable");
  assert(fileHash(path.join(process.cwd(), "data", "affiliate-hops", "prodentim", "hop.json")) !== null, "ProDentim hop stays readable");

  console.log(`PASS test-hoplink-validation-54s.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
