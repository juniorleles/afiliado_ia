import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodePng, encodeRgbaPng } from "../../src/lib/visual-concept/compose.ts";

const root = path.join("data", "visual-design", "joint-genesis-controlled-ready-13", "product-asset-audit-v1");
const files = [
  path.join("data", "product-images", "6e84961241bdcd28c750ceff.png"),
  path.join(root, "candidates", "2d8919be77715aa8a77e265db847135df4d0cd2a0a3142d7758be24ec56b2264.png"),
  path.join(root, "candidates", "f192abc0cb0e5d3e68078caaf3faeebba68f33025b44c059ced875e826f0ba33.png"),
];
const cell = 280;
const gap = 16;
const width = gap + files.length * (cell + gap);
const height = gap + cell + gap;
const rgba = Buffer.alloc(width * height * 4, 246);
for (let i = 0; i < width * height; i++) {
  rgba[i * 4 + 1] = 243;
  rgba[i * 4 + 2] = 238;
  rgba[i * 4 + 3] = 255;
}
files.forEach((file, index) => {
  const image = decodePng(readFileSync(file));
  const scale = Math.min(cell / image.width, cell / image.height);
  const drawW = Math.max(1, Math.round(image.width * scale));
  const drawH = Math.max(1, Math.round(image.height * scale));
  const originX = gap + index * (cell + gap) + Math.floor((cell - drawW) / 2);
  const originY = gap + Math.floor((cell - drawH) / 2);
  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const sx = Math.min(image.width - 1, Math.floor(x / scale));
      const sy = Math.min(image.height - 1, Math.floor(y / scale));
      const source = (sy * image.width + sx) * 4;
      const alpha = image.rgba[source + 3] / 255;
      const dx = originX + x;
      const dy = originY + y;
      const dest = (dy * width + dx) * 4;
      rgba[dest] = Math.round(image.rgba[source] * alpha + rgba[dest] * (1 - alpha));
      rgba[dest + 1] = Math.round(image.rgba[source + 1] * alpha + rgba[dest + 1] * (1 - alpha));
      rgba[dest + 2] = Math.round(image.rgba[source + 2] * alpha + rgba[dest + 2] * (1 - alpha));
      rgba[dest + 3] = 255;
    }
  }
});
writeFileSync(path.join(root, "contact-sheet.png"), encodeRgbaPng(width, height, rgba));
console.log("CONTACT_SHEET=written");
