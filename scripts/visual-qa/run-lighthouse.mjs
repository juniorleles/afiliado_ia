import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { chromium } from "playwright";

const base = (process.env.VISUAL_QA_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const url = base.includes("/admin/preview/")
  ? base
  : `${base}/admin/preview/joint-genesis-controlled-ready-13`;
const out = process.env.LIGHTHOUSE_OUT
  ? path.resolve(process.env.LIGHTHOUSE_OUT)
  : path.join(process.cwd(), "data", "production-readiness", "visual-qa-tooling-v2", "lighthouse");

mkdirSync(out, { recursive: true });
const chrome = await launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ["--headless=new", "--disable-gpu", "--no-sandbox"],
});

try {
  const result = await lighthouse(url, {
    port: chrome.port,
    output: "html",
    logLevel: "error",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
  });
  if (!result) throw new Error("Lighthouse returned no result");
  const lhr = result.lhr;
  const score = (id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
  const scores = {
    formFactor: lhr.configSettings?.formFactor ?? "mobile",
    performance: score("performance"),
    accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    seo: score("seo"),
  };
  const interesting = Object.entries(lhr.audits)
    .filter(([, audit]) => {
      return (
        audit.score !== null &&
        audit.score < 1 &&
        audit.scoreDisplayMode !== "manual" &&
        audit.scoreDisplayMode !== "notApplicable" &&
        audit.scoreDisplayMode !== "informative"
      );
    })
    .map(([id, audit]) => ({ id, title: audit.title, score: audit.score }));
  const critical = interesting.filter((item) => item.score === 0).map((item) => item.title);
  const warnings = interesting
    .filter((item) => item.score !== null && item.score > 0 && item.score < 0.9)
    .map((item) => item.title);
  writeFileSync(path.join(out, "report.json"), JSON.stringify({ url, scores, critical, warnings, audits: interesting }, null, 2));
  const html = Array.isArray(result.report) ? result.report.join("\n") : result.report;
  writeFileSync(path.join(out, "report.html"), html);
  console.log("PERFORMANCE=" + scores.performance);
  console.log("ACCESSIBILITY=" + scores.accessibility);
  console.log("BEST_PRACTICES=" + scores.bestPractices);
  console.log("SEO=" + scores.seo);
  console.log("LIGHTHOUSE_CRITICAL_COUNT=" + critical.length);
  console.log("LIGHTHOUSE_WARNING_COUNT=" + warnings.length);
} finally {
  chrome.kill();
}
