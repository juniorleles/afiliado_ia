import type { RgbaImage } from "@/lib/visual-concept/compose";

export const PACKSHOT_SEPARATION_CLASSIFICATIONS = [
  "CLEAN_COMPONENT_EXTRACTION",
  "SAFE_DETERMINISTIC_CROP",
  "SAFE_DETERMINISTIC_MASK",
  "NOT_SAFELY_SEPARABLE",
] as const;

export type PackshotSeparationClassification = (typeof PACKSHOT_SEPARATION_CLASSIFICATIONS)[number];

export type PackshotComponent = {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type PackshotSeparationInspection = {
  width: number;
  height: number;
  transparentPixelRatio: number;
  hasAlpha: boolean;
  connectedComponentCount: number;
  majorComponentCount: number;
  largestComponent: PackshotComponent | null;
  classification: PackshotSeparationClassification;
  synthesizedPixelsRequired: boolean;
};

const MAJOR_AREA_RATIO = 0.005;
const TOP_BAND_RATIO = 0.18;
const FUSED_SHIFT_RATIO = 0.12;

export function inspectPackshotSeparation(image: RgbaImage): PackshotSeparationInspection {
  const total = image.width * image.height;
  let transparent = 0;
  let hasAlpha = false;
  for (let index = 0; index < total; index++) {
    const alpha = image.rgba[index * 4 + 3];
    if (alpha < 255) hasAlpha = true;
    if (alpha === 0) transparent += 1;
  }
  const components = connectedComponents(image);
  const major = components.filter((component) => component.area >= total * MAJOR_AREA_RATIO);
  const largest = major.reduce<PackshotComponent | null>(
    (best, component) => (best === null || component.area > best.area ? component : best),
    null,
  );
  const fused = largest ? hasFusedProtrusion(image, largest) : false;
  const classification: PackshotSeparationClassification =
    largest && !fused && major.length === 1 ? "CLEAN_COMPONENT_EXTRACTION" : "NOT_SAFELY_SEPARABLE";
  return {
    width: image.width,
    height: image.height,
    transparentPixelRatio: total === 0 ? 0 : transparent / total,
    hasAlpha,
    connectedComponentCount: components.length,
    majorComponentCount: major.length,
    largestComponent: largest,
    classification,
    synthesizedPixelsRequired: classification === "NOT_SAFELY_SEPARABLE",
  };
}

function connectedComponents(image: RgbaImage): PackshotComponent[] {
  const { width, height, rgba } = image;
  const total = width * height;
  const labels = new Int32Array(total);
  labels.fill(-1);
  const queue = new Int32Array(total);
  const components: PackshotComponent[] = [];
  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1 || rgba[start * 4 + 3] === 0) continue;
    const id = components.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    const component: PackshotComponent = { area: 0, minX: width, minY: height, maxX: 0, maxY: 0 };
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index - x) / width;
      component.area += 1;
      if (x < component.minX) component.minX = x;
      if (y < component.minY) component.minY = y;
      if (x > component.maxX) component.maxX = x;
      if (y > component.maxY) component.maxY = y;
      const neighbors = [index - 1, index + 1, index - width, index + width];
      for (const next of neighbors) {
        if (next < 0 || next >= total) continue;
        if (index % width === 0 && next === index - 1) continue;
        if (index % width === width - 1 && next === index + 1) continue;
        if (labels[next] !== -1 || rgba[next * 4 + 3] === 0) continue;
        labels[next] = id;
        queue[tail++] = next;
      }
    }
    components.push(component);
  }
  return components;
}

function hasFusedProtrusion(image: RgbaImage, component: PackshotComponent): boolean {
  const { width, rgba } = image;
  const boxWidth = component.maxX - component.minX + 1;
  const boxHeight = component.maxY - component.minY + 1;
  const topEnd = component.minY + Math.floor(boxHeight * TOP_BAND_RATIO);
  let topCount = 0;
  let topX = 0;
  let lowerCount = 0;
  let lowerX = 0;
  let lowerLeft = 0;
  const leftLimit = component.minX + boxWidth * 0.4;
  for (let y = component.minY; y <= component.maxY; y++) {
    for (let x = component.minX; x <= component.maxX; x++) {
      const index = y * width + x;
      if (rgba[index * 4 + 3] === 0) continue;
      if (y <= topEnd) {
        topCount += 1;
        topX += x;
      } else {
        lowerCount += 1;
        lowerX += x;
        if (x < leftLimit) lowerLeft += 1;
      }
    }
  }
  if (topCount < component.area * 0.02 || lowerCount === 0) return false;
  const shift = topX / topCount - lowerX / lowerCount;
  return shift > boxWidth * FUSED_SHIFT_RATIO && lowerLeft > component.area * 0.1;
}
