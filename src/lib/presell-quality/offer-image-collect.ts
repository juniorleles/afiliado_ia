import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { inspectPublicHttpsUrl, inspectResolvedPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { fetchPublicHttps, MAX_IMAGE_BYTES } from "@/lib/real-product-assets/fetch";
import { isTransactionalControlText } from "@/lib/campaign-sources/primary-extract";
import { publicLandingUrl, readPrimaryAffiliatePage } from "@/lib/campaign-sources/primary-page";
import { readUserProvidedAffiliateUrl } from "@/lib/campaign-sources/user-provided";
import {
  extractOfferImageCandidates,
  inspectOfferImageBuffer,
  mapOfferImages,
  redactOfferImageUrl,
  type OfferImageCandidate,
  type OfferImageDiscoverySource,
  type OfferImageInventory,
} from "@/lib/presell-quality/offer-images";
import type { UserAssetDeclaration } from "@/lib/presell-quality/user-asset-declaration";
import type { DiscoveredAffiliateAsset } from "@/lib/affiliate-policy/types";

export type OfferPageAccess =
  | "REACHED"
  | "BLOCKED"
  | "CAPTCHA"
  | "SECURITY_BLOCKED"
  | "NAVIGATION_FAILED"
  | "NOT_CONFIGURED";

export type OfferImageCollectResult = {
  ok: boolean;
  accessStatus: OfferPageAccess;
  requestedUrl: string;
  finalUrl: string | null;
  title: string | null;
  htmlBytes: number;
  imageElements: OfferImageCandidate[];
  networkImages: Array<{ url: string; mimeType: string | null; bytes: number | null }>;
  inventory: OfferImageInventory | null;
  screenshotPath: string | null;
  notes: string[];
  transactionalClicks: 0;
};

type DomImage = {
  src: string;
  srcset: string;
  currentSrc: string;
  alt: string;
  title: string;
  className: string;
  loading: string;
  naturalWidth: number;
  naturalHeight: number;
  containerText: string;
};

function absoluteUrl(raw: string, base: string): string | null {
  if (!raw || raw.startsWith("data:")) return null;
  try {
    const url = new URL(raw, base);
    return inspectPublicHttpsUrl(url.toString()).ok ? url.toString() : null;
  } catch {
    return null;
  }
}

function pickSrcset(srcset: string, base: string): string | null {
  const parts = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/))
    .filter((part) => part[0]);
  const ranked = parts.sort((a, b) => {
    const aw = a[1]?.endsWith("w") ? Number.parseInt(a[1], 10) : 0;
    const bw = b[1]?.endsWith("w") ? Number.parseInt(b[1], 10) : 0;
    return bw - aw;
  });
  return ranked[0]?.[0] ? absoluteUrl(ranked[0][0], base) : null;
}

export function candidatesFromRenderedDom(input: {
  pageUrl: string;
  images: DomImage[];
  cssBackgrounds: string[];
  networkUrls: string[];
}): OfferImageCandidate[] {
  const out: OfferImageCandidate[] = [];
  const seen = new Set<string>();
  const push = (partial: Omit<OfferImageCandidate, "exclusionReason"> & { exclusionReason?: string | null }) => {
    if (!partial.sourceUrl || seen.has(partial.sourceUrl)) return;
    seen.add(partial.sourceUrl);
    out.push({
      ...partial,
      exclusionReason: partial.exclusionReason ?? null,
    });
  };

  for (const image of input.images) {
    const srcsetUrl = image.srcset ? pickSrcset(image.srcset, input.pageUrl) : null;
    const src = absoluteUrl(image.currentSrc || image.src, input.pageUrl);
    const source: OfferImageDiscoverySource = image.loading === "lazy" && !image.currentSrc ? "lazy" : srcsetUrl && srcsetUrl !== src ? "srcset" : "img";
    const url = srcsetUrl || src;
    if (!url) continue;
    push({
      sourceUrl: url,
      sourcePageUrl: input.pageUrl,
      alt: image.alt,
      title: image.title,
      className: image.className,
      parentHint: image.containerText,
      containerText: image.containerText,
      width: image.naturalWidth,
      height: image.naturalHeight,
      source,
    });
  }

  for (const raw of input.cssBackgrounds) {
    const url = absoluteUrl(raw, input.pageUrl);
    if (!url) continue;
    push({
      sourceUrl: url,
      sourcePageUrl: input.pageUrl,
      alt: "",
      title: "",
      className: "",
      parentHint: "css-background",
      containerText: "",
      width: 0,
      height: 0,
      source: "css",
    });
  }

  for (const raw of input.networkUrls) {
    const url = absoluteUrl(raw, input.pageUrl);
    if (!url) continue;
    push({
      sourceUrl: url,
      sourcePageUrl: input.pageUrl,
      alt: "",
      title: "",
      className: "",
      parentHint: "network-image",
      containerText: "",
      width: 0,
      height: 0,
      source: "network",
    });
  }

  return out;
}

export async function collectProducerOfferImages(input: {
  campaignId: number;
  productId: string;
  knownBottleCounts?: number[];
  outDir: string;
  declaration?: UserAssetDeclaration | null;
  discoveredAssets?: DiscoveredAffiliateAsset[];
  prior?: OfferImageInventory | null;
  download?: boolean;
}): Promise<OfferImageCollectResult> {
  const notes: string[] = [];
  const empty = (accessStatus: OfferPageAccess, requestedUrl: string, extra?: string): OfferImageCollectResult => ({
    ok: false,
    accessStatus,
    requestedUrl: redactOfferImageUrl(requestedUrl),
    finalUrl: null,
    title: null,
    htmlBytes: 0,
    imageElements: [],
    networkImages: [],
    inventory: null,
    screenshotPath: null,
    notes: extra ? [...notes, extra] : notes,
    transactionalClicks: 0,
  });

  const primary = readPrimaryAffiliatePage(input.campaignId);
  const record = readUserProvidedAffiliateUrl(input.campaignId);
  if (!primary || !record) return empty("NOT_CONFIGURED", "", "No registered primary affiliate page.");
  if (!primary.readAllowed) return empty("SECURITY_BLOCKED", primary.publicUrl, primary.notes[0] ?? "Primary page read is not allowed.");

  const requested = record.originalUrl;
  const safe = await inspectResolvedPublicHttpsUrl(requested);
  if (!safe.ok) return empty("SECURITY_BLOCKED", primary.publicUrl, safe.reason);

  mkdirSync(input.outDir, { recursive: true });
  const networkImages: OfferImageCollectResult["networkImages"] = [];
  let browser: Awaited<ReturnType<(typeof import("playwright"))["chromium"]["launch"]>> | null = null;

  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: false,
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    page.on("dialog", (dialog) => dialog.dismiss().catch(() => undefined));
    const rawNetworkUrls: string[] = [];
    page.on("response", (response) => {
      const type = response.headers()["content-type"] || "";
      if (!/^image\//i.test(type) && response.request().resourceType() !== "image") return;
      rawNetworkUrls.push(response.url());
      networkImages.push({
        url: redactOfferImageUrl(response.url()),
        mimeType: type.split(";")[0] || null,
        bytes: Number(response.headers()["content-length"] || 0) || null,
      });
    });

    const response = await page.goto(safe.url.toString(), { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2500);
    const finalUrl = page.url();
    const title = await page.title();
    const visibleText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    if (/captcha|are you a robot|access denied|cf-challenge/i.test(visibleText) && visibleText.length < 400) {
      await context.close();
      return empty("CAPTCHA", primary.publicUrl, "The destination blocked automated reading.");
    }
    if (!response || !response.ok()) notes.push(`HTTP status ${response?.status() ?? "none"}.`);

    const clicks = await page.locator("a, button, [type=submit]").evaluateAll((nodes) =>
      nodes.map((node) => ({
        tag: node.tagName,
        type: (node as HTMLButtonElement).type || "",
        text: (node.textContent || "").trim().slice(0, 80),
        href: (node as HTMLAnchorElement).href || "",
      })),
    );
    if (clicks.some((item) => item.type === "submit" || isTransactionalControlText(`${item.text} ${item.href}`))) {
      notes.push("Transactional controls were observed and not clicked.");
    }

    const images = (await page.evaluate(`(() => {
      const quantity = /(\\d+)\\s*(bottles?|jars?|tubs?|units?|packs?)/i;
      return [...document.querySelectorAll("img")].map((img) => {
        let current = img;
        let containerText = "";
        for (let i = 0; i < 6 && current; i += 1) {
          const text = (current.textContent || "").replace(/\\s+/g, " ").trim();
          if (quantity.test(text) && text.length < 800) {
            containerText = text;
            break;
          }
          current = current.parentElement;
        }
        if (!containerText) {
          containerText = ((img.parentElement && img.parentElement.textContent) || "").replace(/\\s+/g, " ").trim().slice(0, 800);
        }
        return {
          src: img.getAttribute("src") || "",
          srcset: img.getAttribute("srcset") || img.getAttribute("data-srcset") || "",
          currentSrc: img.currentSrc || "",
          alt: img.getAttribute("alt") || "",
          title: img.getAttribute("title") || "",
          className: img.className || "",
          loading: img.getAttribute("loading") || "",
          naturalWidth: img.naturalWidth || 0,
          naturalHeight: img.naturalHeight || 0,
          containerText,
        };
      });
    })()`)) as DomImage[];

    const cssBackgrounds = (await page.evaluate(`(() => {
      const urls = [];
      for (const node of document.querySelectorAll("body *")) {
        const bg = getComputedStyle(node).backgroundImage;
        const match = bg && bg !== "none" ? bg.match(/url\\((['"]?)([^)"']+)\\1\\)/i) : null;
        if (match && match[2]) urls.push(match[2]);
      }
      return urls;
    })()`)) as string[];

    const html = await page.content();
    const screenshotPath = path.join(input.outDir, "producer-offers-reference.png");
    const offer = page.locator("article, [class*='package'], [class*='offer'], [class*='product']").first();
    if (await offer.count()) {
      await offer.screenshot({ path: screenshotPath }).catch(async () => {
        await page.screenshot({ path: screenshotPath, fullPage: true });
      });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    await context.close();

    const pageUrl = publicLandingUrl(finalUrl);
    const rendered = candidatesFromRenderedDom({
      pageUrl,
      images: Array.isArray(images) ? images : [],
      cssBackgrounds: Array.isArray(cssBackgrounds) ? cssBackgrounds : [],
      networkUrls: rawNetworkUrls,
    });
    const fromHtml = extractOfferImageCandidates(html, pageUrl);
    const merged = [...rendered];
    const seen = new Set(rendered.map((item) => item.sourceUrl));
    for (const item of fromHtml) {
      if (seen.has(item.sourceUrl)) continue;
      seen.add(item.sourceUrl);
      merged.push(item);
    }

    const integrityByUrl = new Map<string, ReturnType<typeof inspectOfferImageBuffer>>();
    const localFileBySha = new Map<string, string>();
    if (input.download !== false) {
      const unique = [...new Set(merged.filter((item) => !item.exclusionReason).map((item) => item.sourceUrl))];
      for (const url of unique.slice(0, 24)) {
        const fetched = await fetchPublicHttps(url, { maxBytes: MAX_IMAGE_BYTES });
        if (!fetched.ok) {
          notes.push(`Download skipped or failed for a candidate: ${fetched.reason}`);
          continue;
        }
        const inspected = inspectOfferImageBuffer(fetched.body);
        integrityByUrl.set(url, inspected);
        if (inspected.ok) {
          const ext = inspected.mimeType === "image/jpeg" ? "jpg" : inspected.mimeType === "image/webp" ? "webp" : "png";
          const file = path.join(input.outDir, "assets", `${inspected.sha256.slice(0, 16)}.${ext}`);
          mkdirSync(path.dirname(file), { recursive: true });
          writeFileSync(file, fetched.body);
          localFileBySha.set(inspected.sha256, file);
        }
      }
    }

    const inventory = mapOfferImages({
      productId: input.productId,
      sourcePageUrl: pageUrl,
      candidates: merged,
      knownBottleCounts: input.knownBottleCounts,
      integrityByUrl,
      localFileBySha,
      declaration: input.declaration ?? null,
      discoveredAssets: input.discoveredAssets,
      prior: input.prior ?? null,
    });

    return {
      ok: true,
      accessStatus: "REACHED",
      requestedUrl: redactOfferImageUrl(primary.publicUrl),
      finalUrl: redactOfferImageUrl(publicLandingUrl(finalUrl)),
      title,
      htmlBytes: Buffer.byteLength(html, "utf8"),
      imageElements: merged,
      networkImages,
      inventory,
      screenshotPath,
      notes,
      transactionalClicks: 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notes.push(message);
    return empty("NAVIGATION_FAILED", primary.publicUrl, message);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
