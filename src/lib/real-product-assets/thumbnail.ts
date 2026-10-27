import { existsSync, readFileSync } from "node:fs";
import { looksLikeHtmlOrScript, readImageDimensions, sniffImageMime } from "@/lib/assets/quality";
import { fetchPublicHttps, MAX_IMAGE_BYTES } from "@/lib/real-product-assets/fetch";
import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { readLabFixtureBytes } from "@/lib/real-product-assets/lab-fixture";
import { DEFAULT_STORE_ROOT, readCatalog } from "@/lib/real-product-assets/store";
import type { DiscoveredImage } from "@/lib/real-product-assets/types";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type ThumbnailOk = {
  ok: true;
  body: Buffer;
  contentType: string;
  width: number | null;
  height: number | null;
  bytes: number;
  source: "local" | "remote";
};

export type ThumbnailFail = {
  ok: false;
  status: number;
  reason: string;
};

export function validateThumbnailBytes(
  body: Buffer,
  declaredType: string | null,
): { ok: true; contentType: string; width: number | null; height: number | null } | { ok: false; reason: string } {
  if (!body.length) return { ok: false, reason: "Empty response." };
  if (looksLikeHtmlOrScript(body)) return { ok: false, reason: "Remote response was HTML or script, not an image." };
  const sniffed = sniffImageMime(body);
  if (!sniffed || !ALLOWED.has(sniffed)) {
    return { ok: false, reason: `Unsafe or unsupported image type (${sniffed ?? declaredType ?? "unknown"}).` };
  }
  const dims = readImageDimensions(body);
  return { ok: true, contentType: sniffed, width: dims?.width ?? null, height: dims?.height ?? null };
}

function fromLocalFile(image: DiscoveredImage): ThumbnailOk | ThumbnailFail {
  if (!image.localFile || !existsSync(image.localFile)) {
    return { ok: false, status: 404, reason: "Approved file is missing." };
  }
  const body = readFileSync(image.localFile);
  const checked = validateThumbnailBytes(body, null);
  if (!checked.ok) return { ok: false, status: 415, reason: checked.reason };
  return {
    ok: true,
    body,
    contentType: checked.contentType,
    width: checked.width,
    height: checked.height,
    bytes: body.length,
    source: "local",
  };
}

export async function loadCatalogThumbnail(
  productKey: string,
  imageId: string,
  root = DEFAULT_STORE_ROOT,
): Promise<ThumbnailOk | ThumbnailFail> {
  const catalog = readCatalog(productKey, root);
  const image = catalog?.images.find((item) => item.id === imageId);
  if (!catalog || !image) return { ok: false, status: 404, reason: "Image is not in this catalog." };

  if (image.status === "USER_APPROVED" && image.localFile) {
    const local = fromLocalFile(image);
    if (local.ok) return local;
  }

  const fixture = readLabFixtureBytes(image.url);
  if (fixture) {
    const checked = validateThumbnailBytes(fixture, null);
    if (!checked.ok) return { ok: false, status: 415, reason: checked.reason };
    return {
      ok: true,
      body: fixture,
      contentType: checked.contentType,
      width: checked.width,
      height: checked.height,
      bytes: fixture.length,
      source: "local",
    };
  }

  const safe = inspectPublicHttpsUrl(image.url);
  if (!safe.ok) return { ok: false, status: 400, reason: safe.reason };

  const fetched = await fetchPublicHttps(safe.url.toString(), { maxBytes: MAX_IMAGE_BYTES });
  if (!fetched.ok) {
    return { ok: false, status: fetched.status && fetched.status >= 400 ? fetched.status : 502, reason: fetched.reason };
  }
  const checked = validateThumbnailBytes(fetched.body, fetched.contentType);
  if (!checked.ok) return { ok: false, status: 415, reason: checked.reason };
  return {
    ok: true,
    body: fetched.body,
    contentType: checked.contentType,
    width: checked.width,
    height: checked.height,
    bytes: fetched.body.length,
    source: "remote",
  };
}
