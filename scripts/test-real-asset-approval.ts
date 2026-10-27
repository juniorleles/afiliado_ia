// npx tsx scripts/test-real-asset-approval.ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { approveCatalogImages, decideCatalogImage, USER_APPROVE_ERROR } from "../src/lib/real-product-assets/approve.ts";
import { mutationOriginAllowed } from "../src/lib/request-origin.ts";
import { overlayApprovedAssets } from "../src/lib/real-product-assets/overlay.ts";
import { emptyCatalog, readCatalog, writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { buildV4Model } from "../src/lib/product-showcase/v4/model.ts";
import type { DiscoveredImage, ProductCatalog } from "../src/lib/real-product-assets/types.ts";

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error("FALHOU: " + message);
  passed += 1;
  console.log("OK: " + message);
}

const PNG = readFileSync(path.join(process.cwd(), "public", "lab-fixtures", "synthetic-packshot.jpg"));

function fake(partial: Partial<DiscoveredImage> & Pick<DiscoveredImage, "id" | "fileName" | "url">): DiscoveredImage {
  return {
    productKey: "lab-fixture-52b",
    productName: "Aurora Nectar",
    sourcePage: "https://aurora-nectar.example/assets",
    alt: null,
    width: 80,
    height: 80,
    format: "png",
    byteLength: PNG.length,
    probableKind: "packshot",
    relevant: true,
    match: "CONFIRMED",
    policyBlock: null,
    status: "PENDING_USER_APPROVAL",
    visualRole: "UNASSIGNED",
    localFile: null,
    sha256: null,
    discoveredAt: "2026-10-22T00:00:00.000Z",
    ...partial,
  };
}

function fetchOk() {
  return async () => ({ ok: true as const, url: "https://cdn.example/a.png", status: 200, contentType: "image/png", body: PNG });
}

function fetchFail(reason: string) {
  return async () => ({ ok: false as const, url: "https://cdn.example/missing.png", status: 404, reason });
}

async function main() {
  assert(
    mutationOriginAllowed({
      method: "POST",
      origin: "http://127.0.0.1:3000",
      referer: "http://127.0.0.1:3000/admin/lab/real-assets/femicore",
      requestHost: "127.0.0.1:3000",
      nextHost: "localhost:3000",
    }),
    "loopback 127.0.0.1 and localhost are the same admin origin",
  );
  assert(
    !mutationOriginAllowed({
      method: "POST",
      origin: "https://evil.example",
      referer: null,
      requestHost: "127.0.0.1:3000",
      nextHost: "localhost:3000",
    }),
    "cross-origin admin POST stays blocked",
  );

  const tmp = mkdtempSync(path.join(os.tmpdir(), "rpa-approve-"));
  const one = fake({ id: "img-a", fileName: "bottle-a.png", url: "https://cdn.example/bottle-a.png" });
  const two = fake({ id: "img-b", fileName: "bottle-b.png", url: "https://cdn.example/bottle-b.png" });
  const broken = fake({ id: "img-x", fileName: "missing.png", url: "https://cdn.example/missing.png" });
  let catalog: ProductCatalog = { ...emptyCatalog("lab-fixture-52b", "Aurora Nectar"), images: [one, two, broken] };

  const failed = await approveCatalogImages({
    catalog,
    imageIds: ["img-x"],
    actor: "tester",
    root: tmp,
    fetchImage: fetchFail("HTTP 404"),
  });
  assert(!failed.results[0]?.ok, "download failure is not approval");
  assert(failed.catalog.images.find((item) => item.id === "img-x")?.status === "PENDING_USER_APPROVAL", "failed download stays pending");
  assert(failed.results[0] && "message" in failed.results[0] && failed.results[0].message === USER_APPROVE_ERROR, "user message stays generic");

  const single = await approveCatalogImages({
    catalog,
    imageIds: ["img-a"],
    actor: "tester",
    root: tmp,
    now: "2026-10-22T03:00:00.000Z",
    fetchImage: fetchOk(),
  });
  const saved = single.catalog.images.find((item) => item.id === "img-a")!;
  assert(single.results[0]?.ok === true, "single approval succeeds");
  assert(saved.status === "USER_APPROVED", "approved status is persisted in memory");
  assert(Boolean(saved.localFile && existsSync(saved.localFile)), "approved file is written");
  writeCatalog(single.catalog, tmp);
  const loaded = readCatalog("lab-fixture-52b", tmp)!;
  assert(loaded.images.find((item) => item.id === "img-a")?.status === "USER_APPROVED", "catalog reload keeps approval");
  assert(loaded.events.filter((item) => item.imageId === "img-a" && item.status === "USER_APPROVED").length === 1, "one approval event is recorded");

  const again = await approveCatalogImages({
    catalog: loaded,
    imageIds: ["img-a"],
    actor: "tester",
    root: tmp,
    fetchImage: fetchOk(),
  });
  assert(again.results[0]?.ok && again.results[0].reused, "duplicate approval is reused");
  assert(again.catalog.events.filter((item) => item.imageId === "img-a" && item.status === "USER_APPROVED").length === 1, "reuse does not duplicate the event");

  const multi = await approveCatalogImages({
    catalog: again.catalog,
    imageIds: ["img-a", "img-b", "img-b"],
    actor: "tester",
    root: tmp,
    now: "2026-10-22T03:01:00.000Z",
    fetchImage: fetchOk(),
  });
  assert(multi.results.filter((item) => item.ok).length === 2, "multi-select approves unique ids");
  assert(multi.catalog.images.find((item) => item.id === "img-b")?.status === "USER_APPROVED", "second image is approved");

  const writeFailRoot = path.join(tmp, "blocked-file");
  writeFileSync(writeFailRoot, "not-a-dir");
  const writeFail = await approveCatalogImages({
    catalog: { ...emptyCatalog("lab-fixture-52b", "Aurora Nectar"), images: [two] },
    imageIds: ["img-b"],
    actor: "tester",
    root: writeFailRoot,
    fetchImage: fetchOk(),
  });
  assert(!writeFail.results[0]?.ok, "write failure is not approval");
  assert(writeFail.catalog.images[0]?.status !== "USER_APPROVED", "image is not marked approved without a file");

  const revoked = decideCatalogImage({ catalog: multi.catalog, imageId: "img-a", actor: "tester", status: "REVOKED" });
  if ("error" in revoked) throw new Error(revoked.error);
  assert(revoked.catalog.images.find((item) => item.id === "img-a")?.status === "REVOKED", "approval can be revoked");
  const s5 = buildV4Model("s5")!;
  const over = overlayApprovedAssets(s5, revoked.catalog);
  assert(!over.commercialImage || over.commercialImage.src.includes("img-b"), "V4 uses only approved files that remain");
  const rejected = decideCatalogImage({ catalog: revoked.catalog, imageId: "img-b", actor: "tester", status: "REJECTED" });
  if ("error" in rejected) throw new Error(rejected.error);
  assert(!overlayApprovedAssets(s5, rejected.catalog).commercialImage, "rejected images leave V4");

  console.log("REAL_ASSET_APPROVAL_OK");
  console.log(`OK_COUNT=${passed}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
