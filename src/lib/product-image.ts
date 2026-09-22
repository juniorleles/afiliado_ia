/**
 * Product image extraction and local materialization.
 *
 * Preferred order: imported og/content image → operator URL → placeholder.
 * Never generates a fake packshot. Local copies live under data/product-images/
 * and are served at /media/product/[file]. Production deploys should persist
 * that directory (or replace this store with object storage).
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { ImageProvenance } from "@/lib/presell-page";
import { classifyAssetCandidate } from "@/lib/assets/classify";
import { discoverSourceAssets } from "@/lib/assets/discover";
import { looksLikeHtmlOrScript, readImageDimensions, sniffImageMime } from "@/lib/assets/quality";
import { mediaStorageKind } from "@/lib/env";
import { getMediaStorage, localMediaRoot } from "@/lib/storage";

const MAX_BYTES = 2_000_000;
const ALLOWED_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type ExtractedImage = { url: string; provenance: ImageProvenance };

export type ImageCandidate = {
  url: string;
  provenance: ImageProvenance;
  source: "og" | "twitter" | "jsonld" | "img" | "srcset" | "picture" | "css" | "lazy";
  alt: string;
  width: number;
  height: number;
  score: number;
};

export function classifyProductImageCandidate(input: {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  tagHtml?: string;
  source?: "og" | "twitter" | "jsonld" | "img" | "srcset" | "picture" | "css" | "lazy";
}): { reject: string } | { score: number } {
  const classified = classifyAssetCandidate({
    url: input.url,
    alt: input.alt,
    width: input.width,
    height: input.height,
    tagHtml: input.tagHtml,
    source: input.source,
  });
  if (classified.rejected || classified.role === "UNUSABLE" || classified.role === "BRAND_LOGO") {
    return { reject: classified.rejectReason || "unusable" };
  }
  return { score: classified.packshotScore };
}

export function extractProductImageCandidates(html: string, pageUrl = ""): ImageCandidate[] {
  const seen = new Set<string>();
  const out: ImageCandidate[] = [];
  for (const item of discoverSourceAssets(html, pageUrl)) {
    if (item.rejected || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push({
      url: item.url,
      provenance: "DIRECT_SOURCE",
      source: item.source,
      alt: item.alt,
      width: item.width,
      height: item.height,
      score: item.packshotScore,
    });
  }
  return out;
}

export function extractProductImage(html: string, pageUrl = ""): ExtractedImage | null {
  const ranked = extractProductImageCandidates(html, pageUrl).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return best ? { url: best.url, provenance: best.provenance } : null;
}

export const MANUAL_UPLOAD_MAX_BYTES = MAX_BYTES;
export const MANUAL_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateManualProductUpload(buffer: Buffer, mimeHint = ""): { ok: true; mime: string } | { ok: false; error: string } {
  if (!buffer.length) return { ok: false, error: "empty file" };
  if (buffer.length > MAX_BYTES) return { ok: false, error: "file too large" };
  if (looksLikeHtmlOrScript(buffer)) return { ok: false, error: "html or script is not an image" };
  const sniffed = sniffImageMime(buffer);
  const mime = (sniffed || mimeHint.split(";")[0].trim().toLowerCase()) as string;
  if (!MANUAL_UPLOAD_TYPES.includes(mime as (typeof MANUAL_UPLOAD_TYPES)[number]) && mime !== "image/jpg") {
    return { ok: false, error: "only jpeg, png, and webp are accepted" };
  }
  if (!sniffed) return { ok: false, error: "file is not a valid image" };
  const dims = readImageDimensions(buffer);
  if (!dims || dims.width < 32 || dims.height < 32) return { ok: false, error: "image is too small" };
  if (dims.width > 8000 || dims.height > 8000) return { ok: false, error: "image dimensions are too large" };
  return { ok: true, mime: sniffed === "image/jpeg" ? "image/jpeg" : sniffed };
}

export function storeManualProductImage(buffer: Buffer, mime: string): { src: string; provenance: "MANUAL" } | null {
  const validated = validateManualProductUpload(buffer, mime);
  if (!validated.ok) return null;
  const ext = ALLOWED_EXT[validated.mime];
  if (!ext) return null;
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
  const filename = `${hash}.${ext}`;
  persistOriginal(filename, buffer, validated.mime);
  return { src: `/media/product/${filename}`, provenance: "MANUAL" };
}

export function productImageDir(): string {
  return localMediaRoot();
}

function persistOriginal(filename: string, buffer: Buffer, mime: string): void {
  const dir = productImageDir();
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, filename);
  if (!existsSync(dest)) writeFileSync(dest, buffer);
  if (mediaStorageKind() === "OBJECT_STORAGE") {
    void getMediaStorage().put(filename, buffer, mime);
  }
}

export function isSafeImageFilename(name: string): boolean {
  return /^[a-f0-9]{16,64}\.(jpg|jpeg|png|webp|gif)$/i.test(name);
}

export function storeProductImageBuffer(
  buffer: Buffer,
  mime: string,
  provenance: ImageProvenance,
): { src: string; provenance: ImageProvenance; filename: string } | null {
  const sniffed = sniffImageMime(buffer) || mime.split(";")[0].trim().toLowerCase();
  const ext = ALLOWED_EXT[sniffed] || ALLOWED_EXT[mime.split(";")[0].trim().toLowerCase()];
  if (!ext || ext === "gif" || buffer.length === 0 || buffer.length > MAX_BYTES) return null;
  if (looksLikeHtmlOrScript(buffer)) return null;
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 24);
  const filename = `${hash}.${ext}`;
  persistOriginal(filename, buffer, sniffed || mime);
  return { src: `/media/product/${filename}`, provenance, filename };
}

export async function materializeProductImage(
  sourceUrl: string,
  provenance: ImageProvenance,
): Promise<{ src: string; provenance: ImageProvenance } | null> {
  if (!sourceUrl.startsWith("http://") && !sourceUrl.startsWith("https://")) {
    return { src: sourceUrl, provenance };
  }
  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": "AfiliadoIA-Import/1.0 (+internal tool, not a public crawler)" },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { src: sourceUrl, provenance };
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const buffer = Buffer.from(await response.arrayBuffer());
    const stored = storeProductImageBuffer(buffer, type, provenance);
    return stored ? { src: stored.src, provenance: stored.provenance } : { src: sourceUrl, provenance };
  } catch {
    return { src: sourceUrl, provenance };
  }
}

export function readLocalProductImage(filename: string): { body: Buffer; contentType: string } | null {
  if (!isSafeImageFilename(filename)) return null;
  const dest = path.join(productImageDir(), filename);
  if (existsSync(dest)) {
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : ext === ".gif" ? "image/gif" : "image/jpeg";
    return { body: readFileSync(dest), contentType };
  }
  return null;
}

export async function readProductImage(filename: string): Promise<{ body: Buffer; contentType: string } | null> {
  const local = readLocalProductImage(filename);
  if (local) return local;
  if (mediaStorageKind() !== "OBJECT_STORAGE") return null;
  const remote = await getMediaStorage().get(filename);
  if (!remote) return null;
  persistOriginal(filename, remote.body, remote.contentType);
  return { body: remote.body, contentType: remote.contentType };
}

export type ProductImageOptimizeQuery = {
  width: number | null;
  quality: number;
  format: "webp" | "jpeg" | "original";
};

export function parseProductImageOptimizeQuery(search: URLSearchParams): ProductImageOptimizeQuery {
  const widthRaw = Number(search.get("w") || "");
  const width = Number.isFinite(widthRaw) && widthRaw >= 64 && widthRaw <= 1600 ? Math.round(widthRaw) : null;
  const qRaw = Number(search.get("q") || "72");
  const quality = Number.isFinite(qRaw) ? Math.min(90, Math.max(40, Math.round(qRaw))) : 72;
  const fm = search.get("fm");
  const format: ProductImageOptimizeQuery["format"] =
    fm === "webp" || fm === "jpeg" ? fm : width ? "webp" : "original";
  return { width, quality, format };
}

function derivedProductPath(filename: string, query: ProductImageOptimizeQuery): string {
  const stem = filename.replace(/\.[^.]+$/, "");
  const ext = query.format === "jpeg" ? "jpg" : "webp";
  return path.join(productImageDir(), "derived", `${stem}-w${query.width || "src"}-q${query.quality}.${ext}`);
}

export async function optimizeLocalProductImage(
  filename: string,
  query: ProductImageOptimizeQuery,
): Promise<{ body: Buffer; contentType: string } | null> {
  const original = await readProductImage(filename);
  if (!original) return null;
  if (!query.width && query.format === "original") return original;

  const dest = derivedProductPath(filename, query);
  if (existsSync(dest)) {
    const ext = path.extname(dest).toLowerCase();
    return {
      body: readFileSync(dest),
      contentType: ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/webp",
    };
  }

  try {
    const sharpMod = await import("sharp");
    const sharp = (sharpMod.default ?? sharpMod) as typeof import("sharp");
    let pipeline = sharp(original.body, { failOn: "none" }).rotate();
    if (query.width) pipeline = pipeline.resize({ width: query.width, withoutEnlargement: true });
    const body =
      query.format === "jpeg"
        ? await pipeline.jpeg({ quality: query.quality, mozjpeg: true }).toBuffer()
        : await pipeline.webp({ quality: query.quality }).toBuffer();
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, body);
    return { body, contentType: query.format === "jpeg" ? "image/jpeg" : "image/webp" };
  } catch {
    return original;
  }
}

