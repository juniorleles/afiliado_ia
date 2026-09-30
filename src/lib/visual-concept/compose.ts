import { readFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import type { VisualConceptFormat } from "@/lib/visual-concept/config";
import type { CompositionStrategy, VisualDirectionFamily } from "@/lib/visual-concept/types";

export type RgbaImage = {
  width: number;
  height: number;
  rgba: Buffer;
};

export type PackshotInspection = {
  inspected: boolean;
  width: number;
  height: number;
  hasAlpha: boolean;
  transparentRatio: number;
  usableTransparency: boolean;
};

const USABLE_TRANSPARENT_RATIO = 0.08;

export function inspectPackshotFile(filePath: string): PackshotInspection {
  const empty: PackshotInspection = {
    inspected: false,
    width: 0,
    height: 0,
    hasAlpha: false,
    transparentRatio: 0,
    usableTransparency: false,
  };
  try {
    const image = decodePng(readFileSync(filePath));
    let transparent = 0;
    const total = image.width * image.height;
    for (let i = 0; i < total; i++) {
      if (image.rgba[i * 4 + 3] === 0) transparent += 1;
    }
    const transparentRatio = total === 0 ? 0 : transparent / total;
    const hasAlpha = transparentRatio > 0 || image.rgba.some((value, index) => index % 4 === 3 && value < 255);
    return {
      inspected: true,
      width: image.width,
      height: image.height,
      hasAlpha,
      transparentRatio,
      usableTransparency: hasAlpha && transparentRatio >= USABLE_TRANSPARENT_RATIO,
    };
  } catch {
    return empty;
  }
}

export function resolveConceptComposition(
  packshotPath: string | null,
  outputFormat: VisualConceptFormat,
): { strategy: CompositionStrategy; format: VisualConceptFormat; reserveProductStage: boolean } {
  if (!packshotPath) {
    return { strategy: "MODEL_OUTPUT_ONLY", format: outputFormat, reserveProductStage: false };
  }
  const inspection = inspectPackshotFile(packshotPath);
  if (!inspection.usableTransparency) {
    return { strategy: "MODEL_OUTPUT_ONLY", format: outputFormat, reserveProductStage: false };
  }
  return { strategy: "SOURCE_OVERLAY_ON_RESERVED_STAGE", format: "png", reserveProductStage: true };
}

const PLACEMENTS: Record<VisualDirectionFamily, Array<{ x: number; y: number; w: number }>> = {
  PREMIUM_EDITORIAL: [{ x: 0.64, y: 0.07, w: 0.26 }],
  PREMIUM_PRODUCT: [
    { x: 0.5, y: 0.05, w: 0.42 },
    { x: 0.08, y: 0.7, w: 0.2 },
  ],
  PREMIUM_CONVERSION: [{ x: 0.7, y: 0.09, w: 0.22 }],
};

export const MASTER_PACKSHOT_PLACEMENT = { x: 0.56, y: 0.1, w: 0.22 };

export function composeSourcePackshot(input: {
  backgroundPng: Buffer;
  packshotPng: Buffer;
  direction: VisualDirectionFamily;
}): Buffer {
  return composePlacedPackshot({
    backgroundPng: input.backgroundPng,
    packshotPng: input.packshotPng,
    placements: PLACEMENTS[input.direction],
  });
}

export function composeMasterPackshot(input: { backgroundPng: Buffer; packshotPng: Buffer }): Buffer {
  return composePlacedPackshot({
    backgroundPng: input.backgroundPng,
    packshotPng: input.packshotPng,
    placements: [MASTER_PACKSHOT_PLACEMENT],
  });
}

function composePlacedPackshot(input: {
  backgroundPng: Buffer;
  packshotPng: Buffer;
  placements: Array<{ x: number; y: number; w: number }>;
}): Buffer {
  const background = decodePng(input.backgroundPng);
  const packshot = decodePng(input.packshotPng);
  const canvas = Buffer.from(background.rgba);
  for (const placement of input.placements) {
    const slot = slotBox(background.width, background.height, packshot.width, packshot.height, placement);
    blit(canvas, background.width, packshot, slot);
  }
  return encodeRgbaPng(background.width, background.height, canvas);
}

function slotBox(
  canvasWidth: number,
  canvasHeight: number,
  packWidth: number,
  packHeight: number,
  placement: { x: number; y: number; w: number },
) {
  let width = Math.max(1, Math.round(canvasWidth * placement.w));
  let height = Math.max(1, Math.round(width * (packHeight / packWidth)));
  let x = Math.round(canvasWidth * placement.x);
  let y = Math.round(canvasHeight * placement.y);
  if (x + width > canvasWidth) x = Math.max(0, canvasWidth - width);
  if (y + height > canvasHeight) y = Math.max(0, canvasHeight - height);
  if (x + width > canvasWidth) width = canvasWidth - x;
  if (y + height > canvasHeight) height = canvasHeight - y;
  return { x, y, width, height };
}

function blit(
  canvas: Buffer,
  canvasWidth: number,
  source: RgbaImage,
  slot: { x: number; y: number; width: number; height: number },
) {
  for (let y = 0; y < slot.height; y++) {
    const sy = Math.min(source.height - 1, Math.floor((y * source.height) / slot.height));
    for (let x = 0; x < slot.width; x++) {
      const sx = Math.min(source.width - 1, Math.floor((x * source.width) / slot.width));
      const sourceIndex = (sy * source.width + sx) * 4;
      const destIndex = ((slot.y + y) * canvasWidth + (slot.x + x)) * 4;
      const alpha = source.rgba[sourceIndex + 3];
      if (alpha === 0) continue;
      const keep = 255 - alpha;
      for (let channel = 0; channel < 3; channel++) {
        canvas[destIndex + channel] = Math.round(
          (source.rgba[sourceIndex + channel] * alpha + canvas[destIndex + channel] * keep) / 255,
        );
      }
      canvas[destIndex + 3] = 255;
    }
  }
}

export function encodeRgbaPng(width: number, height: number, rgba: Buffer): Buffer {
  if (rgba.length !== width * height * 4) throw new Error("rgba buffer does not match the canvas");
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(stride + 1) * y] = 0;
    rgba.copy(raw, (stride + 1) * y + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function decodePng(buffer: Buffer): RgbaImage {
  if (buffer.length < 8 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("concept background was not a png");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const idat: Buffer[] = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") palette = Buffer.from(data);
    else if (type === "tRNS") transparency = Buffer.from(data);
    else if (type === "IDAT") idat.push(Buffer.from(data));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  if (width < 1 || height < 1 || bitDepth !== 8 || interlace !== 0) throw new Error("unsupported png");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 3 ? 1 : 0;
  if (!channels) throw new Error("unsupported png");
  const stride = width * channels;
  const samples = unfilter(inflateSync(Buffer.concat(idat)), width, height, channels);
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const source = i * channels;
    if (colorType === 6) {
      samples.copy(rgba, i * 4, source, source + 4);
    } else if (colorType === 2) {
      samples.copy(rgba, i * 4, source, source + 3);
      rgba[i * 4 + 3] = 255;
    } else if (palette) {
      const index = samples[source];
      const color = index * 3;
      rgba[i * 4] = palette[color] ?? 0;
      rgba[i * 4 + 1] = palette[color + 1] ?? 0;
      rgba[i * 4 + 2] = palette[color + 2] ?? 0;
      rgba[i * 4 + 3] = transparency && index < transparency.length ? transparency[index] : 255;
    }
  }
  if (stride < 1) throw new Error("unsupported png");
  return { width, height, rgba };
}

function unfilter(raw: Buffer, width: number, height: number, channels: number): Buffer {
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  let position = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++];
    const row = out.subarray(y * stride, (y + 1) * stride);
    const previous = y === 0 ? null : out.subarray((y - 1) * stride, y * stride);
    for (let i = 0; i < stride; i++) {
      const value = raw[position++];
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous ? previous[i] : 0;
      const upperLeft = previous && i >= channels ? previous[i - channels] : 0;
      if (filter === 0) row[i] = value;
      else if (filter === 1) row[i] = (value + left) & 255;
      else if (filter === 2) row[i] = (value + up) & 255;
      else if (filter === 3) row[i] = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[i] = (value + paeth(left, up, upperLeft)) & 255;
      else throw new Error("unsupported png filter");
    }
  }
  return out;
}

function paeth(left: number, up: number, upperLeft: number): number {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function crc32(buffer: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ~crc >>> 0;
}
