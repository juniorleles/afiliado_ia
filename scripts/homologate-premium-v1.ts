/**
 * Premium V1 homologation. Does not publish and does not change Product Facts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { readAffiliateProgram } from "../src/lib/affiliate-program.ts";
import { readStoredLandingDocument } from "../src/lib/landing-composer/store.ts";
import { emptyProductFacts, type ProductFormatFact } from "../src/lib/product-facts.ts";
import { buildAdaptivePlan } from "../src/lib/product-showcase/adaptive-plan.ts";
import { buildEditorialDocument } from "../src/lib/product-showcase/editorial.ts";
import { buildHomologationFixture } from "../src/lib/product-showcase/homologation-fixtures.ts";
import { evaluateStoredCampaign } from "../src/lib/product-showcase/quality-campaign.ts";
import { evaluateLpQuality, type DomProbe, type LighthouseProbe, type QualityEvidence, type ViewportProbe } from "../src/lib/product-showcase/quality-gate.ts";
import { AFFILIATE_DISCLOSURE_TEXT } from "../src/lib/public-site.ts";

const OUT = path.join(process.cwd(), "data", "evidence", "premium-v1-homologation-v1");
const BASE = "http://127.0.0.1:3000";
const WIDTHS = [1440, 768, 390] as const;

const PAGES = [
  { id: "A-capsule", scenario: "A", synthetic: true, route: "/admin/lab/homologation/capsule", slug: null, campaignId: null },
  { id: "B-neuroprime", scenario: "B", synthetic: false, route: "/visual-frame/neuroprime", slug: "neuroprime", campaignId: 190 },
  { id: "C-powder", scenario: "C", synthetic: true, route: "/admin/lab/product-showcase-powder", slug: null, campaignId: null },
  { id: "D-cholibrium", scenario: "D", synthetic: false, route: "/admin/lab/product-showcase/cholibrium", slug: "cholibrium", campaignId: 188 },
  { id: "E-few", scenario: "E", synthetic: true, route: "/admin/lab/homologation/few", slug: null, campaignId: null },
  { id: "F-joint-genesis", scenario: "F", synthetic: false, route: "/admin/lab/product-showcase/campanha-testes", slug: "campanha-testes", campaignId: 186 },
  { id: "F-thin", scenario: "F", synthetic: true, route: "/admin/lab/homologation/thin", slug: null, campaignId: null },
] as const;

type Probe = {
  overflow: boolean;
  h1Count: number;
  adminChrome: boolean;
  technicalCopy: boolean;
  emptyMedia: boolean;
  demoAsset: boolean;
  hero: string;
  ingredientDepth: string;
  ctaCount: number;
  imagesWithoutAlt: number;
  navLabel: string | null;
  navLabels: string[];
  minControlHeight: number | null;
  editorial: boolean;
  synthetic: boolean;
  links: Array<{ href: string; text: string }>;
};

function snapshot(id: number) {
  const campaign = getCampaignById(id);
  const program = readAffiliateProgram(id);
  return {
    facts: campaign?.sourceFactsJson ?? null,
    publication: campaign?.publicationStatus ?? null,
    template: campaign?.presentationTemplate ?? null,
    asset: campaign?.productAssetStatus ?? null,
    gates: readStoredLandingDocument(id)?.metadata.gates ?? null,
    ppc: program ? { brandPpc: program.brandPpc, genericSearchPpc: program.genericSearchPpc, googleAdsPolicy: program.googleAdsPolicy, directCheckoutLinking: program.directCheckoutLinking } : null,
  };
}

function evidenceFor(viewports: ViewportProbe[], dom: DomProbe): QualityEvidence {
  return {
    viewports,
    dom,
    lighthouse: null,
    humanReview: "PENDING",
    humanReviewNote: "Homologation does not accept the visual review.",
  };
}

function domFromProbe(page: (typeof PAGES)[number], probe: Probe, template: string | null): DomProbe {
  const campaignMatch = page.campaignId != null && template === "PRODUCT_SHOWCASE_PREMIUM_V1" && page.route.startsWith("/visual-frame/");
  return {
    route: page.route,
    matchesSelectedTemplate: page.campaignId == null || campaignMatch,
    h1Count: probe.h1Count,
    adminChrome: probe.adminChrome,
    technicalCopy: probe.technicalCopy,
    emptyMedia: probe.emptyMedia,
    demoAsset: probe.demoAsset,
    hero: probe.hero === "image" || probe.hero === "editorial" ? probe.hero : "",
    ingredientDepth: probe.ingredientDepth === "names" || probe.ingredientDepth === "noted" || probe.ingredientDepth === "photos" ? probe.ingredientDepth : "",
    ctaCount: probe.ctaCount,
    imagesWithoutAlt: probe.imagesWithoutAlt,
    navLabel: probe.navLabel,
    navLabels: probe.navLabels,
    minControlHeight: probe.minControlHeight,
  };
}

async function main() {
  const before = { 186: snapshot(186), 188: snapshot(188), 189: snapshot(189), 190: snapshot(190) };
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const captures: Array<Record<string, unknown>> = [];
  const probes = new Map<string, Probe>();
  try {
    const page = await browser.newPage();
    for (const item of PAGES) {
      const widths: ViewportProbe[] = [];
      let probe: Probe | null = null;
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const response = await page.goto(`${BASE}${item.route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        if (response?.status() !== 200) throw new Error(`${item.route} ${width} status ${response?.status()}`);
        await page.waitForSelector(".psp", { timeout: 30_000 });
        const measured = await page.evaluate(() => {
          const root = document.querySelector(".psp");
          const text = document.body.innerText;
          const html = document.documentElement.innerHTML;
          const images = [...document.querySelectorAll(".psp img")];
          const controls = [...document.querySelectorAll(".psp a, .psp button")].map((element) => element.getBoundingClientRect().height);
          const nav = document.querySelector(".psp-nav");
          return {
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            h1Count: document.querySelectorAll("h1").length,
            adminChrome: /PREVIEW — NOT PUBLISHED|CONTENT GATE|Laboratório visual/i.test(text),
            technicalCopy: /official image not available|NO_APPROVED_PACKSHOT|PRICE_CONTEXT_INSUFFICIENT|PPC_PROHIBITED/i.test(text),
            emptyMedia: Boolean(document.querySelector(".psp-hero-media") && !document.querySelector(".psp-hero-media img")),
            demoAsset: /demo-assets/i.test(html),
            hero: root?.getAttribute("data-hero") ?? "",
            ingredientDepth: document.querySelector(".psp-names, .psp-names-type")?.getAttribute("data-depth") ?? "",
            ctaCount: document.querySelectorAll("a.psp-cta").length,
            imagesWithoutAlt: images.filter((image) => !image.getAttribute("alt")?.trim()).length,
            navLabel: nav?.getAttribute("aria-label") ?? null,
            navLabels: [...(nav?.querySelectorAll("a") ?? [])].map((anchor) => anchor.textContent?.trim() ?? "").filter(Boolean),
            minControlHeight: controls.length > 0 ? Math.min(...controls) : null,
            editorial: root?.getAttribute("data-editorial") === "1",
            synthetic: Boolean(document.querySelector("[data-synthetic-fixture]")),
            links: [...document.querySelectorAll(".psp a")].map((anchor) => ({ href: anchor.getAttribute("href") ?? "", text: anchor.textContent?.trim() ?? "" })),
          };
        });
        if (measured.overflow) throw new Error(`overflow ${item.id} ${width}`);
        if (measured.adminChrome || measured.technicalCopy) throw new Error(`technical chrome ${item.id} ${width}`);
        if (measured.emptyMedia) throw new Error(`empty media ${item.id} ${width}`);
        if (!item.synthetic && measured.demoAsset) throw new Error(`demo asset on real scenario ${item.id}`);
        if (!measured.editorial) throw new Error(`editorial renderer missing ${item.id}`);
        const file = `${item.id}-${width}.png`;
        await page.screenshot({ path: path.join(OUT, file), fullPage: true });
        widths.push({ width, overflow: measured.overflow, file });
        probe = measured;
        captures.push({ id: item.id, scenario: item.scenario, route: item.route, width, file, synthetic: item.synthetic, h1: measured.h1Count, hero: measured.hero, cta: measured.ctaCount, minControlHeight: measured.minControlHeight, nav: measured.navLabels });
      }
      if (!probe) throw new Error(`missing probe ${item.id}`);
      probes.set(item.id, probe);
      const template = item.campaignId ? before[item.campaignId as 186 | 188 | 190].template : "PRODUCT_SHOWCASE_PREMIUM_V1";
      const dom = domFromProbe(item, probe, template);
      const evidence = evidenceFor(widths, dom);
      if (item.id === "A-capsule" || item.id === "E-few" || item.id === "F-thin") {
        const fixtureId = item.id === "A-capsule" ? "capsule" : item.id === "E-few" ? "few" : "thin";
        const fixture = buildHomologationFixture(fixtureId);
        const report = evaluateLpQuality({
          facts: fixture.facts,
          plan: fixture.plan,
          editorial: fixture.editorial,
          structuralGate: null,
          policyGate: null,
          presentationTemplate: "PRODUCT_SHOWCASE_PREMIUM_V1",
          ppc: fixture.ppc,
          directCheckoutLinking: null,
          evidence,
        });
        writeFileSync(path.join(OUT, `${item.id}-quality.json`), JSON.stringify({ synthetic: true, label: fixture.label, report }, null, 2));
      } else if (item.campaignId) {
        const campaign = getCampaignById(item.campaignId);
        const report = campaign ? evaluateStoredCampaign(campaign, evidence) : null;
        writeFileSync(path.join(OUT, `${item.id}-quality.json`), JSON.stringify({ synthetic: false, campaignId: item.campaignId, report }, null, 2));
      }
    }
  } finally {
    await browser.close();
  }

  const powderProbe = probes.get("C-powder");
  if (powderProbe) {
    const facts = emptyProductFacts("Cedar Powder", "https://example.test/cedar-powder", "IMPORTED");
    facts.confidence.usageInformation = "DIRECT_SOURCE";
    facts.usageInformation = ["Powder in a pouch", "Mix one level scoop with water"];
    facts.confidence.ingredientsOrComponents = "DIRECT_SOURCE";
    facts.ingredientsOrComponents = ["Cedar bark", "River malt"];
    facts.confidence.pricingInformation = "DIRECT_SOURCE";
    facts.pricingInformation = "One pouch for USD 36";
    facts.confidence.guaranteeInformation = "DIRECT_SOURCE";
    facts.guaranteeInformation = "30-day refund";
    facts.confidence.cautions = "DIRECT_SOURCE";
    facts.cautions = ["This product is not intended to diagnose, treat, cure, or prevent any disease."];
    const format: ProductFormatFact = {
      value: "powder",
      statement: "Powder in a pouch",
      provenance: "DIRECT_SOURCE",
      copyEligibility: "YES",
      policyFindings: [],
      sourceUrl: "https://example.test/cedar-powder",
      sourcePageCategory: "PRODUCT_DETAILS",
    };
    facts.productFormat = format;
    const plan = buildAdaptivePlan({ facts });
    const editorial = buildEditorialDocument({ facts, plan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
    const report = evaluateLpQuality({
      facts,
      plan,
      editorial,
      structuralGate: null,
      policyGate: null,
      presentationTemplate: null,
      ppc: null,
      directCheckoutLinking: null,
      evidence: evidenceFor(
        WIDTHS.map((width) => ({ width, overflow: false, file: `C-powder-${width}.png` })),
        domFromProbe(PAGES[2], powderProbe, null),
      ),
    });
    writeFileSync(path.join(OUT, "C-powder-quality.json"), JSON.stringify({ synthetic: true, label: "In-memory Cedar Powder fixture. Not a campaign.", report }, null, 2));
  }

  const capsule = buildHomologationFixture("capsule");
  const blockedPlan = buildAdaptivePlan({
    facts: capsule.facts,
    approvedPackshot: { src: "/lab-fixtures/synthetic-packshot.jpg", alt: "Northwind Capsule product image" },
    cta: { href: "https://hop.example/northwind", label: "See offer" },
    ppc: { brandPpc: "BLOCKED", genericSearchPpc: "ALLOWED" },
  });
  const blockedEditorial = buildEditorialDocument({ facts: capsule.facts, plan: blockedPlan, affiliateDisclosure: AFFILIATE_DISCLOSURE_TEXT });
  const capsuleProbe = probes.get("A-capsule");
  const blocked = capsuleProbe ? evaluateLpQuality({
    facts: capsule.facts,
    plan: blockedPlan,
    editorial: blockedEditorial,
    structuralGate: null,
    policyGate: null,
    presentationTemplate: "PRODUCT_SHOWCASE_PREMIUM_V1",
    ppc: { brandPpc: "BLOCKED", genericSearchPpc: "ALLOWED" },
    directCheckoutLinking: "ALLOWED",
    evidence: evidenceFor(
      WIDTHS.map((width) => ({ width, overflow: false, file: `A-capsule-${width}.png` })),
      domFromProbe(PAGES[0], capsuleProbe, "PRODUCT_SHOWCASE_PREMIUM_V1"),
    ),
  }) : null;
  writeFileSync(path.join(OUT, "G-ppc-prohibited-quality.json"), JSON.stringify({
    synthetic: true,
    label: "Same synthetic capsule render. PPC does not change the page.",
    report: blocked,
  }, null, 2));

  const after = { 186: snapshot(186), 188: snapshot(188), 189: snapshot(189), 190: snapshot(190) };
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("campaign snapshot changed");

  const drafts = ["/p/neuroprime", "/p/cholibrium", "/p/campanha-testes", "/p/northwind-qa"];
  const draftStatus: Record<string, number> = {};
  for (const route of drafts) {
    const response = await fetch(`${BASE}${route}`);
    draftStatus[route] = response.status;
    if (response.status !== 404) throw new Error(`${route} status ${response.status}`);
  }

  const lighthouse = await runLighthouse([
    ["/visual-frame/neuroprime", "lighthouse-neuroprime.json"],
    ["/admin/lab/homologation/capsule", "lighthouse-capsule.json"],
  ]);

  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify({
    ranAt: new Date().toISOString(),
    base: BASE,
    node: process.version,
    humanReview: "PENDING",
    predictsConversion: false,
    captures,
    draftStatus,
    lighthouse,
    publicationUnchanged: true,
  }, null, 2));
  console.log(JSON.stringify({ ok: true, out: OUT, lighthouse }, null, 2));
}

async function runLighthouse(targets: Array<[string, string]>): Promise<Array<Record<string, unknown>>> {
  const results: Array<Record<string, unknown>> = [];
  for (const [route, file] of targets) {
    const output = path.join(OUT, file);
    try {
      execFileSync("npx", [
        "lighthouse",
        `${BASE}${route}`,
        "--quiet",
        "--chrome-flags=--headless",
        "--only-categories=performance,accessibility,seo,best-practices",
        "--output=json",
        `--output-path=${output}`,
      ], { stdio: "inherit", timeout: 180_000, shell: true });
      const parsed = JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(output, "utf8"))) as {
        categories?: Record<string, { score?: number }>;
        audits?: Record<string, { score?: number | null }>;
        lighthouseVersion?: string;
      };
      const score = (id: string) => parsed.categories?.[id]?.score;
      const probe: LighthouseProbe | null = [score("performance"), score("accessibility"), score("best-practices"), score("seo")].every((item) => typeof item === "number")
        ? {
          performance: score("performance") as number,
          accessibility: score("accessibility") as number,
          bestPractices: score("best-practices") as number,
          seo: score("seo") as number,
          contrastFailed: parsed.audits?.["color-contrast"]?.score === 0,
          source: output,
        }
        : null;
      results.push({ route, status: probe ? "RECORDED" : "EVIDENCE_MISSING", probe, lighthouseVersion: parsed.lighthouseVersion ?? null });
    } catch (error) {
      results.push({ route, status: "EVIDENCE_MISSING", detail: error instanceof Error ? error.message : "lighthouse failed" });
    }
  }
  return results;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
