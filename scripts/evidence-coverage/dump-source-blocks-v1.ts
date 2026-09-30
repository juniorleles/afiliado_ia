/**
 * Read-only source inspection for the evidence coverage audit.
 *
 * Fetches one already resolved source URL through the same robots check and
 * fetch guard the importer uses, then dumps the block structure the extractor
 * sees: heading sections with their classified kind, lists, paragraphs, bold
 * phrases and detail/summary pairs. Nothing is written to any campaign.
 *
 * npx tsx scripts/evidence-coverage/dump-source-blocks-v1.ts --url=<url> --out=<dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { checkRobotsRules } from "../../src/lib/import-product.ts";
import { assertSafeOutboundUrl } from "../../src/lib/fetch-guard.ts";

const url = process.argv.find((item) => item.startsWith("--url="))?.slice(6) ?? process.env.EVIDENCE_SOURCE_URL;
const outDir = process.argv.find((item) => item.startsWith("--out="))?.slice(6) ?? process.env.EVIDENCE_OUT_DIR;
if (!url || !outDir) throw new Error("--url and --out are required");

const USER_AGENT = "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)";

const decodeHtmlEntities = (text: string) =>
  text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

const clean = (html: string) => decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();

async function main() {
  assertSafeOutboundUrl(url!);
  const target = new URL(url!);
  const robots = await fetch(`${target.protocol}//${target.host}/robots.txt`, { headers: { "user-agent": USER_AGENT } });
  const robotsText = robots.ok ? await robots.text() : "";
  const allowed = robotsText ? checkRobotsRules(robotsText, target.pathname) : true;
  console.log(`ROBOTS_ALLOWED=${allowed ? "YES" : "NO"}`);
  if (!allowed) throw new Error("robots.txt disallows this path");

  const response = await fetch(url!, { headers: { "user-agent": USER_AGENT } });
  const html = await response.text();
  console.log(`HTTP_STATUS=${response.status} BYTES=${html.length}`);

  mkdirSync(outDir!, { recursive: true });
  writeFileSync(path.join(outDir!, "source-raw.html"), html, "utf8");

  const headings: Array<{ level: string; text: string }> = [];
  for (const match of html.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = clean(match[2]);
    if (text) headings.push({ level: `h${match[1]}`, text });
  }
  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => clean(m[1])).filter(Boolean);
  const listItems = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => clean(m[1])).filter(Boolean);
  const bold = [...html.matchAll(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi)].map((m) => clean(m[1])).filter(Boolean);
  const details = [...html.matchAll(/<details[\s\S]*?<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/gi)].map((m) => ({
    question: clean(m[1]),
    answer: clean(m[2]),
  }));
  const links = [...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: m[1],
    text: clean(m[2]),
  }));
  const plain = clean(html);

  const dump = {
    url,
    httpStatus: response.status,
    robotsAllowed: allowed,
    counts: {
      headings: headings.length,
      paragraphs: paragraphs.length,
      listItems: listItems.length,
      bold: bold.length,
      details: details.length,
      links: links.length,
      plainTextLength: plain.length,
    },
    headings,
    paragraphs,
    listItems,
    bold,
    details,
    links,
    plainText: plain,
  };
  writeFileSync(path.join(outDir!, "source-blocks.json"), `${JSON.stringify(dump, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(dump.counts, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "dump failed");
  process.exit(1);
});
