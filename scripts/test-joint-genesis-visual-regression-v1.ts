/**
 * Guards the frozen reference LP against the compact-density recomposition.
 *
 * Every new layout path is reached either through data-content-density="compact"
 * or through elements that only the new branches emit. A reference page that is
 * standard density and emits none of those elements cannot have moved.
 *
 * npx tsx scripts/test-joint-genesis-visual-regression-v1.ts --slug=<slug> [--out=<file>]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const slug = process.argv.find((item) => item.startsWith("--slug="))?.slice(7);
const out = process.argv.find((item) => item.startsWith("--out="))?.slice(6);
if (!slug) throw new Error("--slug is required");
const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3015").replace(/\/$/, "");
const url = `${base}/admin/preview/${slug}`;

let failures = 0;
const assert = (ok: boolean, label: string, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` :: ${detail}` : ""}`);
};

const probe = new Function(`
  const root = document.querySelector("[data-visual-system='visual-master-v1']");
  if (!root) return { present: false };
  const sections = [...root.children].map((node) => ({
    className: node.className,
    height: Math.round(node.getBoundingClientRect().height),
  }));
  const heroProduct = document.querySelector(".vm-hero .vm-product");
  return {
    present: true,
    density: root.getAttribute("data-content-density"),
    core: document.querySelectorAll(".vm-core").length,
    notes: document.querySelectorAll(".vm-note").length,
    pauseStrip: document.querySelectorAll(".vm-pause-strip").length,
    eyebrow: document.querySelectorAll(".vm-eyebrow").length,
    structuredLists: document.querySelectorAll("[data-structured-source]").length,
    heroSupport: document.querySelectorAll(".vm-hero .vm-lede").length,
    missingSlots: [...document.querySelectorAll("[data-missing-asset]")].map((node) => node.getAttribute("data-missing-asset")),
    boundPhotos: document.querySelectorAll("img.vm-photo-bound").length,
    heroProductWidth: heroProduct ? Math.round(heroProduct.getBoundingClientRect().width) : 0,
    pauseHeight: Math.round(document.querySelector(".vm-pause")?.getBoundingClientRect().height ?? 0),
    pageHeight: Math.round(root.getBoundingClientRect().height),
    sections,
  };
`) as () => Record<string, unknown>;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const report: Record<string, unknown> = { url, viewports: {} as Record<string, unknown> };
  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "1440", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-visual-system='visual-master-v1']").waitFor({ timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const result = (await page.evaluate(probe)) as Record<string, number | string | unknown[]>;
    (report.viewports as Record<string, unknown>)[viewport.name] = result;
    assert(result.present === true, `${viewport.name} reference renders the visual master`);
    assert(result.density === "standard", `${viewport.name} density stays standard`, String(result.density));
    assert(result.core === 0, `${viewport.name} no compact content core`, String(result.core));
    assert(result.notes === 0, `${viewport.name} no note panels`, String(result.notes));
    assert(result.pauseStrip === 0, `${viewport.name} pause keeps its full band`, String(result.pauseStrip));
    assert(result.eyebrow === 0, `${viewport.name} no hero eyebrow`, String(result.eyebrow));
    assert(result.structuredLists === 0, `${viewport.name} no structured list rendering`, String(result.structuredLists));
    assert(result.heroSupport === 1, `${viewport.name} hero support copy kept`, String(result.heroSupport));
    assert((result.missingSlots as unknown[]).length === 0, `${viewport.name} no unbound decorative slot`, JSON.stringify(result.missingSlots));
    console.log(`   ${viewport.name} pageHeight=${result.pageHeight} pause=${result.pauseHeight} heroProduct=${result.heroProductWidth} photos=${result.boundPhotos}`);
  }
  await browser.close();
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(failures === 0 ? "JOINT_GENESIS_VISUAL_REGRESSION=PASS" : `JOINT_GENESIS_VISUAL_REGRESSION=FAIL (${failures})`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "reference check failed");
  process.exit(1);
});
