export type GeometryRow = {
  name: string;
  width: number;
  height: number;
  mode: string;
  horizontalOverflow: boolean;
  documentScrollWidth: number;
  bodyScrollWidth: number;
  nestedScroll: string[];
  collapsed: string[];
  pathological: string[];
  clipped: string[];
  offscreen: string[];
  featureWidths: number[];
  heroTitleWidth: number;
  images: Array<{ src: string; width: number; height: number; naturalWidth: number; naturalHeight: number }>;
  ctas: Array<{ position: string; width: number; height: number }>;
};

export const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
] as const;

/** Known broken V1 measurements. The checker must reject this class of defect. */
export const KNOWN_BROKEN_V1: GeometryRow[] = [
  {
    name: "375",
    width: 375,
    height: 812,
    mode: "viewport",
    horizontalOverflow: false,
    documentScrollWidth: 375,
    bodyScrollWidth: 375,
    nestedScroll: ["ps-hero ps-hero-stage ps-hero-v3"],
    collapsed: [],
    pathological: [".ps-feature-module#0:22cpl/285px"],
    clipped: [],
    offscreen: [],
    featureWidths: [285, 285],
    heroTitleWidth: 285,
    images: [],
    ctas: [],
  },
  {
    name: "1440",
    width: 1440,
    height: 900,
    mode: "viewport",
    horizontalOverflow: false,
    documentScrollWidth: 1440,
    bodyScrollWidth: 1440,
    nestedScroll: ["ps-hero ps-hero-stage ps-hero-v3"],
    collapsed: [],
    pathological: [".ps-guarantee#0:18cpl/543px"],
    clipped: [],
    offscreen: [],
    featureWidths: [712, 475],
    heroTitleWidth: 547,
    images: [],
    ctas: [],
  },
  {
    name: "390-frame",
    width: 1440,
    height: 900,
    mode: "fake-mobile-frame",
    horizontalOverflow: false,
    documentScrollWidth: 1440,
    bodyScrollWidth: 1440,
    nestedScroll: ["ps-hero ps-hero-stage ps-hero-v3"],
    collapsed: [".ps-hero-summary#0:17px", "p#8:2px"],
    pathological: ["p#1:8cpl/17px", ".ps-hero-summary#0:8cpl/17px"],
    clipped: [".ps-guarantee#0"],
    offscreen: [],
    featureWidths: [196, 131],
    heroTitleWidth: 0,
    images: [],
    ctas: [],
  },
];

export function geometryFailures(row: GeometryRow): string[] {
  const failures: string[] = [];
  if (row.horizontalOverflow) failures.push("HORIZONTAL_OVERFLOW");
  if (row.offscreen.length) failures.push("OFFSCREEN_MAJOR_ELEMENTS");
  if (row.clipped.length) failures.push("CLIPPED_TEXT_ELEMENTS");
  if (row.collapsed.length) failures.push("COLLAPSED_TEXT_CONTAINERS");
  if (row.pathological.length) failures.push("PATHOLOGICAL_TEXT_WRAPPING");
  if (row.nestedScroll.length) failures.push("UNEXPECTED_NESTED_SCROLL_CONTAINERS");
  return failures;
}

export function geometryPasses(row: GeometryRow): boolean {
  return geometryFailures(row).length === 0;
}
