// npx tsx scripts/test-sandbox-mode.ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  applySandboxToModel,
  buildSandboxCtaPath,
  extractHopCandidates,
  isSandboxCtaHref,
  prepareSandboxCta,
  productionPublicationBlockedForSandbox,
  realCatalogApprovalsUnchanged,
  recordSandboxClick,
  rejectExternalSandboxHref,
  sandboxMayPromoteToProduction,
  sandboxPromotionDecision,
  simulateSandboxApprovals,
  writeSandboxSession,
} from "../src/lib/sandbox/index.ts";
import { prepareOfficialOfferCta, recordOfficialOfferClick, validateHopFormat } from "../src/lib/affiliate-hop/index.ts";
import { emptyCatalog, readCatalog, writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

assert(isSandboxCtaHref("/admin/lab/sandbox/offer?sid=abc12345"), "local sandbox path is accepted");
assert(!isSandboxCtaHref("https://vendor.hop.clickbank.net"), "ClickBank hop is not a sandbox CTA");
assert(!isSandboxCtaHref("https://example.com/buy"), "external https is not a sandbox CTA");
assert(!isSandboxCtaHref("javascript:alert(1)"), "javascript href is rejected");
assert(rejectExternalSandboxHref("https://shop.example/offer").ok === false, "external sandbox href is rejected");

const ctaPath = buildSandboxCtaPath({
  sessionId: "sess-lab-0001",
  productKey: "novalis-core",
  landingPageId: "lp-lab",
  presellMode: "PRESELL_BOFU",
});
assert(ctaPath.startsWith("/admin/lab/sandbox/offer?"), "sandbox CTA is a local offer path");
assert(!/https?:/i.test(ctaPath), "sandbox CTA has no external protocol");

const sessionRoot = mkdtempSync(path.join(tmpdir(), "aia-sandbox-"));
writeSandboxSession({
  version: 1,
  sessionId: "sess-lab-0001",
  productKey: "novalis-core",
  landingPageId: "lp-lab",
  presellMode: "PRESELL_BOFU",
  ctaPath,
  createdAt: "2026-10-23T00:00:00.000Z",
  productionPromotionBlocked: true,
}, sessionRoot);

const hidden = prepareSandboxCta({ lab: false, href: ctaPath, session: null });
assert(!hidden.visible, "sandbox CTA is hidden outside the lab");
const ready = prepareSandboxCta({
  lab: true,
  href: ctaPath,
  session: { version: 1, sessionId: "sess-lab-0001", productKey: "novalis-core", landingPageId: "lp-lab", presellMode: "PRESELL_BOFU", ctaPath, createdAt: "2026-10-23T00:00:00.000Z", productionPromotionBlocked: true },
});
assert(ready.visible && ready.badge === "SANDBOX" && ready.href === ctaPath, "lab sandbox CTA is visible and badged");
assert(ready.productionBlocked, "sandbox CTA never unblocks production");

const productionCta = prepareOfficialOfferCta(null);
assert(!productionCta.visible, "production official-offer CTA stays blocked without hop authorization");

const first = recordSandboxClick({
  sessionId: "sess-lab-0001",
  productId: "novalis-core",
  landingPageId: "lp-lab",
  presellMode: "PRESELL_BOFU",
  eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  storeRoot: sessionRoot,
  now: "2026-10-23T00:00:00.000Z",
});
assert(first.ok && first.ok && first.click.event === "sandbox_offer_click", "sandbox click uses the sandbox event name");
assert(first.ok && first.click.sandbox && first.click.campaignId === null, "sandbox click stores no campaign and is marked sandbox");

const dup = recordSandboxClick({
  sessionId: "sess-lab-0001",
  productId: "novalis-core",
  eventId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  storeRoot: sessionRoot,
});
assert(!dup.ok && dup.reason === "DUPLICATE_EVENT", "duplicate sandbox events are rejected");

const productionEvent = recordSandboxClick({
  sessionId: "sess-lab-0001",
  productId: "novalis-core",
  event: "official_offer_click",
  storeRoot: sessionRoot,
});
assert(!productionEvent.ok && productionEvent.reason === "PRODUCTION_EVENT_REJECTED", "official_offer_click cannot be recorded as a sandbox event");

const official = recordOfficialOfferClick({
  record: null,
  productId: "novalis-core",
  storeRoot: sessionRoot,
});
assert(!official.ok && official.reason === "CTA_NOT_AUTHORIZED", "production official_offer_click stays unauthorized");

assert(!sandboxMayPromoteToProduction(), "sandbox pages cannot be promoted");
assert(productionPublicationBlockedForSandbox({ sandbox: { enabled: true, sessionId: "sess-lab-0001", ctaPath, productionPromotionBlocked: true } }), "sandbox publication stays blocked");
assert(sandboxPromotionDecision(null).reason === "SANDBOX_PROMOTION_BLOCKED", "promotion helper fails closed");

const hops = extractHopCandidates(
  `<a href="https://labvendor.hop.clickbank.net">offer</a><a href="https://shop.example/text.php?hop=zzzzz">page</a>`,
  "https://shop.example/text.php?hop=zzzzz",
);
assert(hops.some((item) => item.format.ok && item.href.includes("hop.clickbank.net")), "a real ClickBank hop candidate is extracted");
assert(hops.some((item) => item.placeholder), "a placeholder hop parameter is recorded as observed");
assert(!validateHopFormat("https://shop.example/text.php?hop=zzzzz").ok, "placeholder hop is not a valid ClickBank hop");

const model = buildV4Model("s1");
if (!model) throw new Error("missing lab model");
const sandboxed = applySandboxToModel(model, { href: ctaPath });
assert(sandboxed.sandbox?.mode === true && sandboxed.hopHref === ctaPath, "sandbox model uses the local CTA");
assert(sandboxed.hopLabel === "View Official Offer", "sandbox CTA keeps the official-offer label");
assert(!/https?:\/\//.test(sandboxed.hopHref ?? ""), "sandboxed hop is not an external URL");

async function main() {
  const realRoot = mkdtempSync(path.join(tmpdir(), "aia-real-"));
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "aia-fix-"));
  const real = emptyCatalog("novalis-core", "Novalis Core", "2026-10-23T00:00:00.000Z");
  real.images = [{
    id: "img-pack",
    productKey: "novalis-core",
    productName: "Novalis Core",
    url: "https://cdn.example.com/novalis-core-bottle.jpg",
    sourcePage: "https://cdn.example.com/",
    fileName: "novalis-core-bottle.jpg",
    alt: "Novalis Core bottle",
    width: 800,
    height: 800,
    format: "jpeg",
    byteLength: 1200,
    probableKind: "packshot",
    relevant: true,
    match: "CONFIRMED",
    policyBlock: null,
    status: "PENDING_USER_APPROVAL",
    visualRole: "UNASSIGNED",
    localFile: null,
    sha256: null,
    discoveredAt: "2026-10-23T00:00:00.000Z",
  }];
  writeCatalog(real, realRoot);
  const before = readCatalog("novalis-core", realRoot);
  const simulated = await simulateSandboxApprovals({
    catalog: real,
    root: fixtureRoot,
    persist: async (image, root) => ({
      ok: true,
      image: { ...image, localFile: path.join(root, `${image.id}.jpg`) },
    }),
  });
  assert(simulated.approved.includes("img-pack"), "isolated fixture can simulate approval");
  assert(simulated.catalog.images[0]?.status === "USER_APPROVED", "fixture catalog is approved only in isolation");
  const after = readCatalog("novalis-core", realRoot);
  assert(realCatalogApprovalsUnchanged(before, after), "real catalog USER_APPROVED statuses stay unchanged");
  assert(after?.images[0]?.status === "PENDING_USER_APPROVAL", "real catalog image remains pending");

  const libFiles = [
    "src/lib/sandbox/href.ts",
    "src/lib/sandbox/cta.ts",
    "src/lib/sandbox/track.ts",
    "src/lib/sandbox/assets.ts",
    "src/lib/sandbox/hops.ts",
    "src/lib/sandbox/promote.ts",
  ];
  for (const file of libFiles) {
    const text = readFileSync(path.join(process.cwd(), file), "utf8");
    assert(!/femicore|prodentim|getprodentim|prodentim101|f64beou95qrrbo1mzhv1ojweet/i.test(text), `${file} has no product-specific strings`);
  }

  console.log(`PASS test-sandbox-mode.ts (${passed} OK)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
