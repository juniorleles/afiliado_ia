import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { emptyCatalog, readCatalog, writeCatalog } from "../src/lib/real-product-assets/store.ts";
import { imageIdFor } from "../src/lib/real-product-assets/authorize.ts";
import type { DiscoveredImage } from "../src/lib/real-product-assets/types.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "execution-52b-approval-fix");
const SHOTS = path.join(OUT, "screenshots");
const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const PRODUCT = "lab-fixture-52b";
const PAGE = `${BASE}/admin/lab/real-assets/${PRODUCT}`;
const V4 = `${BASE}/admin/lab/renderer-v4/real/${PRODUCT}`;

function card(partial: Pick<DiscoveredImage, "id" | "url" | "fileName">): DiscoveredImage {
  return {
    productKey: PRODUCT,
    productName: "Aurora Nectar",
    sourcePage: "https://aurora-nectar.example/assets",
    alt: "Aurora Nectar bottle",
    width: null,
    height: null,
    format: null,
    byteLength: null,
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

function seedCatalog() {
  const second = path.join(process.cwd(), "public", "lab-fixtures", "synthetic-packshot-2.jpg");
  if (!existsSync(second)) {
    copyFileSync(path.join(process.cwd(), "public", "lab-fixtures", "synthetic-packshot.jpg"), second);
  }
  const oneUrl = "lab-fixture:synthetic-packshot.jpg";
  const twoUrl = "lab-fixture:synthetic-packshot-2.jpg";
  const badUrl = "https://example.com/no-image-52b.png";
  const catalog = emptyCatalog(PRODUCT, "Aurora Nectar", "2026-10-22T00:00:00.000Z");
  catalog.sourcePages = ["https://aurora-nectar.example/assets"];
  catalog.images = [
    card({ id: imageIdFor(oneUrl), url: oneUrl, fileName: "synthetic-packshot.jpg" }),
    card({ id: imageIdFor(twoUrl), url: twoUrl, fileName: "synthetic-packshot-2.jpg" }),
    card({
      id: imageIdFor(badUrl),
      url: badUrl,
      fileName: "no-image-52b.png",
      ...{ probableKind: "other" as const, match: "UNCONFIRMED" as const },
    }),
  ];
  writeCatalog(catalog);
  return catalog;
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const seeded = seedCatalog();
  const browser = await chromium.launch({ headless: true, channel: "chrome" }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(String(err)));

  const res = await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 90000 });
  const crashedBefore = await page.locator("text=Something went wrong").count();
  await page.waitForSelector("[data-gallery=real-assets]", { timeout: 30000 });

  const firstId = seeded.images[0]!.id;
  const secondId = seeded.images[1]!.id;
  const badId = seeded.images[2]!.id;

  await page.locator(`[data-select-image="${firstId}"]`).check();
  await page.locator(`[data-select-image="${secondId}"]`).check();
  await Promise.all([
    page.waitForURL(/[?&]approved=/, { timeout: 25000 }),
    page.locator("[data-approve-selected]").click(),
  ]);
  await page.waitForSelector("[data-gallery=real-assets]", { timeout: 30000 });

  const afterBatch = await page.evaluate(() => ({
    crashed: document.body.innerText.includes("Something went wrong"),
    approved: Array.from(document.querySelectorAll("[data-status=USER_APPROVED]")).map((node) => node.getAttribute("data-image-id")),
    errorText: document.querySelector("[data-approval-error]")?.textContent ?? null,
  }));

  await Promise.all([
    page.waitForURL(/[?&](failed|error)=/, { timeout: 20000 }),
    page.locator(`[data-image-id="${badId}"] button`, { hasText: "Approve" }).click(),
  ]);
  const afterBad = await page.evaluate((id) => ({
    crashed: document.body.innerText.includes("Something went wrong"),
    error: document.body.innerText.includes("Não foi possível aprovar esta imagem"),
    badStatus: document.querySelector(`[data-image-id="${id}"]`)?.getAttribute("data-status"),
  }), badId);

  const desktop = path.join(SHOTS, "approval-desktop-1440.jpg");
  await page.screenshot({ path: desktop, type: "jpeg", quality: 55, fullPage: true });

  const v4 = await page.goto(V4, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector('img[data-v4-image="commercial"]', { timeout: 20000 });
  await page.waitForFunction(() => {
    const img = document.querySelector<HTMLImageElement>('img[data-v4-image="commercial"]');
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }, { timeout: 20000 });
  const v4State = await page.evaluate(() => ({
    crashed: document.body.innerText.includes("Something went wrong"),
    photo: document.querySelector("[data-v4-photo]")?.getAttribute("data-v4-photo"),
    img: Boolean(document.querySelector('img[data-v4-image="commercial"]')),
    naturalWidth: document.querySelector<HTMLImageElement>('img[data-v4-image="commercial"]')?.naturalWidth ?? 0,
  }));
  const v4Shot = path.join(SHOTS, "v4-fixture-1440.jpg");
  await page.screenshot({ path: v4Shot, type: "jpeg", quality: 55, fullPage: true });

  await page.goto(PAGE, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (await page.locator(`[data-image-id="${firstId}"] button`, { hasText: "Revoke" }).count()) {
    await Promise.all([
      page.waitForURL(/[?&]revoked=/, { timeout: 20000 }),
      page.locator(`[data-image-id="${firstId}"] button`, { hasText: "Revoke" }).click(),
    ]);
  }

  await browser.close();

  const catalog = readCatalog(PRODUCT)!;
  const approved = catalog.images.filter((item) => item.status === "USER_APPROVED");
  const filesOk = approved.every((item) => item.localFile && existsSync(item.localFile));
  const femicore = readCatalog("femicore");
  const report = {
    pageStatus: res?.status() ?? null,
    v4Status: v4?.status() ?? null,
    crashedBefore,
    afterBatch,
    afterBad,
    v4State,
    pageErrors,
    approvedIds: approved.map((item) => item.id),
    approvedFilesExist: filesOk,
    events: catalog.events.map((item) => ({ imageId: item.imageId, status: item.status })),
    femicoreApproved: femicore?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0,
    screenshots: [desktop, v4Shot],
    galleryFunctional:
      crashedBefore === 0 &&
      !afterBatch.crashed &&
      !afterBad.crashed &&
      !v4State.crashed &&
      afterBatch.approved.length >= 2 &&
      filesOk &&
      v4State.img &&
      v4State.naturalWidth > 0 &&
      (femicore?.images.filter((item) => item.status === "USER_APPROVED").length ?? 0) === 0,
  };
  writeFileSync(path.join(OUT, "browser-approval.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.galleryFunctional) {
    throw new Error("Approval browser test did not meet the isolated fixture criteria.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});
