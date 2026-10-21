/**
 * Execution 47A - read-only product asset audit for one campaign.
 *
 * Usage: npx tsx scripts/audit-product-assets.ts <campaignId> [--out <dir-name>]
 *
 * Reads the local database, makes a handful of bounded HTTPS GET requests to the
 * product's own pages and to the candidate image files, and writes JSON evidence.
 * It never writes to the database, never stores an image as an asset, never fetches
 * tracking or affiliate redirect links, and refuses to overwrite earlier evidence.
 */
import { existsSync, mkdirSync, readdirSync, statfsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCampaignById } from "../src/lib/campaigns.ts";
import { discoverSourceAssets } from "../src/lib/assets/discover.ts";
import { extractOfficialPromoImages, officialToolsPageAllowed } from "../src/lib/official-assets/extract.ts";
import { evaluateCandidates, normalizedAssetUrl } from "../src/lib/product-assets/evaluate.ts";
import { hostMatches } from "../src/lib/product-assets/match.ts";
import { resolveCampaignProductAssets } from "../src/lib/product-assets/campaign.ts";
import { fetchAndMeasure, type FetchLike } from "../src/lib/product-assets/technical.ts";
import type { AssetKind, MeasuredImage, ProductAssetCandidate } from "../src/lib/product-assets/types.ts";

const MIN_FREE = 5 * 1024 ** 3;
const MAX_IMAGE_FETCHES = 8;
const MAX_PAGE_BYTES = 3_000_000;
const TRACKING_HOST = /(?:qltrk|clickbank|hop\.|go\.|track|redirect|affpineal|nutraorganics)/i;

function freeBytes(): number {
  const stats = statfsSync(process.cwd());
  return Number(stats.bavail) * Number(stats.bsize);
}

const args = process.argv.slice(2);
const campaignId = Number(args[0]);
const outFlag = args.indexOf("--out");
const OUT = path.join(process.cwd(), "data", "evidence", outFlag >= 0 ? args[outFlag + 1] : "product-assets-intelligence");

function write(name: string, value: unknown) {
  mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, name);
  if (existsSync(file)) throw new Error(`REFUSING_TO_OVERWRITE ${name}`);
  writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

const realFetch: FetchLike = (url, init) => fetch(url, init) as ReturnType<FetchLike>;

async function getPage(url: string): Promise<{ url: string; status: number | null; html: string | null; error: string | null }> {
  if (!officialToolsPageAllowed(url)) return { url, status: null, html: null, error: "NOT_ALLOWED (not an HTTPS page of the product)" };
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "AfiliadoIA-AssetAudit/1.0 (+internal read-only check)", accept: "text/html" },
    });
    const text = await response.text();
    if (text.length > MAX_PAGE_BYTES) return { url, status: response.status, html: null, error: "PAGE_TOO_LARGE" };
    return { url, status: response.status, html: text, error: null };
  } catch (error) {
    return { url, status: null, html: null, error: error instanceof Error ? `${error.name}: ${error.message}` : "ERROR" };
  }
}

function assetSentences(html: string): string[] {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b(image|images|banner|banners|logo|creative|creatives|photo|asset|assets|trademark|copyright|permission|licen[cs]e)\b/i.test(sentence))
    .map((sentence) => sentence.trim().slice(0, 240))
    .slice(0, 10);
}

function kindFromRole(role: string): AssetKind {
  if (role === "PRODUCT_PACKSHOT") return "PACKSHOT";
  if (role === "PRODUCT_LIFESTYLE") return "CONTEXTUAL";
  if (role === "BRAND_LOGO") return "BRAND_LOGO";
  return "OTHER";
}

async function main() {
  if (!Number.isInteger(campaignId)) throw new Error("campaign id is required");
  if (freeBytes() < MIN_FREE) throw new Error("DISK_GUARD: free space below 5 GB");
  const campaign = getCampaignById(campaignId);
  if (!campaign) throw new Error(`campaign ${campaignId} not found`);
  const startedAt = new Date().toISOString();
  const resolved = resolveCampaignProductAssets(campaign, () => startedAt);
  const productName = resolved.contract.productName;

  // ----- Pages of the product itself. Nothing else is requested. -----
  const pageUrls = [...new Set([...resolved.candidates.map((item) => item.listing.sourcePage), ...resolved.officialHosts.map((host) => `https://${host}/`)])]
    .filter((url) => url.startsWith("https://") && hostMatches(new URL(url).hostname, resolved.officialHosts))
    .slice(0, 4);
  const pages: Array<{ url: string; status: number | null; error: string | null; bytes: number | null; sentences: string[] }> = [];
  const discovered: ProductAssetCandidate[] = [];
  const discoveryNotes: Array<{ page: string; found: number; keptAsCandidates: number; rejectedByClassifier: number }> = [];

  for (const url of pageUrls) {
    const page = await getPage(url);
    pages.push({ url, status: page.status, error: page.error, bytes: page.html?.length ?? null, sentences: page.html ? assetSentences(page.html) : [] });
    if (!page.html) continue;
    const sectioned = extractOfficialPromoImages(page.html, url);
    const found = discoverSourceAssets(page.html, url);
    let kept = 0;
    for (const item of found) {
      if (item.rejected || TRACKING_HOST.test(new URL(item.url).hostname)) continue;
      kept += 1;
      discovered.push({
        id: `page-${discovered.length + 1}`,
        productName,
        url: item.url,
        origin: hostMatches(new URL(url).hostname, resolved.officialHosts) ? "OFFICIAL_PRODUCT_PAGE" : "UNKNOWN",
        kind: kindFromRole(item.role),
        fileName: decodeURIComponent(new URL(item.url).pathname.split("/").pop() || "image"),
        alt: item.alt || null,
        declaredProduct: null,
        listing: { sourcePage: url, section: item.source === "og" || item.source === "twitter" || item.source === "jsonld" ? "META_TAG" : "DISPLAYED_ONLY", observedAt: startedAt },
        authorizationEvidence: null,
        policyBlock: null,
        humanRejection: null,
        approval: null,
        localFile: null,
        measured: null,
      });
    }
    discoveryNotes.push({ page: url, found: found.length + sectioned.length, keptAsCandidates: kept, rejectedByClassifier: found.filter((item) => item.rejected).length });
  }

  // ----- Merge with what is already stored, then measure a bounded number of files. -----
  const all = [...resolved.candidates, ...discovered];
  const context = {
    productName,
    officialHosts: resolved.officialHosts,
    declaredAssetHosts: resolved.declaredAssetHosts,
    otherProducts: [] as string[],
  };
  const fetchable = all.filter((item) => item.url.startsWith("https://") && !TRACKING_HOST.test(new URL(item.url).hostname) && !/\.(?:zip|rar)$/i.test(item.fileName));
  const unique = new Map<string, ProductAssetCandidate>();
  for (const item of fetchable) if (!unique.has(normalizedAssetUrl(item.url))) unique.set(normalizedAssetUrl(item.url), item);
  // Only kinds that could stage a product are worth a download. Icons, logos and banners are rejected by kind anyway.
  const priority: Record<AssetKind, number> = { PACKSHOT: 0, PACKAGING: 1, CONTEXTUAL: 2, OTHER: 9, BRAND_LOGO: 9, PROMO_BANNER: 9 };
  const toFetch = [...unique.values()]
    .filter((item) => priority[item.kind] < 9)
    .sort((a, b) => priority[a.kind] - priority[b.kind])
    .slice(0, MAX_IMAGE_FETCHES);
  const measuredByUrl = new Map<string, MeasuredImage>();
  const skippedFetch: Array<{ url: string; reason: string }> = [];
  for (const item of all) {
    if (!toFetch.includes(item) && !measuredByUrl.has(item.url)) {
      skippedFetch.push({
        url: item.url,
        reason: TRACKING_HOST.test(safeHost(item.url)) || /\.(?:zip|rar)$/i.test(item.fileName)
          ? "NOT_FETCHED: affiliate tracking link or download pack"
          : priority[item.kind] >= 9
            ? `NOT_FETCHED: kind ${item.kind} cannot stage a product, so a download adds nothing`
            : "NOT_FETCHED: duplicate URL or over the fetch budget",
      });
    }
  }
  for (const item of toFetch) {
    if (freeBytes() < MIN_FREE) throw new Error("DISK_GUARD: free space below 5 GB");
    const { measured } = await fetchAndMeasure(item.url, realFetch, () => new Date().toISOString());
    measuredByUrl.set(item.url, measured);
  }
  const measuredCandidates = all.map((item) => {
    const measured = measuredByUrl.get(item.url) ?? (measuredByUrl.get([...measuredByUrl.keys()].find((key) => normalizedAssetUrl(key) === normalizedAssetUrl(item.url)) ?? "") ?? item.measured);
    return { ...item, measured };
  });
  const evaluations = evaluateCandidates(measuredCandidates, context);

  const counts = { APPROVED: 0, CANDIDATE: 0, REJECTED: 0 };
  for (const item of evaluations) counts[item.status] += 1;

  write("source-inventory.json", {
    generatedAt: startedAt,
    campaign: { id: campaign.id, slug: campaign.slug, name: campaign.name, publicationStatus: campaign.publicationStatus },
    internalSources: {
      productFactsImageProvenance: "see campaign sourceFactsJson.productImageProvenance",
      campaignAttachedImage: campaign.productImageSrc ?? null,
      campaignAttachedImageProvenance: campaign.productImageProvenance ?? null,
      officialPromoAssetRows: resolved.candidates.filter((item) => item.id.startsWith("official-")).length,
      approvedStoredFiles: existsSync(path.join(process.cwd(), "data", "campaign-assets", String(campaign.id))) ? readdirSync(path.join(process.cwd(), "data", "campaign-assets", String(campaign.id))).length : 0,
      productImagesDirectoryFiles: existsSync(path.join(process.cwd(), "data", "product-images")) ? readdirSync(path.join(process.cwd(), "data", "product-images")).length : 0,
      productImagesDirectoryNote: "Files are content-hash names. None is attached to this campaign (productImageSrc is null).",
    },
    existingCode: [
      { path: "src/lib/official-assets/*", role: "Manufacturer asset-section discovery, human approval, stored copy served at /media/campaign-asset" },
      { path: "src/lib/assets/discover.ts + classify.ts", role: "Image candidates from page HTML (og, img, srcset, jsonld) with a role classifier" },
      { path: "src/lib/product-image.ts", role: "Legacy import path: og/img from the source page, stored at /media/product, provenance DIRECT_SOURCE or MANUAL" },
      { path: "src/lib/clickbank*.ts", role: "Hoplink and marketplace data. No image or creative endpoint is used." },
      { path: "src/lib/product-showcase/adapt.ts", role: "Hero image gate: campaign.productImageSrc with provenance DIRECT_SOURCE or MANUAL (legacy), now preceded by the ProductAssets contract" },
    ],
    externalSources: {
      officialPagesRequested: pages,
      discoveryNotes,
      affiliatePlatform: { platform: "ClickBank", imageApi: "NONE_USED", note: "No authorized feed or API for creatives is integrated. The affiliate page of the vendor is the only affiliate-side source." },
      manufacturerMaterials: "Only what the vendor's own pages expose. No press kit or feed was found or requested.",
      trackingLinksNotRequested: skippedFetch.filter((item) => item.reason.includes("tracking")).map((item) => item.url),
    },
    budget: { pageRequests: pages.length, imageRequests: toFetch.length, maxImageRequests: MAX_IMAGE_FETCHES },
  });

  write("candidate-images.json", {
    generatedAt: startedAt,
    count: measuredCandidates.length,
    candidates: measuredCandidates.map((item) => ({
      id: item.id,
      url: item.url,
      domain: safeHost(item.url),
      sourcePage: item.listing.sourcePage,
      listing: item.listing.section,
      product: item.productName,
      kind: item.kind,
      origin: item.origin,
      fileName: item.fileName,
      alt: item.alt,
      resolution: item.measured?.width && item.measured?.height ? `${item.measured.width}x${item.measured.height}` : null,
      format: item.measured?.format ?? null,
      bytes: item.measured?.byteLength ?? null,
      sha256: item.measured?.sha256 ?? null,
      measured: Boolean(item.measured),
    })),
    notFetched: skippedFetch,
  });

  write("validation-results.json", {
    generatedAt: startedAt,
    summary: counts,
    note: "technical validity, product match, provenance and authorization are evaluated separately. A technical PASS never implies authorization.",
    results: evaluations.map((evaluation) => {
      const item = measuredCandidates.find((entry) => entry.id === evaluation.id)!;
      return {
        id: evaluation.id,
        url: item.url,
        status: evaluation.status,
        technical: evaluation.technical,
        productMatch: evaluation.match,
        provenance: evaluation.provenance,
        authorization: evaluation.authorization,
        duplicateOf: evaluation.duplicateOf,
        blockers: evaluation.blockers,
      };
    }),
  });

  write("authorization-status.json", {
    generatedAt: startedAt,
    conclusion: counts.APPROVED > 0 ? "AT_LEAST_ONE_APPROVED" : "NO_IMAGE_IS_AUTHORIZED_FOR_PUBLIC_USE",
    authorizedForPublicPage: evaluations.filter((item) => item.status === "APPROVED").map((item) => item.id),
    perCandidate: evaluations.map((evaluation) => ({
      id: evaluation.id,
      authorization: evaluation.authorization.status,
      reasons: evaluation.authorization.reasons,
      technical: evaluation.technical.status,
      status: evaluation.status,
    })),
    pageStatementsMentioningAssets: pages.map((page) => ({
      page: page.url,
      note: "Excerpts for a human reviewer. They are not classified as permission by this tool.",
      excerpts: page.sentences,
    })),
    humanActionRequired: "Read the vendor's affiliate terms, obtain or locate an explicit statement that affiliates may reuse the packshot, record it as authorization evidence, convert AVIF to PNG/WebP if needed, then approve through the existing approval flow.",
  });

  console.log(JSON.stringify({ campaign: campaign.slug, pages: pages.map((p) => `${p.status ?? p.error} ${p.url}`), candidates: measuredCandidates.length, fetched: toFetch.length, counts, freeGb: Math.round((freeBytes() / 1024 ** 3) * 100) / 100 }, null, 2));
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
