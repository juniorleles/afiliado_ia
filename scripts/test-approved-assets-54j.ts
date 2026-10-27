// npx tsx scripts/test-approved-assets-54j.ts
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V4Page } from "../src/components/product-showcase/v4/page.tsx";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { selectApprovedHero } from "../src/lib/real-product-assets/select.ts";
import { classifyVisualClass } from "../src/lib/real-product-assets/visual-class.ts";
import { emptyCatalog, readCatalog } from "../src/lib/real-product-assets/store.ts";
import type { DiscoveredImage } from "../src/lib/real-product-assets/types.ts";

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

function fake(partial: Partial<DiscoveredImage> & Pick<DiscoveredImage, "id" | "fileName" | "url" | "probableKind" | "status">): DiscoveredImage {
  return {
    productKey: "novalis-core",
    productName: "Novalis Core",
    sourcePage: "https://shop.novalis.example/p",
    alt: null,
    width: 800,
    height: 800,
    format: "png",
    byteLength: 1000,
    relevant: true,
    match: "PLAUSIBLE",
    policyBlock: null,
    visualRole: "UNASSIGNED",
    localFile: "C:\\tmp\\ok.png",
    sha256: "abc",
    discoveredAt: "2026-10-23T00:00:00.000Z",
    ...partial,
  };
}

const bottle = fake({
  id: "confirmed-bottle",
  fileName: "core-bottle.png",
  url: "https://cdn.novalis.example/core-bottle.png",
  probableKind: "packshot",
  status: "USER_APPROVED",
  match: "CONFIRMED",
  width: 2550,
  height: 2430,
});
const mobileBottle = fake({
  id: "plausible-bottle",
  fileName: "core-bottle-mob.png",
  url: "https://cdn.novalis.example/core-bottle-mob.png",
  probableKind: "packshot",
  status: "USER_APPROVED",
  match: "PLAUSIBLE",
  width: 990,
  height: 719,
});
const gallery = fake({
  id: "gallery-1",
  fileName: "intro.png",
  url: "https://cdn.novalis.example/intro.png",
  probableKind: "other",
  status: "USER_APPROVED",
  match: "CONFIRMED",
});
const promo = fake({
  id: "promo-1",
  fileName: "order-now.png",
  url: "https://cdn.novalis.example/order-now.png",
  probableKind: "other",
  status: "USER_APPROVED",
});
const pending = fake({
  id: "pending-1",
  fileName: "extra.png",
  url: "https://cdn.novalis.example/extra.png",
  probableKind: "packshot",
  status: "PENDING_USER_APPROVAL",
  match: "CONFIRMED",
});

assert(classifyVisualClass(promo) === "PROMOTIONAL", "order-now stays promotional");
assert(selectApprovedHero([promo]) === null, "promotional approval is not a hero");
assert(selectApprovedHero([pending, bottle])?.id === "confirmed-bottle", "pending images are ignored");
assert(selectApprovedHero([mobileBottle, bottle, gallery])?.id === "confirmed-bottle", "catalog scoring prefers the confirmed packshot");

const catalog = emptyCatalog("novalis-core", "Novalis Core");
catalog.images = [bottle, mobileBottle, gallery, promo, pending];
const s5 = buildV4Model("s5")!;
const overlayed = overlayApprovedAssets(s5, catalog);
assert(overlayed.commercialImage?.src.endsWith("/novalis-core/confirmed-bottle"), "overlay uses the scored hero");
assert(!(overlayed.galleryImages ?? []).some((item) => item.src.includes("promo-1")), "promotional images stay out of the gallery overlay");
assert(!(overlayed.galleryImages ?? []).some((item) => item.src.includes("pending-1")), "pending images stay out of the overlay");

const html = renderToStaticMarkup(createElement(V4Page, { model: overlayed }));
assert(/ds-hero--split/.test(html), "approved packshot uses the split hero");
assert(html.includes('data-v4-image="commercial"'), "the authorized packshot is rendered");

const femicoreCatalog = path.join(process.cwd(), "data", "real-product-assets", "femicore", "catalog.json");
const femicoreHop = path.join(process.cwd(), "data", "affiliate-hops", "femicore", "hop.json");
const before = { catalog: fileHash(femicoreCatalog), hop: fileHash(femicoreHop) };
const live = readCatalog("prodentim");
assert((live?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0) >= 1, "the live ProDentim catalog already has operator approvals");
const after = { catalog: fileHash(femicoreCatalog), hop: fileHash(femicoreHop) };
assert(before.catalog === after.catalog && before.hop === after.hop, "reading the ProDentim catalog does not mutate FemiCore");

const libFiles = ["src/lib/real-product-assets/select.ts", "src/lib/real-product-assets/overlay.ts", "src/lib/real-product-assets/persist.ts"];
for (const file of libFiles) {
  const text = readFileSync(path.join(process.cwd(), file), "utf8");
  assert(!/prodentim|femicore|getfemicore/i.test(text), `${file} has no product-specific strings`);
}

console.log(`PASS test-approved-assets-54j.ts (${passed} OK)`);
