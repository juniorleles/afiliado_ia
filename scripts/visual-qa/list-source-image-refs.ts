import { discoverSourceAssets } from "../../src/lib/assets/discover.ts";
import { getCampaignBySlug } from "../../src/lib/campaigns.ts";
import { checkRobotsRules } from "../../src/lib/import-product.ts";
import { fetchWithTimeout } from "../../src/lib/source-resolution/http.ts";
import { PRIMARY_SOURCE_TIMEOUT_MS, ROBOTS_CHECK_TIMEOUT_MS } from "../../src/lib/source-resolution/timeouts.ts";

const UA = "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)";

async function main() {
  const campaign = getCampaignBySlug("joint-genesis-controlled-ready-13");
  const facts = JSON.parse(campaign?.sourceFactsJson || "{}") as { sourceUrl?: string };
  const sourceUrl = facts.sourceUrl || "";
  const robots = await fetchWithTimeout(fetch, new URL("/robots.txt", sourceUrl).href, { headers: { "user-agent": UA } }, ROBOTS_CHECK_TIMEOUT_MS);
  const allowed = !robots.ok || checkRobotsRules(robots.ok ? await robots.text() : "", new URL(sourceUrl).pathname);
  if (!allowed) {
    console.log("ROBOTS_ALLOWED=NO");
    return;
  }
  const page = await fetchWithTimeout(fetch, sourceUrl, { headers: { "user-agent": UA }, cache: "no-store" }, PRIMARY_SOURCE_TIMEOUT_MS);
  console.log(`PAGE_STATUS=${page.status}`);
  if (!page.ok) return;
  const html = await page.text();
  const seen = new Set<string>();
  for (const item of discoverSourceAssets(html, page.url || sourceUrl)) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    const path = new URL(item.url).pathname;
    console.log(`${item.rejected ? "REJECTED" : "OPEN"} ${item.source} ${item.role} ${item.width}x${item.height} ${path} alt=${item.alt.slice(0, 80)}`);
  }
  console.log(`UNIQUE=${seen.size}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[url]") : "list failed");
  process.exit(1);
});
