/**
 * Records which visual role each rendered slot resolved to, and the product shots in use.
 *
 * npx tsx scripts/visual-qa/probe-asset-bindings.ts --slug=<slug> --out=<file>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const slug = process.argv.find((item) => item.startsWith("--slug="))?.slice(7);
const out = process.argv.find((item) => item.startsWith("--out="))?.slice(6);
if (!slug || !out) throw new Error("--slug and --out are required");
const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3015").replace(/\/$/, "");

const probe = new Function(`
  const round = (value) => Math.round(value);
  const slots = [...document.querySelectorAll("[data-visual-role]")].map((node) => {
    const image = node.querySelector("img");
    const rect = node.getBoundingClientRect();
    return {
      role: node.getAttribute("data-visual-role"),
      slot: node.getAttribute("data-asset-slot"),
      src: image ? image.getAttribute("src") : null,
      width: round(rect.width),
      height: round(rect.height),
    };
  });
  const products = [...document.querySelectorAll("[data-product-role]")].map((node) => {
    const rect = node.getBoundingClientRect();
    return {
      role: node.getAttribute("data-product-role"),
      roles: node.getAttribute("data-product-roles"),
      src: node.getAttribute("src"),
      width: round(rect.width),
      height: round(rect.height),
      naturalRatio: node.naturalWidth ? Number((node.naturalWidth / node.naturalHeight).toFixed(4)) : 0,
      drawnRatio: rect.height ? Number((rect.width / rect.height).toFixed(4)) : 0,
    };
  });
  return { slots, products, missing: [...document.querySelectorAll("[data-missing-asset]")].map((n) => n.getAttribute("data-missing-asset")) };
`) as () => Record<string, unknown>;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${base}/admin/preview/${slug}`, { waitUntil: "load", timeout: 120_000 });
  await page.locator("[data-visual-system='visual-master-v1']").waitFor({ timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const result = await page.evaluate(probe);
  await browser.close();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "probe failed");
  process.exit(1);
});
