import { imageIdFor, reuseApproval } from "@/lib/real-product-assets/authorize";
import { classifyProbableKind, isRelevantKind, matchDiscoveredProduct, policyBlockFor } from "@/lib/real-product-assets/classify";
import { extractPageImages, productKeyFromName } from "@/lib/real-product-assets/extract";
import { fetchPublicHttps } from "@/lib/real-product-assets/fetch";
import { stripUnverifiedHop } from "@/lib/real-product-assets/ssrf";
import { emptyCatalog, upsertImage } from "@/lib/real-product-assets/store";
import type { DiscoveredImage, DiscoveryReport, FetchFailure, ProductCatalog } from "@/lib/real-product-assets/types";

export function imagesFromHtml(input: {
  productName: string;
  productKey?: string;
  pageUrl: string;
  html: string;
  now?: string;
  catalog?: ProductCatalog;
}): DiscoveredImage[] {
  const productKey = input.productKey ?? productKeyFromName(input.productName);
  const now = input.now ?? new Date().toISOString();
  const drafts = extractPageImages(input.html, input.pageUrl);
  return drafts.map((draft) => {
    const probableKind = classifyProbableKind({ url: draft.url, fileName: draft.fileName, alt: draft.alt });
    const policyBlock = policyBlockFor(`${draft.fileName} ${draft.alt ?? ""} ${draft.url}`);
    const reused = input.catalog ? reuseApproval(input.catalog, draft.url) : undefined;
    return {
      id: imageIdFor(draft.url),
      productKey,
      productName: input.productName,
      url: draft.url,
      sourcePage: draft.sourcePage,
      fileName: draft.fileName,
      alt: draft.alt,
      width: null,
      height: null,
      format: null,
      byteLength: null,
      probableKind,
      relevant: isRelevantKind(probableKind) && !policyBlock,
      match: matchDiscoveredProduct(input.productName, draft.url, draft.fileName, draft.alt),
      policyBlock,
      status: policyBlock ? "BLOCKED_BY_POLICY" : reused ? "USER_APPROVED" : "PENDING_USER_APPROVAL",
      visualRole: "UNASSIGNED",
      localFile: null,
      sha256: null,
      discoveredAt: now,
    };
  });
}

export async function discoverFromUrls(input: {
  productName: string;
  urls: string[];
  catalog?: ProductCatalog;
  now?: string;
  fetchPage?: typeof fetchPublicHttps;
}): Promise<{ catalog: ProductCatalog; report: DiscoveryReport }> {
  const productKey = productKeyFromName(input.productName);
  let catalog = input.catalog ?? emptyCatalog(productKey, input.productName, input.now);
  catalog = { ...catalog, productName: input.productName };
  const fetchPage = input.fetchPage ?? fetchPublicHttps;
  const failures: FetchFailure[] = [];
  const pages: DiscoveryReport["pages"] = [];
  const reusedApprovals: string[] = [];
  const found: DiscoveredImage[] = [];

  for (const raw of input.urls) {
    const stripped = stripUnverifiedHop(raw.trim());
    if (!stripped.href) continue;
    const page = await fetchPage(stripped.href);
    if (!page.ok) {
      failures.push({ url: stripped.href, reason: page.reason });
      pages.push({ url: stripped.href, ok: false, status: page.status, reason: page.reason, found: 0 });
      continue;
    }
    const html = page.body.toString("utf8");
    const images = imagesFromHtml({
      productName: input.productName,
      productKey,
      pageUrl: page.url,
      html,
      now: input.now,
      catalog,
    });
    for (const image of images) {
      if (image.status === "USER_APPROVED") reusedApprovals.push(image.id);
      catalog = upsertImage(catalog, image);
      found.push(image);
    }
    if (!catalog.sourcePages.includes(page.url)) catalog.sourcePages = [...catalog.sourcePages, page.url];
    pages.push({ url: page.url, ok: true, status: page.status, reason: stripped.hopPlaceholder ? "hop placeholder stripped; page used only as a source" : null, found: images.length });
  }

  return {
    catalog,
    report: { productKey, productName: input.productName, pages, images: found, failures, reusedApprovals },
  };
}
