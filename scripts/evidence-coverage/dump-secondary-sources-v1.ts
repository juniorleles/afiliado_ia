/**
 * Inspects first-party secondary pages linked from an already resolved source page.
 *
 * Same-origin only, robots checked once per host, no bypass, no third-party fetches.
 * Read-only: writes a block dump per page for the coverage audit.
 *
 * npx tsx scripts/evidence-coverage/dump-secondary-sources-v1.ts
 *   env: EVIDENCE_SOURCE_URL, EVIDENCE_OUT_DIR
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkRobotsRules } from "../../src/lib/import-product.ts";
import { assertSafeOutboundUrl } from "../../src/lib/fetch-guard.ts";

const sourceUrl = process.env.EVIDENCE_SOURCE_URL;
const outDir = process.env.EVIDENCE_OUT_DIR;
if (!sourceUrl || !outDir) throw new Error("EVIDENCE_SOURCE_URL and EVIDENCE_OUT_DIR are required");

const USER_AGENT = "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)";

const decode = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

const strip = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

const clean = (html: string) => decode(strip(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();

async function main() {
  const origin = new URL(sourceUrl!).origin;
  const robotsResponse = await fetch(`${origin}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
  const robotsText = robotsResponse.ok ? await robotsResponse.text() : "";

  const html = readFileSync(path.join(outDir!, "source-raw.html"), "utf8");
  const sameOrigin = new Set<string>();
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    let href = match[1].trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) continue;
    try {
      const resolved = new URL(href, sourceUrl!);
      if (resolved.origin !== origin) continue;
      resolved.hash = "";
      href = resolved.toString().replace(/\?$/, "");
      if (href === sourceUrl) continue;
      sameOrigin.add(href);
    } catch {
      continue;
    }
  }

  const pages: Array<Record<string, unknown>> = [];
  for (const href of [...sameOrigin].sort()) {
    const target = new URL(href);
    const allowed = robotsText ? checkRobotsRules(robotsText, target.pathname) : true;
    if (!allowed) {
      pages.push({ url: href, robotsAllowed: false, skipped: "ROBOTS_DISALLOWED" });
      console.log(`SKIP ${href} ROBOTS_DISALLOWED`);
      continue;
    }
    try {
      assertSafeOutboundUrl(href);
      const response = await fetch(href, { headers: { "user-agent": USER_AGENT } });
      const body = await response.text();
      const text = clean(body);
      const headings = [...body.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => clean(m[2])).filter(Boolean);
      const paragraphs = [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1])).filter(Boolean);
      const tableCells = [...body.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => clean(m[1])).filter(Boolean);
      pages.push({
        url: href,
        robotsAllowed: true,
        httpStatus: response.status,
        textLength: text.length,
        headings,
        paragraphs,
        tableCells,
        plainText: text.slice(0, 12_000),
      });
      console.log(`OK ${href} status=${response.status} chars=${text.length} p=${paragraphs.length} cells=${tableCells.length}`);
    } catch (error) {
      pages.push({ url: href, robotsAllowed: true, error: error instanceof Error ? error.message : "fetch failed" });
      console.log(`ERR ${href}`);
    }
  }

  mkdirSync(outDir!, { recursive: true });
  writeFileSync(path.join(outDir!, "secondary-sources.json"), `${JSON.stringify({ origin, pages }, null, 2)}\n`, "utf8");
  console.log(`SECONDARY_PAGES=${pages.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "secondary dump failed");
  process.exit(1);
});
