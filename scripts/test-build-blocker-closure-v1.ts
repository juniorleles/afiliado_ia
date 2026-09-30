// npx tsx scripts/test-build-blocker-closure-v1.ts
// Server/client boundary: shared presell renderer and client roots must not reach filesystem code.
import fs from "node:fs";
import path from "node:path";
import { resolvePresellRenderAssets } from "../src/lib/presell-render-assets-server.ts";
import { NO_PRESELL_RENDER_ASSETS } from "../src/lib/presell-render-assets.ts";
import { PRODUCTION_PRESENTATION_ID } from "../src/lib/production-candidate-view.ts";
import type { Campaign } from "../src/lib/campaigns.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error("FALHOU: " + msg);
  console.log("OK: " + msg);
}

const root = process.cwd();
const SERVER_ONLY_SPECIFIER = /^(node:.+|fs|fs\/promises|path|child_process|os|better-sqlite3|next\/headers|server-only)$/;
const SERVER_ONLY_MODULES = new Set(["src/lib/presell-render-assets-server.ts", "src/lib/db.ts"]);

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Value imports/re-exports only; `import type` / `export type` are erased at compile time. */
function valueSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(type\s+)?(?:([^"';]*?)\s+from\s+)?["']([^"']+)["']/gm;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m[2]) continue;
    if (m[1] === "export" && !m[3]) continue;
    out.push(m[4]);
  }
  return out;
}

function resolveLocal(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function clientGraph(entry: string) {
  const seen = new Set<string>();
  const parent = new Map<string, string>();
  const violations: string[] = [];
  const toRel = (file: string) => path.relative(root, file).replace(/\\/g, "/");
  const chain = (file: string) => {
    const out = [toRel(file)];
    for (let p = parent.get(file); p; p = parent.get(p)) out.unshift(toRel(p));
    return out.join(" → ");
  };
  const stack = [path.join(root, entry)];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const rel = toRel(file);
    if (SERVER_ONLY_MODULES.has(rel)) violations.push(`${chain(file)} (server-only module)`);
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const source = stripComments(fs.readFileSync(file, "utf8"));
    // Server Action modules reach the client bundle as RPC references, not as code.
    if (/^\s*["']use server["']/.test(source)) continue;
    for (const spec of valueSpecifiers(source)) {
      if (SERVER_ONLY_SPECIFIER.test(spec)) {
        violations.push(`${rel} imports ${spec}`);
        continue;
      }
      const local = resolveLocal(file, spec);
      if (local && !/\.css$/.test(local)) {
        if (!parent.has(local) && !seen.has(local)) parent.set(local, file);
        stack.push(local);
      }
    }
  }
  return { modules: seen.size, violations };
}

for (const entry of ["src/app/admin/generate/generate-client.tsx", "src/components/campaign-template.tsx"]) {
  const graph = clientGraph(entry);
  assert(graph.modules > 10, `${entry}: import graph walked (${graph.modules} modules)`);
  assert(graph.violations.length === 0, `${entry}: no server-only imports reachable ${JSON.stringify(graph.violations)}`);
}

const pageView = fs.readFileSync("src/components/presell/presell-page-view.tsx", "utf8");
assert(!pageView.includes("asset-integration") && !pageView.includes("product-visual/load"), "shared renderer does not import disk resolvers");
assert(pageView.includes("renderAssets.visualAssets") && pageView.includes("renderAssets.productVisuals"), "shared renderer consumes resolved asset data");

const serverCallers = [
  "src/app/p/[slug]/page.tsx",
  "src/components/presell/preview-frame.tsx",
  "src/app/visual-frame/[slug]/page.tsx",
  "src/app/visual-frame-lab/[slug]/page.tsx",
  "src/app/visual-frame/validation/[candidateId]/page.tsx",
  "src/app/preview/[slug]/[candidate]/page.tsx",
];
for (const file of serverCallers) {
  const src = fs.readFileSync(file, "utf8");
  assert(!/^\s*["']use client["']/.test(src), `${file} is a server module`);
  assert(src.includes("renderAssets={resolvePresellRenderAssets("), `${file} passes server-resolved assets`);
}

function fixture(overrides: Partial<Campaign>): Campaign {
  return {
    id: 1,
    name: "Fixture",
    slug: "fictional-kettle-review",
    headline: "Fictional Kettle",
    body: "A kettle.",
    ctaLabel: "Learn More",
    affiliateUrl: "https://example.com/hop",
    headScript: null,
    adHeadline: null,
    publicationStatus: "draft",
    publishedAt: null,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

assert(resolvePresellRenderAssets(fixture({})) === NO_PRESELL_RENDER_ASSETS, "non-production presentation resolves no disk assets");
const unknown = resolvePresellRenderAssets(fixture({ productionPresentation: PRODUCTION_PRESENTATION_ID }));
assert(
  Object.keys(unknown.visualAssets).length === 0 && Object.keys(unknown.productVisuals).length === 0,
  "production presentation without persisted visuals stays unbound",
);
const traversal = resolvePresellRenderAssets(fixture({ slug: "../fictional", productionPresentation: PRODUCTION_PRESENTATION_ID }));
assert(Object.keys(traversal.visualAssets).length === 0 && Object.keys(traversal.productVisuals).length === 0, "path-like slug binds nothing");

console.log("\nBuild blocker closure V1: server/client boundary tests passed.");
