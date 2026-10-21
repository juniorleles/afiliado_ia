/**
 * Execution 46 - builds the evidence package in data/evidence/lp-premium-v3/.
 * Runs the regression tests and tsc, then compares the V2 baseline probe with the V3 probe.
 * Refuses to overwrite earlier files. Does not publish, deploy or commit.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(process.cwd(), "data", "evidence");
const ROOT = path.join(EVIDENCE, "lp-premium-v3");
const V2_AFTER = path.join(EVIDENCE, "lp-premium-v2", "after", "probe.json");
const START_FREE_BYTES = 12_449_128_448; // measured at the start of Execution 46

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
  "test-lp-premium-v3",
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
  fullSuite: "see full-test-run.txt (npm test, every scripts/test-*.ts)",
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
  images: number;
};

const v2 = JSON.parse(readFileSync(V2_AFTER, "utf8")).results as Probe[];
const v3 = JSON.parse(readFileSync(path.join(ROOT, "after", "probe.json"), "utf8")).results as Probe[];
const NAMES: Record<number, string> = { 1440: "desktop", 768: "tablet", 390: "mobile" };
const devOverlay = /left-ds-16/;
const tapIssues = (item: Probe | undefined) => (item?.smallTapTargets ?? []).filter((entry) => !devOverlay.test(entry));

const rows = v3.map((current) => {
  const previous = v2.find((item) => item.label === current.label && item.viewport.width === current.viewport.width);
  return {
    label: current.label,
    viewport: NAMES[current.viewport.width],
    v2: previous
      ? { h1FontPx: previous.h1?.fontSizePx ?? null, pageHeight: previous.pageHeight, overflow: previous.horizontalOverflow, h2Count: previous.headings.length }
      : "NO_V2_BASELINE",
    v3: { h1FontPx: current.h1?.fontSizePx ?? null, pageHeight: current.pageHeight, overflow: current.horizontalOverflow, h2Count: current.headings.length, images: current.images },
    screenshots: {
      v2: `../lp-premium-v2/after/${current.label}-${NAMES[current.viewport.width]}.png`,
      v3: `after/${current.label}-${NAMES[current.viewport.width]}.png`,
    },
  };
});
write("v2-vs-v3-comparison.json", {
  note: "V2 = lp-premium-v2/after (Execution 45). V3 = lp-premium-v3/after. Same routes, same data. No campaign changed. Visual approval is human.",
  rows,
});

const labels = [...new Set(v3.map((item) => item.label))];
write("visual-quality-report.json", {
  generatedAt: new Date().toISOString(),
  browser: "Microsoft Edge (installed), Playwright, headless",
  viewports: ["desktop 1440x900", "tablet 768x1024", "mobile 390x844"],
  targets: labels,
  localUrl: "http://127.0.0.1:3000/visual-frame/neuroprime",
  automatedChecks: {
    allV3: v3.every((item) => item.headings.length > 0),
    horizontalOverflow: v3.filter((item) => item.horizontalOverflow).map((item) => `${item.label}@${item.viewport.width}`),
    clippedText: v3.filter((item) => item.clippedText.length > 0).map((item) => `${item.label}@${item.viewport.width}`),
    brokenImages: v3.filter((item) => item.brokenImages.length > 0).map((item) => `${item.label}@${item.viewport.width}`),
    smallTapTargetsExcludingNextDevOverlay: v3.filter((item) => tapIssues(item).length > 0).map((item) => `${item.label}@${item.viewport.width}`),
    ctaInFirstViewport: v3.every((item) => item.cta?.insideFirstViewport === true),
    minH1Contrast: Math.min(...v3.map((item) => item.h1?.contrast ?? 0)),
    minDisclosureContrast: Math.min(...v3.map((item) => item.disclosure?.contrast ?? 0)),
  },
  ctaStates: Object.fromEntries(labels.map((label) => {
    const item = v3.find((entry) => entry.label === label && entry.viewport.width === 1440);
    return [label, item?.cta ? (item.cta.placeholder ? "PREVIEW_DISABLED_PLACEHOLDER" : `AUTHORIZED_LINK ${item.cta.href}`) : "NONE"];
  })),
  humanReviewReminder: "Passing automated probes is not visual approval. A person must review the screenshots in after/.",
  devOverlayNote: "The only target under 44px in the probe is a Next.js dev overlay skip link (a.absolute.left-ds-16). It is not part of the page.",
  lighthouse: "NOT_RUN",
});

write("changed-files.json", {
  created: [
    "src/components/product-showcase/product-showcase-premium-v3.tsx",
    "src/app/product-showcase-v3.css",
    "src/lib/product-showcase/presentation-order.ts",
    "scripts/test-lp-premium-v3.ts",
    "scripts/build-lp-premium-v3-evidence.ts",
    "data/evidence/lp-premium-v3/ (wip-3..wip-5, after, JSON reports, full-test-run.txt)",
  ],
  modified: [
    "src/components/product-showcase/product-showcase-premium-v1.tsx (dispatch to PremiumV3; AdaptivePremium removed)",
    "src/lib/product-showcase/model.ts (presentation guidance field)",
    "src/lib/product-showcase/adapt.ts (strategyApproach option -> presentation guidance)",
    "src/lib/product-showcase/adapt-campaign.ts (reads the stored strategy approach id)",
    "scripts/capture-lp-premium-v2.ts (EVIDENCE_DIR, refuses build-error pages)",
  ],
  removed: [
    "scripts/test-lp-premium-v2.ts (V2-specific, superseded by test-lp-premium-v3.ts)",
  ],
  notChanged: ["campaign data", "affiliate links", "publication status", "persisted presentation templates", "quality-gate.ts", "adaptive-plan.ts", "editorial.ts", "product-showcase.css (legacy rules)"],
});

write("known-problems.json", {
  fixed: [
    { id: "F1", text: "V2 read as a technical sheet. V3 has a dark hero band, a graphic panel or approved image stage, a fact rail, offer cards, a guarantee band and icon-led order details." },
    { id: "F2", text: "Long returns policy text was squeezed into a narrow column at tablet width. It now sits in a full-width row under the guarantee headline." },
    { id: "F3", text: "A missing unit price rendered an em dash in the offer card. The row is now omitted." },
    { id: "F4", text: "The capture script recorded Next.js build-error pages as screenshots. It now refuses them." },
  ],
  pending: [
    { id: "KP1", severity: "LIMITATION", text: "Campaign 190 has no authorized CTA destination and no approved packshot. Preview shows a disabled placeholder and a typographic panel; nothing is invented." },
    { id: "KP2", severity: "LIMITATION", text: "Real affiliate hrefs are only exercised on 183 and fixture-capsule. 186, 188, 189 and 190 have none." },
    { id: "KP3", severity: "BY_DESIGN", text: "No FAQ, testimonial, rating, urgency, counter or discount is rendered. No source carries them." },
    { id: "KP4", severity: "SCOPE", text: "Strategy integration is limited to a deterministic section order by approach id (BUYER_GUIDE and COMPARISON put offers before usage). No strategy or research text reaches the page. Broader integration (market context shaping hierarchy, section emphasis) is deferred to a later execution." },
    { id: "KP5", severity: "SCOPE", text: "Only the existing proven fact types are laid out. No manufacturer logo, package image or certification badge exists or was invented." },
    { id: "KP6", severity: "ENVIRONMENT", text: "src/app/product-showcase-v2.css is an empty temporary stub. The running dev server cached an import of the deleted V2 stylesheet and returns 500 without it. Delete it after the dev server is restarted with npm run dev." },
    { id: "KP7", severity: "ENVIRONMENT", text: "Lighthouse was not run (not requested). The project has no lint script." },
    { id: "KP8", severity: "VISUAL", text: "Pages with a very long returns policy (campaign 183) are text-heavy in the guarantee band. The text is the seller policy restated verbatim and was not shortened." },
    { id: "KP9", severity: "HUMAN", text: "Final visual approval depends on human review of the screenshots." },
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
