import { createHash } from "node:crypto";
import { inspectImageQuality, looksLikeHtmlOrScript, readImageDimensions, sniffImageMime } from "@/lib/assets/quality";
import type { Finding, MeasuredImage, TechnicalStatus } from "@/lib/product-assets/types";

/**
 * Technical validation only. It answers "is this a servable image file?" and nothing else.
 * It never says the image may be used. Authorization is a separate module on purpose.
 */

export const MAX_ASSET_BYTES = 8_000_000;
const FETCH_TIMEOUT_MS = 10_000;

type Format = NonNullable<MeasuredImage["format"]>;

function boxes(buffer: Buffer, start: number, end: number): Array<{ type: string; contentStart: number; end: number }> {
  const found: Array<{ type: string; contentStart: number; end: number }> = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    let header = 8;
    if (size === 1 && offset + 16 <= end) {
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    found.push({ type, contentStart: offset + header, end: offset + size });
    offset += size;
  }
  return found;
}

/** AVIF is an ISO base media file. Dimensions live in meta > iprp > ipco > ispe. */
export function readAvifDimensions(buffer: Buffer): { width: number; height: number } | null {
  const top = boxes(buffer, 0, buffer.length);
  const meta = top.find((box) => box.type === "meta");
  if (!meta) return null;
  const iprp = boxes(buffer, meta.contentStart + 4, meta.end).find((box) => box.type === "iprp");
  if (!iprp) return null;
  const ipco = boxes(buffer, iprp.contentStart, iprp.end).find((box) => box.type === "ipco");
  if (!ipco) return null;
  const ispe = boxes(buffer, ipco.contentStart, ipco.end).find((box) => box.type === "ispe");
  if (!ispe || ispe.contentStart + 12 > ispe.end) return null;
  return { width: buffer.readUInt32BE(ispe.contentStart + 4), height: buffer.readUInt32BE(ispe.contentStart + 8) };
}

export function sniffFormat(buffer: Buffer): Format {
  if (buffer.length >= 16 && buffer.toString("ascii", 4, 8) === "ftyp") {
    const brand = buffer.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  const mime = sniffImageMime(buffer);
  if (mime === "image/jpeg") return "jpeg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "unknown";
}

/** Measure bytes that were already downloaded. Pure, so tests need no network. */
export function measureBytes(
  buffer: Buffer,
  input: { httpStatus: number | null; contentType: string | null; checkedAt: string },
): MeasuredImage {
  const html = looksLikeHtmlOrScript(buffer);
  const format: Format = html ? "unknown" : sniffFormat(buffer);
  const dims =
    format === "avif" ? readAvifDimensions(buffer) : format === "unknown" ? null : readImageDimensions(buffer);
  return {
    checkedAt: input.checkedAt,
    httpStatus: input.httpStatus,
    contentType: input.contentType,
    byteLength: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    format,
    fetchError: null,
  };
}

export function failedMeasurement(error: string, checkedAt: string, httpStatus: number | null = null): MeasuredImage {
  return { checkedAt, httpStatus, contentType: null, byteLength: null, sha256: null, width: null, height: null, format: null, fetchError: error };
}

export type FetchLike = (
  url: string,
  init: { redirect: "follow"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ status: number; url: string; headers: { get(name: string): string | null }; arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * Fetch one file and measure it. HTTPS only, bounded in time and size, and the final
 * URL after redirects must still be HTTPS. The fetcher is injected so tests stay offline.
 */
export async function fetchAndMeasure(url: string, fetcher: FetchLike, now: () => string): Promise<{ measured: MeasuredImage; bytes: Buffer | null }> {
  const checkedAt = now();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { measured: failedMeasurement("INVALID_URL", checkedAt), bytes: null };
  }
  if (parsed.protocol !== "https:") return { measured: failedMeasurement("NOT_HTTPS", checkedAt), bytes: null };
  try {
    const response = await fetcher(parsed.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "user-agent": "AfiliadoIA-AssetAudit/1.0 (+internal read-only check)" },
    });
    if (response.url && !response.url.startsWith("https://")) {
      return { measured: failedMeasurement("REDIRECTED_TO_NON_HTTPS", checkedAt, response.status), bytes: null };
    }
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() || null;
    if (response.status !== 200) {
      return { measured: { ...failedMeasurement("HTTP_STATUS", checkedAt, response.status), contentType }, bytes: null };
    }
    const declared = Number(response.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > MAX_ASSET_BYTES) {
      return { measured: { ...failedMeasurement("TOO_LARGE", checkedAt, response.status), contentType, byteLength: declared }, bytes: null };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    return { measured: measureBytes(bytes, { httpStatus: response.status, contentType, checkedAt }), bytes };
  } catch (error) {
    const name = error instanceof Error ? error.name : "ERROR";
    return { measured: failedMeasurement(name === "TimeoutError" || name === "AbortError" ? "TIMEOUT" : "UNREACHABLE", checkedAt), bytes: null };
  }
}

const SERVABLE: readonly Format[] = ["jpeg", "png", "webp"];

export function validateTechnical(measured: MeasuredImage | null): { status: TechnicalStatus; findings: Finding[] } {
  if (!measured) return { status: "NOT_CHECKED", findings: [{ code: "NOT_FETCHED", message: "The file was never fetched, so nothing about it is verified." }] };
  const findings: Finding[] = [];
  const fail = (code: string, message: string) => findings.push({ code, message });

  if (measured.fetchError) {
    fail("FETCH_FAILED", `The URL could not be fetched (${measured.fetchError}).`);
    return { status: "FAIL", findings };
  }
  if (measured.httpStatus !== 200) {
    fail("HTTP_STATUS", `The URL answered ${measured.httpStatus ?? "no status"}, not 200.`);
    return { status: "FAIL", findings };
  }
  if ((measured.contentType ?? "").startsWith("text/") || (measured.contentType ?? "").includes("html")) {
    fail("NOT_AN_IMAGE", `The URL served ${measured.contentType}, not an image.`);
    return { status: "FAIL", findings };
  }
  if (!measured.format || measured.format === "unknown") {
    fail("UNRECOGNIZED_FORMAT", "The bytes are not a recognized image format.");
    return { status: "FAIL", findings };
  }
  if ((measured.byteLength ?? 0) > MAX_ASSET_BYTES || (measured.byteLength ?? 0) < 24) {
    fail("FILE_SIZE", "The file size is outside the accepted range.");
    return { status: "FAIL", findings };
  }
  if (measured.format === "gif") {
    fail("FORMAT_NOT_ACCEPTED", "GIF can be animated and is not inspected frame by frame.");
    return { status: "FAIL", findings };
  }
  if (!measured.width || !measured.height) {
    fail("NO_DIMENSIONS", "The image dimensions could not be read.");
    return { status: "FAIL", findings };
  }
  const quality = inspectImageQuality({ width: measured.width, height: measured.height, bytes: measured.byteLength ?? undefined });
  const blocking = quality.filter((item) => ["PIXELATED_PACKSHOT", "TOO_SMALL_SOURCE", "BANNER_LIKE", "DISTORTED_ASPECT"].includes(item.code));
  for (const item of blocking) fail(item.code, item.message);
  if (blocking.length > 0) return { status: "FAIL", findings };

  const declaredMime = measured.contentType?.replace("image/jpg", "image/jpeg") ?? null;
  const expected = `image/${measured.format}`;
  if (declaredMime && declaredMime !== expected && declaredMime !== "application/octet-stream") {
    findings.push({ code: "CONTENT_TYPE_MISMATCH", message: `The server said ${declaredMime} but the bytes are ${expected}.` });
  }
  if (!SERVABLE.includes(measured.format)) {
    findings.push({ code: "NEEDS_CONVERSION", message: `${measured.format.toUpperCase()} is not served by the asset route. A JPEG, PNG or WebP copy is needed before use.` });
    return { status: "PASS_NEEDS_CONVERSION", findings };
  }
  return { status: "PASS", findings };
}
