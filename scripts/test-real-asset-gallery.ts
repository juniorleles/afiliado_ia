// npx tsx scripts/test-real-asset-gallery.ts
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gallerySection, groupGalleryCards, isDisplayableImageUrl, isSelectableForApproval, thumbnailPath, toGalleryCard } from "../src/lib/real-product-assets/gallery.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { emptyCatalog, writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { loadCatalogThumbnail, validateThumbnailBytes } from "../src/lib/real-product-assets/thumbnail.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import type { DiscoveredImage } from "../src/lib/real-product-assets/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

function fake(partial: Partial<DiscoveredImage> & Pick<DiscoveredImage, "id" | "fileName" | "url" | "probableKind">): DiscoveredImage {
  return {
    productKey: "femicore",
    productName: "FemiCore",
    sourcePage: "https://getfemicore.example/help/affiliates.php",
    alt: null,
    width: null,
    height: null,
    format: null,
    byteLength: null,
    relevant: true,
    match: "PLAUSIBLE",
    policyBlock: null,
    status: "PENDING_USER_APPROVAL",
    visualRole: "UNASSIGNED",
    localFile: null,
    sha256: null,
    discoveredAt: "2026-10-21T00:00:00.000Z",
    ...partial,
  };
}

const bottle = fake({
  id: "pack-1",
  fileName: "prod_1_bottle_aff.png",
  url: "https://getfemicore.example/statics/img/prod_1_bottle_aff.png",
  probableKind: "packshot",
});
const banner = fake({
  id: "ban-1",
  fileName: "affimg.png",
  url: "https://getfemicore.example/statics/img/affimg.png",
  probableKind: "banner",
});
const button = fake({
  id: "btn-1",
  fileName: "order-now.png",
  url: "https://getfemicore.example/statics/img/order-now.png",
  probableKind: "other",
});
const logo = fake({
  id: "logo-1",
  fileName: "black_logo.png",
  url: "https://getfemicore.example/statics/img/black_logo.png",
  probableKind: "logo",
  relevant: false,
});

assert(isDisplayableImageUrl("https://getfemicore.example/statics/img/prod_1_bottle_aff.png"), "image paths are displayable");
assert(!isDisplayableImageUrl("https://getfemicore.example//"), "site root is not treated as an image");
assert(gallerySection(bottle) === "packshot", "bottle is a packshot section");
assert(gallerySection(banner) === "banner", "wide promo is a banner section");
assert(gallerySection(button) === "decorative", "order-now button is decorative");
assert(gallerySection(logo) === "decorative", "logo is decorative");
assert(isSelectableForApproval("PENDING_USER_APPROVAL"), "pending images can be selected");
assert(!isSelectableForApproval("USER_APPROVED"), "already approved images are not re-selected");
assert(!isSelectableForApproval("BLOCKED_BY_POLICY"), "policy blocks stay unselectable");
assert(thumbnailPath("femicore", "pack-1") === "/admin/lab/real-assets/thumb/femicore/pack-1", "thumb path is catalog-scoped");

const groups = groupGalleryCards([bottle, banner, button, logo].map(toGalleryCard));
assert(groups[0]?.section === "packshot", "packshots are listed first");
assert(groups.at(-1)?.section === "decorative", "decorative materials are last");
assert(!toGalleryCard(bottle).url.includes("localFile"), "gallery cards expose the public source URL");
assert(toGalleryCard(bottle).visualClass === "PRODUCT_PACKSHOT", "bottle is classified as a packshot");
assert(toGalleryCard(button).visualClass === "PROMOTIONAL", "order-now is promotional and is not auto-promoted");
assert(toGalleryCard(logo).visualClass === "UNSUITABLE", "logo is unsuitable for the page");
assert(!toGalleryCard(logo).selectable, "unsuitable images cannot be batch-approved");

const pngOk = validateThumbnailBytes(PNG, "image/png");
assert(pngOk.ok && pngOk.contentType === "image/png", "safe PNG bytes are accepted");
assert(!validateThumbnailBytes(Buffer.from("<html><script>"), "text/html").ok, "HTML is rejected as a thumbnail");
assert(!validateThumbnailBytes(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "image/svg+xml").ok, "SVG is rejected");

async function main() {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "rpa-thumb-"));
  const catalog = emptyCatalog("femicore", "FemiCore");
  catalog.images = [
    bottle,
    fake({
      id: "ssrf-1",
      fileName: "internal.png",
      url: "https://127.0.0.1/secret.png",
      probableKind: "other",
    }),
  ];
  writeCatalog(catalog, tmp);

  const missing = await loadCatalogThumbnail("femicore", "missing", tmp);
  assert(!missing.ok && missing.status === 404, "unknown catalog ids are not proxied");
  const blocked = await loadCatalogThumbnail("femicore", "ssrf-1", tmp);
  assert(!blocked.ok && blocked.status === 400, "private hosts in the catalog are not fetched");

  const s5 = buildV4Model("s5")!;
  const pendingOverlay = overlayApprovedAssets(s5, catalog);
  assert(!pendingOverlay.commercialImage, "thumbnail availability does not put pending images in V4");
  const rejected = { ...bottle, status: "REJECTED" as const, localFile: path.join(tmp, "x.png") };
  assert(!overlayApprovedAssets(s5, { ...catalog, images: [rejected] }).commercialImage, "rejected images stay out of V4");
  const revoked = { ...bottle, status: "REVOKED" as const, localFile: path.join(tmp, "x.png") };
  assert(!overlayApprovedAssets(s5, { ...catalog, images: [revoked] }).commercialImage, "revoked images stay out of V4");

  console.log("REAL_ASSET_GALLERY_OK");
  console.log(`OK_COUNT=${passed}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
