/**
 * Execution 45 — builds the evidence package in data/evidence/lp-premium-v2/.
 * Runs the regression tests and tsc, then compares the V1 baseline probe with the V2 probe.
 * Refuses to overwrite earlier files. Does not publish, deploy or commit.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "data", "evidence", "lp-premium-v2");
const START_FREE_BYTES = 11_497_017_344; // measured at the start of Execution 45

function freeBytes(): number {
  const stats = statfsSync(process.cwd());
  return Number(stats.bavail) * Number(stats.bsize);
}

function write(name: string, value: unknown) {
  const file = path.join(ROOT, name);
  if (existsSync(file)) throw new Error(`REFUSING_TO_OVERWRITE ${name}`);
  writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: true, cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { exit: result.status ?? -1, ok: (output.match(/^OK:/gm) ?? []).length, output };
}

if (freeBytes() < 5 * 1024 ** 3) throw new Error("DISK_GUARD: free space below 5 GB");

const TESTS = [
  "test-editorial-engine",
  "test-joint-genesis-faq-regression",
  "test-adaptive-plan",
  "test-lp-quality-gate",
  "test-showcase-integration",
  "test-neuroprime-premium-draft",
  "test-premium-v1-no-image",
  "test-product-showcase",
  "test-lp-premium-v2",
];

const tests = TESTS.map((name) => {
  const result = run("npx", ["tsx", `scripts/${name}.ts`]);
  return { name, exit: result.exit, okAssertions: result.ok, status: result.exit === 0 ? "PASS" : "FAIL" };
});
const tsc = run("npx", ["tsc", "--noEmit", "--incremental", "false"]);
write("test-results.json", {
  ranAt: new Date().toISOString(),
  tests,
  typescript: { command: "tsc --noEmit --incremental false", exit: tsc.exit, status: tsc.exit === 0 ? "PASS" : "FAIL" },
  lint: "NOT_AVAILABLE (the project has no lint script)",
  lighthouse: "NOT_RUN (not requested)",
  allPass: tests.every((item) => item.exit === 0) && tsc.exit === 0,
});

type Probe = {
  label: string;
  viewport: { width: number };
  horizontalOverflow: boolean;
  clippedText: string[];
  smallTapTargets: string[];
  brokenImages: string[];
  h1: { fontSizePx: number; contrast: number | null } | null;
  lead: { text: string; role: string | null } | null;
  cta: { text: string; placeholder: boolean; href: string | null; height: number; insideFirstViewport: boolean } | null;
  disclosure: { top: number; contrast: number | null } | null;
  pageHeight: number;
  headings: string[];
  heroAfterH1: Array<{ role: string | null; text: string }>;
};

const before = JSON.parse(readFileSync(path.join(ROOT, "before", "probe.json"), "utf8")).results as Probe[];
const after = JSON.parse(readFileSync(path.join(ROOT, "after", "probe.json"), "utf8")).results as Probe[];
const NAMES: Record<number, string> = { 1440: "desktop", 768: "tablet", 390: "mobile" };
const devOverlay = /left-ds-16/;
const tapIssues = (item: Probe | undefined) => (item?.smallTapTargets ?? []).filter((entry) => !devOverlay.test(entry));

const comparison = after.map((current) => {
  const previous = before.find((item) => item.label === current.label && item.viewport.width === current.viewport.width);
  return {
    label: current.label,
    viewport: NAMES[current.viewport.width],
    before: previous
      ? {
          leadText: previous.lead?.text ?? null,
          cta: previous.cta ? { text: previous.cta.text, placeholder: previous.cta.placeholder } : null,
          h1FontPx: previous.h1?.fontSizePx ?? null,
          overflow: previous.horizontalOverflow,
          pageHeight: previous.pageHeight,
        }
      : "NO_V1_BASELINE (fixture added in Execution 45)",
    after: {
      leadText: current.lead?.text ?? null,
      leadRole: current.lead?.role ?? null,
      cta: current.cta ? { text: current.cta.text, placeholder: current.cta.placeholder, href: current.cta.href, insideFirstViewport: current.cta.insideFirstViewport } : null,
      h1FontPx: current.h1?.fontSizePx ?? null,
      overflow: current.horizontalOverflow,
      pageHeight: current.pageHeight,
    },
  };
});
write("before-after-comparison.json", {
  note: "Before = V1 renderer. After = Premium V2 renderer. Same routes, same data, no campaign changed.",
  reference190: comparison.filter((item) => item.label === "campaign-190" && item.viewport === "desktop"),
  rows: comparison,
});

const labels = [...new Set(after.map((item) => item.label))];
write("visual-validation-report.json", {
  generatedAt: new Date().toISOString(),
  browser: "Microsoft Edge (installed), Playwright, headless",
  viewports: ["desktop 1440x900", "tablet 768x1024", "mobile 390x844"],
  targets: labels,
  localUrl: "http://127.0.0.1:3000/visual-frame/neuroprime",
  checks: {
    rendersInBrowser: after.every((item) => item.headings.length > 0),
    horizontalOverflow: after.filter((item) => item.horizontalOverflow).map((item) => `${item.label}@${item.viewport.width}`),
    clippedText: after.filter((item) => item.clippedText.length > 0).map((item) => `${item.label}@${item.viewport.width}`),
    brokenImages: after.filter((item) => item.brokenImages.length > 0).map((item) => `${item.label}@${item.viewport.width}`),
    smallTapTargetsExcludingNextDevOverlay: after.filter((item) => tapIssues(item).length > 0).map((item) => `${item.label}@${item.viewport.width}`),
    ctaInFirstViewport: after.every((item) => item.cta?.insideFirstViewport === true),
    minH1Contrast: Math.min(...after.map((item) => item.h1?.contrast ?? 0)),
    minDisclosureContrast: Math.min(...after.map((item) => item.disclosure?.contrast ?? 0)),
    leadsAreTaggedAsLead: after.every((item) => item.lead === null || item.lead.role === "lead"),
  },
  heroOrder190Desktop: after.find((item) => item.label === "campaign-190" && item.viewport.width === 1440)?.heroAfterH1 ?? [],
  v1Reference190Desktop: before.find((item) => item.label === "campaign-190" && item.viewport.width === 1440)?.lead ?? null,
  ctaStates: Object.fromEntries(labels.map((label) => {
    const item = after.find((entry) => entry.label === label && entry.viewport.width === 1440);
    return [label, item?.cta ? (item.cta.placeholder ? "PREVIEW_DISABLED_PLACEHOLDER" : `AUTHORIZED_LINK ${item.cta.href}`) : "NONE"];
  })),
  devOverlayNote: "The only target under 44px in the probe is a Next.js dev overlay skip link (a.absolute.left-ds-16, 145x38). It does not exist in a production build and is not part of the page.",
  lighthouse: "NOT_RUN",
});

write("changed-files.json", {
  modified: [
    "src/lib/product-showcase/editorial.ts (roles, provenance and fulfillment blocks, editorialLead)",
    "src/components/product-showcase/product-showcase-premium-v1.tsx (AdaptivePremium rebuilt as Premium V2; ctaPreview prop)",
    "src/components/presell/showcase-landing.tsx (ctaPreview={disableAffiliateNavigation})",
    "src/app/admin/lab/product-showcase/[slug]/page.tsx (ctaPreview in the lab preview)",
    "src/app/admin/lab/homologation/[case]/page.tsx (ctaPreview in the lab fixture)",
    "src/lib/product-showcase/homologation-fixtures.ts (synthetic fixtures: operational, described)",
    "scripts/test-editorial-engine.ts (manufacturer now asserted in provenance, never in the introduction)",
  ],
  created: [
    "src/app/product-showcase-v2.css",
    "scripts/test-lp-premium-v2.ts",
    "scripts/capture-lp-premium-v2.ts",
    "scripts/build-lp-premium-v2-evidence.ts",
    "data/evidence/lp-premium-v2/ (before, wip-1..wip-4, after, JSON reports)",
  ],
  notChanged: ["campaign data", "publication status", "persisted presentation templates", "quality-gate.ts", "adaptive-plan.ts", "editorial-intelligence.ts", "product-showcase.css (legacy rules)"],
});

write("known-problems.json", {
  problems: [
    { id: "KP1", severity: "LIMITATION", text: "Campaign 190 has no authorized CTA destination (no affiliate URL and no label). The CTA is a disabled preview placeholder and no link was invented." },
    { id: "KP2", severity: "LIMITATION", text: "Campaign 190 has no approved packshot, so the hero is editorial with an 'At a glance' panel instead of an image." },
    { id: "KP3", severity: "LIMITATION", text: "The real affiliate href is validated only on the authorized CTAs (183 and fixture-capsule). 190, 186, 188 and 189 have none." },
    { id: "KP4", severity: "BY_DESIGN", text: "No FAQ is rendered. No campaign or ProductFacts carries grounded Q&A, and research must never be a source for answers." },
    { id: "KP5", severity: "BY_DESIGN", text: "One CTA per page. The existing quality gate pins exactly one a.psp-cta, so there is no secondary CTA. The CTA moved from the header to the hero." },
    { id: "KP6", severity: "ENGINE", text: "Descriptions or features longer than 90 characters are never promoted to the lead (pre-existing filter in editorial.ts). Such pages open neutrally." },
    { id: "KP7", severity: "ENGINE", text: "The proposition is currently the description or the first short feature. A richer proposition source is outside this execution." },
    { id: "KP8", severity: "EVIDENCE", text: "fixture-operational and fixture-described have no V1 baseline because they were added in this execution." },
    { id: "KP9", severity: "EVIDENCE", text: "The probe field 'viewport' holds the measured browser size object, not the viewport name. Consumers must use viewport.width." },
    { id: "KP10", severity: "ENVIRONMENT", text: "Lighthouse was not run (not requested). The three historical Lighthouse reports remain missing. The project has no lint script." },
    { id: "KP11", severity: "ENVIRONMENT", text: "tsconfig.tsbuildinfo remains deleted in git from earlier work. The dev server remains running." },
    { id: "KP12", severity: "VISUAL", text: "When there is no 'Important information' block, the review note stands alone and its h3 uses the h2-sized style. Acceptable, but could be tuned." },
  ],
});

const end = freeBytes();
write("disk.json", {
  freeBytesAtStart: START_FREE_BYTES,
  freeBytesAtEnd: end,
  freeGbAtStart: Math.round((START_FREE_BYTES / 1024 ** 3) * 100) / 100,
  freeGbAtEnd: Math.round((end / 1024 ** 3) * 100) / 100,
  guardGb: 5,
});

console.log(JSON.stringify({ tests, tsc: tsc.exit, freeGb: Math.round((end / 1024 ** 3) * 100) / 100 }, null, 2));
