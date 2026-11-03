// npx tsx scripts/run-execution-54p-visual.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const DIR = path.join("data/evidence/execution-54p-legacy-universal-integration");
const SHOTS = path.join(DIR, "screenshots");
const BASE = process.env.VISUAL_QA_BASE_URL ?? "http://127.0.0.1:3000";

async function main() {
  mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results: Array<Record<string, unknown>> = [];
  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    for (const route of [
      { id: "fatos", path: "/admin/191/fatos" },
      { id: "v2", path: "/admin/generate?campaignId=191" },
    ]) {
      const response = await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle", timeout: 60_000 });
      const file = path.join(SHOTS, `${route.id}-${viewport.name}-${viewport.width}.jpg`);
      await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 70 });
      const body = await page.locator("body").innerText();
      results.push({
        route: route.path,
        viewport: viewport.name,
        status: response?.status() ?? null,
        file: file.replace(/\\/g, "/"),
        hasResearchCoverage: /research coverage/i.test(body),
        hasExtractionUnavailable: /extraction confidence unavailable/i.test(body),
        hasSandboxDraft: /sandbox draft|generation readiness/i.test(body),
        hasConfidence94: /confidence\s*94/i.test(body),
        hasGenerationRemains: /generation remains available/i.test(body),
      });
    }
    await page.close();
  }
  await browser.close();
  writeFileSync(path.join(DIR, "visual.json"), JSON.stringify({ base: BASE, results }, null, 2) + "\n");
  console.log(JSON.stringify({ count: results.length, results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
