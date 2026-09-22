import { isUnusableProductAspect } from "@/lib/presell-display";

export type ImageDimensions = { width: number; height: number; format: "jpeg" | "png" | "webp" | "gif" | "unknown" };

export type ImageQualityFinding = {
  code:
    | "PIXELATED_PACKSHOT"
    | "TOO_SMALL_SOURCE"
    | "DISTORTED_ASPECT"
    | "BANNER_LIKE"
    | "EXCESSIVE_EMPTY_BOUNDS"
    | "PRODUCT_TOO_SMALL_IN_CANVAS";
  message: string;
};

export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  if (buffer.toString("ascii", 0, 3) === "GIF") return "image/gif";
  return null;
}

export function looksLikeHtmlOrScript(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 256).toString("utf8").toLowerCase();
  return /<html|<script|<!doctype html/.test(head);
}

export function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length < 24) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: "png" };
  }
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return readWebpDimensions(buffer);
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return readJpegDimensions(buffer);
  }
  if (buffer.toString("ascii", 0, 3) === "GIF") {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8), format: "gif" };
  }
  return null;
}

function readWebpDimensions(buffer: Buffer): ImageDimensions | null {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height, format: "webp" };
  }
  if (chunk === "VP8 " && buffer.length >= 30) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff, format: "webp" };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, format: "webp" };
  }
  return null;
}

function readJpegDimensions(buffer: Buffer): ImageDimensions | null {
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), format: "jpeg" };
    }
    const size = buffer.readUInt16BE(offset + 2);
    if (size < 2) break;
    offset += 2 + size;
  }
  return null;
}

export function inspectImageQuality(input: {
  width: number;
  height: number;
  bytes?: number;
  emptyBoundRatio?: number;
  subjectRatio?: number;
}): ImageQualityFinding[] {
  const findings: ImageQualityFinding[] = [];
  const minSide = Math.min(input.width, input.height);
  const maxSide = Math.max(input.width, input.height);
  const ratio = input.width && input.height ? input.width / input.height : 0;

  if (minSide > 0 && minSide < 240) {
    findings.push({
      code: "PIXELATED_PACKSHOT",
      message: `Source is only ${input.width}×${input.height}. Do not upscale a tiny official asset and call it high quality.`,
    });
  } else if (minSide > 0 && minSide < 400) {
    findings.push({
      code: "TOO_SMALL_SOURCE",
      message: `Packshot source is ${input.width}×${input.height}, below a 400px short-side hero floor.`,
    });
  }
  if (ratio && isUnusableProductAspect(input.width, input.height)) {
    findings.push({
      code: "BANNER_LIKE",
      message: `Aspect ${input.width}:${input.height} reads as a banner, not a product packshot.`,
    });
    findings.push({
      code: "DISTORTED_ASPECT",
      message: "Extreme aspect would distort if forced into a product stage.",
    });
  }
  if (typeof input.emptyBoundRatio === "number" && input.emptyBoundRatio > 0.72) {
    findings.push({
      code: "EXCESSIVE_EMPTY_BOUNDS",
      message: "Transparent or empty canvas dominates the image bounds.",
    });
  }
  if (typeof input.subjectRatio === "number" && input.subjectRatio < 0.18 && maxSide > 0) {
    findings.push({
      code: "PRODUCT_TOO_SMALL_IN_CANVAS",
      message: "Product occupies too little of the image canvas for a premium stage.",
    });
  }
  return findings;
}
