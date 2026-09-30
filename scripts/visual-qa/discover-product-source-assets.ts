import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverSourceAssets } from "../../src/lib/assets/discover.ts";
import { probeRemoteImage } from "../../src/lib/assets/probe.ts";
import { getCampaignBySlug, listCampaigns } from "../../src/lib/campaigns.ts";
import { assertSafeOutboundUrl } from "../../src/lib/fetch-guard.ts";
import { checkRobotsRules } from "../../src/lib/import-product.ts";
import { fetchWithTimeout } from "../../src/lib/source-resolution/http.ts";
import { PRIMARY_SOURCE_TIMEOUT_MS, ROBOTS_CHECK_TIMEOUT_MS } from "../../src/lib/source-resolution/timeouts.ts";

const UA = "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)";
const OUT = path.join("data", "visual-design", "joint-genesis-controlled-ready-13", "product-asset-audit-v1", "candidates");

function hostPath(raw: string): string {
  const url = new URL(raw);
  return `${url.host}${url.pathname}`;
}

async function main() {
  const campaign = getCampaignBySlug("joint-genesis-controlled-ready-13");
  if (!campaign?.sourceFactsJson) {
    console.log("SOURCE_URL=MISSING");
    return;
  }
  const facts = JSON.parse(campaign.sourceFactsJson) as { sourceUrl?: string };
  const sourceUrl = facts.sourceUrl || "";
  if (!sourceUrl) {
    console.log("SOURCE_URL=MISSING");
    return;
  }
  assertSafeOutboundUrl(sourceUrl);
  console.log(`SOURCE_HOST_PATH=${hostPath(sourceUrl)}`);
  for (const item of listCampaigns()) {
    if (!item.productImageSrc) continue;
    console.log(`STORED_LINK slug=${item.slug} src=${item.productImageSrc}`);
  }

  const robotsUrl = new URL("/robots.txt", sourceUrl).href;
  const robots = await fetchWithTimeout(fetch, robotsUrl, { headers: { "user-agent": UA } }, ROBOTS_CHECK_TIMEOUT_MS);
  const robotsText = robots.ok ? await robots.text() : "";
  const allowed = !robots.ok || checkRobotsRules(robotsText, new URL(sourceUrl).pathname);
  console.log(`ROBOTS_STATUS=${robots.status}`);
  console.log(`ROBOTS_ALLOWED=${allowed ? "YES" : "NO"}`);
  if (!allowed) {
    console.log("LIVE_SOURCE_REQUEST_PERFORMED=NO");
    console.log("SOURCE_ACCESS_BLOCKED=ROBOTS");
    return;
  }

  const page = await fetchWithTimeout(
    fetch,
    sourceUrl,
    { headers: { "user-agent": UA }, cache: "no-store" },
    PRIMARY_SOURCE_TIMEOUT_MS,
  );
  console.log(`PAGE_STATUS=${page.status}`);
  console.log(`PAGE_FINAL_HOST_PATH=${hostPath(page.url || sourceUrl)}`);
  if (page.status === 403 || page.status === 401) {
    console.log("SOURCE_ACCESS_BLOCKED=HTTP_" + page.status);
    return;
  }
  if (!page.ok) {
    console.log("SOURCE_ACCESS_BLOCKED=HTTP_" + page.status);
    return;
  }
  const html = await page.text();
  const discovered = discoverSourceAssets(html, page.url || sourceUrl);
  const unique = new Map<string, (typeof discovered)[number]>();
  for (const item of discovered) {
    if (item.rejectReason === "tracking-pixel") continue;
    if (!unique.has(item.url)) unique.set(item.url, item);
  }
  console.log(`DISCOVERED_URLS=${unique.size}`);
  const ranked = [...unique.values()]
    .filter((item) => item.source === "og" || item.source === "twitter" || item.source === "jsonld" || !item.rejected)
    .slice(0, 12);
  mkdirSync(OUT, { recursive: true });
  const saved: Array<Record<string, string | number | boolean>> = [];
  for (const item of ranked) {
    const remote = await probeRemoteImage(item.url);
    if (!remote) {
      console.log(`DOWNLOAD_FAILED role=${item.role} source=${item.source}`);
      continue;
    }
    const hash = createHash("sha256").update(remote.buffer).digest("hex");
    const ext = remote.mime.includes("png") ? "png" : remote.mime.includes("webp") ? "webp" : remote.mime.includes("gif") ? "gif" : "jpg";
    const filename = `${hash}.${ext}`;
    writeFileSync(path.join(OUT, filename), remote.buffer);
    saved.push({
      candidateId: hash.slice(0, 16),
      contentHash: hash,
      filename,
      sourceUrl: item.url,
      finalUrl: remote.finalUrl,
      discoveredFrom: item.source,
      roleHint: item.role,
      alt: item.alt.slice(0, 160),
      mimeType: remote.mime,
      width: remote.width,
      height: remote.height,
      bytes: remote.bytes,
    });
    console.log(`SAVED=${filename} ${remote.width}x${remote.height} role=${item.role} source=${item.source}`);
  }
  writeFileSync(path.join(OUT, "..", "downloads.json"), JSON.stringify({ sourceHostPath: hostPath(page.url || sourceUrl), saved }, null, 2));
  console.log(`DOWNLOADED=${saved.length}`);
  console.log("LIVE_SOURCE_REQUEST_PERFORMED=YES");
  console.log("ANTI_BOT_BYPASS_USED=NO");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "discovery failed";
  console.error(message.replace(/https?:\/\/\S+/g, "[url]"));
  process.exit(1);
});
