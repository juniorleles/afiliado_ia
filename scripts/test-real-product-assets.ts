// npx tsx scripts/test-real-product-assets.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applyDecision, imageIdFor } from "../src/lib/real-product-assets/authorize.ts";
import { imagesFromHtml, discoverFromUrls } from "../src/lib/real-product-assets/discover.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { selectApprovedHero } from "../src/lib/real-product-assets/select.ts";
import { inspectPublicHttpsUrl, stripUnverifiedHop } from "../src/lib/real-product-assets/ssrf.ts";
import { emptyCatalog, readCatalog, writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const HTML = `
<html><body>
<img src="/cdn/femicore-bottle.jpg" alt="FemiCore bottle">
<img src="/pixel.gif" width="1" height="1" alt="">
<img src="/logo-header.png" alt="logo">
<a href="https://cdn.example.com/other-product-box.png">file</a>
<meta property="og:image" content="https://cdn.official.example/femicore-hero.webp">
</body></html>
`;

const images = imagesFromHtml({
  productName: "FemiCore",
  pageUrl: "https://getfemicore.example/help/affiliates.php",
  html: HTML,
  now: "2026-10-21T00:00:00.000Z",
});
assert(images.some((item) => item.url.includes("femicore-bottle.jpg")), "extracts a product image");
assert(images.some((item) => item.url.includes("femicore-hero.webp")), "extracts og:image");
assert(images.find((item) => item.url.includes("pixel.gif"))?.relevant === false, "drops tracking as irrelevant");
assert(images.find((item) => item.url.includes("logo-header.png"))?.probableKind === "logo", "classifies a logo");
const bottle = images.find((item) => item.fileName.includes("femicore-bottle"))!;
assert(bottle.match === "CONFIRMED", "product name in the file confirms the match");
assert(bottle.status === "PENDING_USER_APPROVAL", "discovery is not approval");
assert(new Set(images.map((item) => item.url)).size === images.length, "deduplicates URLs");

assert(!inspectPublicHttpsUrl("http://example.com/a.jpg").ok, "http is blocked");
assert(!inspectPublicHttpsUrl("https://127.0.0.1/a.jpg").ok, "loopback is blocked");
assert(!inspectPublicHttpsUrl("https://192.168.0.8/a.jpg").ok, "private IP is blocked");
assert(!inspectPublicHttpsUrl("https://user:pw@example.com/a.jpg").ok, "userinfo is blocked");
assert(inspectPublicHttpsUrl("https://cdn.example.com/a.jpg").ok, "public https is allowed");

const hop = stripUnverifiedHop("https://getfemicore.com/text.php?hop=zzzzz&hopId=abc");
assert(hop.hopPlaceholder, "zzzzz hop is flagged");
assert(!hop.href.includes("hop=zzzzz"), "placeholder hop is not kept as an affiliate id");

const tmp = mkdtempSync(path.join(os.tmpdir(), "rpa-"));
const catalog = emptyCatalog("femicore", "FemiCore", "2026-10-21T00:00:00.000Z");
catalog.images = images;
writeCatalog(catalog, tmp);
const loaded = readCatalog("femicore", tmp)!;
assert(loaded.images.length === catalog.images.length, "catalog persists");

const approved = applyDecision({ catalog: loaded, imageId: bottle.id, actor: "tester", status: "USER_APPROVED", now: "2026-10-21T01:00:00.000Z" });
if ("error" in approved) throw new Error(approved.error);
assert(approved.catalog.images.find((item) => item.id === bottle.id)?.status === "USER_APPROVED", "user can approve");
const again = applyDecision({ catalog: approved.catalog, imageId: bottle.id, actor: "tester", status: "USER_APPROVED" });
if ("error" in again) throw new Error(again.error);
assert(again.reused, "valid approval is reused");

const revoked = applyDecision({ catalog: approved.catalog, imageId: bottle.id, actor: "tester", status: "REVOKED", now: "2026-10-21T02:00:00.000Z" });
if ("error" in revoked) throw new Error(revoked.error);
assert(revoked.catalog.images.find((item) => item.id === bottle.id)?.status === "REVOKED", "approval can be revoked");
assert(!selectApprovedHero(revoked.catalog.images), "revoked image is not selected for hero");

const blockedHtml = `<img src="/clinically-proven-cure.jpg" alt="overnight">`;
const blocked = imagesFromHtml({ productName: "FemiCore", pageUrl: "https://getfemicore.example/x", html: blockedHtml });
assert(blocked[0]?.status === "BLOCKED_BY_POLICY", "known promotional/health filename is blocked");
const cannotApprove = applyDecision({ catalog: { ...emptyCatalog("femicore", "FemiCore"), images: blocked }, imageId: blocked[0].id, actor: "tester", status: "USER_APPROVED" });
assert("error" in cannotApprove, "policy block cannot be approved");

const s5 = buildV4Model("s5")!;
assert(!s5.commercialImage, "s5 starts without a commercial photo");
const bare = renderToStaticMarkup(createElement(V4Page, { model: s5 }));
assert(!bare.includes("<img "), "V4 fallback has no image without approval");

const stored = {
  ...bottle,
  status: "USER_APPROVED" as const,
  localFile: path.join(tmp, "femicore-bottle.jpg"),
};
writeFileSync(stored.localFile, "not-an-image");
const over = overlayApprovedAssets(s5, { ...approved.catalog, images: [stored] });
assert(over.commercialImage?.src.includes("/admin/lab/real-assets/file/"), "approved local file becomes the V4 hero");
const withImg = renderToStaticMarkup(createElement(V4Page, { model: over }));
assert(withImg.includes("data-v4-image=\"commercial\""), "V4 renders the approved image");
assert(over.hopHref === s5.hopHref, "overlay does not change the hop");

const unapprovedOverlay = overlayApprovedAssets(s5, loaded);
assert(!unapprovedOverlay.commercialImage, "pending images never enter V4");

const other = images.find((item) => item.url.includes("other-product-box"))!;
assert(other.match !== "CONFIRMED", "another product file is not a confirmed match");

async function main() {
  const fakeFetch = async (url: string) => {
    if (url.includes("127.0.0.1")) return { ok: false as const, url, status: null, reason: "Local and private hosts are blocked." };
    return { ok: true as const, url, status: 200, contentType: "text/html", body: Buffer.from(HTML) };
  };
  const report = await discoverFromUrls({ productName: "FemiCore", urls: ["https://getfemicore.example/help/affiliates.php"], fetchPage: fakeFetch });
  assert(report.report.pages[0]?.ok === true, "injected fetch discovers from html");
  assert(imageIdFor("https://a.example/x") === imageIdFor("https://a.example/x"), "ids are stable");
  console.log("REAL_PRODUCT_ASSETS_OK");
  console.log(`OK_COUNT=${passed}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
