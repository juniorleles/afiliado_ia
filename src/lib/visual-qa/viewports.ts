export type NamedViewport = {
  width: number;
  height: number;
  label: "mobile" | "desktop" | "responsive";
  captureScreenshots: boolean;
};

/** Full multimodal inspection viewports. */
export const PRIMARY_VIEWPORTS: NamedViewport[] = [
  { width: 390, height: 844, label: "mobile", captureScreenshots: true },
  { width: 1440, height: 1000, label: "desktop", captureScreenshots: true },
];

/** Deterministic overflow / stacking widths. Height is a usable window, not the page. */
export const RESPONSIVE_WIDTHS = [375, 390, 768, 1024, 1440] as const;

export function responsiveViewports(): NamedViewport[] {
  return RESPONSIVE_WIDTHS.map((width) => {
    const primary = PRIMARY_VIEWPORTS.find((item) => item.width === width);
    if (primary) return primary;
    return {
      width,
      height: width <= 430 ? 844 : 1000,
      label: "responsive",
      captureScreenshots: false,
    };
  });
}

export function inspectionViewports(): NamedViewport[] {
  const seen = new Set<string>();
  const out: NamedViewport[] = [];
  for (const item of [...PRIMARY_VIEWPORTS, ...responsiveViewports()]) {
    const key = `${item.width}x${item.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const MAX_FULLPAGE_JPEG_BYTES = 3_500_000;
export const MAX_FULLPAGE_HEIGHT_PX = 8000;

export function shouldSegmentScreenshot(input: { pageHeight: number; jpegBytes: number }): boolean {
  return input.pageHeight > MAX_FULLPAGE_HEIGHT_PX || input.jpegBytes > MAX_FULLPAGE_JPEG_BYTES;
}

export const SCREENSHOT_SEGMENTS = ["hero", "upper", "middle", "lower", "footer"] as const;
export type ScreenshotSegment = (typeof SCREENSHOT_SEGMENTS)[number];
