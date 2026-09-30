/**
 * Density audit of a rendered LP: how much vertical space carries information
 * and how much is decoration only.
 *
 * npx tsx scripts/visual-qa/audit-page-density.ts --slug=<slug> --out=<dir> [--label=before]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const slug = process.argv.find((item) => item.startsWith("--slug="))?.slice(7);
const out = process.argv.find((item) => item.startsWith("--out="))?.slice(6);
const label = process.argv.find((item) => item.startsWith("--label="))?.slice(8) ?? "audit";
if (!slug || !out) throw new Error("--slug and --out are required");
const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3015").replace(/\/$/, "");
const url = `${base}/admin/preview/${slug}`;

const measure = new Function(`
  const root = document.querySelector("[data-visual-system='visual-master-v1']");
  if (!root) return { error: "visual system not rendered" };
  const rows = [];
  for (const node of root.children) {
    const rect = node.getBoundingClientRect();
    const text = (node.textContent || "").replace(/\\s+/g, " ").trim();
    const images = node.querySelectorAll("img").length;
    rows.push({
      tag: node.tagName.toLowerCase(),
      className: node.className,
      height: Math.round(rect.height),
      textLength: text.length,
      images,
      decorativeOnly: text.length === 0,
    });
  }
  const hero = root.querySelector(".vm-hero");
  const heroProduct = root.querySelector(".vm-hero [data-product-role]");
  const closingProduct = root.querySelector(".vm-close [data-product-role]");
  const footer = root.querySelector(".vm-footer");
  const area = (node) => {
    if (!node) return 0;
    const rect = node.getBoundingClientRect();
    return Math.round(rect.width * rect.height);
  };
  const size = (node) => {
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  };
  const heroArea = area(hero);
  const ctas = [...root.querySelectorAll("a[data-cta-position]")].map((node) => {
    const rect = node.getBoundingClientRect();
    return { width: Math.round(rect.width), height: Math.round(rect.height), fontSize: getComputedStyle(node).fontSize };
  });
  return {
    pageHeight: Math.round(root.getBoundingClientRect().height),
    decorativeOnlyHeight: rows.filter((row) => row.decorativeOnly).reduce((sum, row) => sum + row.height, 0),
    contentBearingHeight: rows.filter((row) => !row.decorativeOnly).reduce((sum, row) => sum + row.height, 0),
    heroHeight: hero ? Math.round(hero.getBoundingClientRect().height) : 0,
    footerHeight: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
    heroProduct: size(heroProduct),
    heroProductShareOfHero: heroArea ? Number((area(heroProduct) / heroArea).toFixed(4)) : 0,
    closingProduct: size(closingProduct),
    ctas,
    faqSummaryFontSize: (() => {
      const node = root.querySelector(".vm-faq summary");
      return node ? getComputedStyle(node).fontSize : null;
    })(),
    sections: rows,
  };
`) as () => Record<string, unknown>;

async function main() {
  mkdirSync(out!, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const report: Record<string, unknown> = {};
  for (const viewport of [
    { name: "390", width: 390, height: 844 },
    { name: "1440", width: 1440, height: 900 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(url, { waitUntil: "load", timeout: 120_000 });
    await page.locator("[data-visual-system='visual-master-v1']").waitFor({ timeout: 60_000 });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const result = (await page.evaluate(measure)) as Record<string, number>;
    report[viewport.name] = result;
    const ratio = result.pageHeight ? (result.decorativeOnlyHeight as number) / (result.pageHeight as number) : 0;
    console.log(
      `${viewport.name} PAGE_HEIGHT=${result.pageHeight} DECORATIVE_ONLY=${result.decorativeOnlyHeight} CONTENT_BEARING=${result.contentBearingHeight} DECORATIVE_RATIO=${ratio.toFixed(3)} HERO=${result.heroHeight} FOOTER=${result.footerHeight} HERO_PRODUCT_SHARE=${result.heroProductShareOfHero}`,
    );
    for (const row of result.sections as unknown as Array<Record<string, unknown>>) {
      console.log(`   ${String(row.height).padStart(5)}px text=${String(row.textLength).padStart(4)} img=${row.images} ${row.decorativeOnly ? "DECORATIVE" : "content   "} ${row.className}`);
    }
  }
  writeFileSync(path.join(out!, `density-${label}.json`), `${JSON.stringify({ url, label, report }, null, 2)}\n`, "utf8");
  await browser.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "audit failed");
  process.exit(1);
});
