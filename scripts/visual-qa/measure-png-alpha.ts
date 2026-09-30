import { readFileSync } from "node:fs";
import { decodePng } from "../../src/lib/visual-concept/compose.ts";

const files = process.argv.slice(2);
for (const file of files) {
  const image = decodePng(readFileSync(file));
  let transparent = 0;
  let opaque = 0;
  let minX = image.width;
  let minY = image.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const alpha = image.rgba[(y * image.width + x) * 4 + 3];
      if (alpha === 0) transparent += 1;
      else {
        opaque += 1;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const total = image.width * image.height;
  console.log(
    `${file} ${image.width}x${image.height} transparent=${transparent} opaque=${opaque} ratio=${(transparent / total).toFixed(3)} bbox=${minX},${minY},${maxX - minX + 1}x${maxY - minY + 1}`,
  );
}
