/**
 * Official promotional files from the two sections a manufacturer page
 * labels Product Images and Campaign Images. Nothing else on the page is collected.
 */

export type OfficialSection = "product" | "campaign";

export type ExtractedOfficialImage = {
  sourcePage: string;
  section: OfficialSection;
  originalUrl: string;
  fileName: string;
};

const SECTION_HEADINGS: Record<string, OfficialSection> = {
  "product images": "product",
  "campaign images": "campaign",
};

export function officialToolsPageAllowed(pageUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(pageUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (/(^|\.)google\./.test(host)) return false;
  if (/(^|\.)bing\.com$/.test(host) || host === "duckduckgo.com" || host.endsWith(".duckduckgo.com")) return false;
  if (host === "search.yahoo.com" || host.endsWith(".search.yahoo.com")) return false;
  return true;
}

function headingText(inner: string): string {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function imageSources(fragment: string, pageUrl: string): Array<{ originalUrl: string; fileName: string }> {
  const found: Array<{ originalUrl: string; fileName: string }> = [];
  const seen = new Set<string>();
  const pattern = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fragment))) {
    const raw = (match[1] || match[2] || "").trim();
    if (!raw || raw.startsWith("data:") || /\.svg(?:$|\?)/i.test(raw)) continue;
    if (/facebook\.com\/tr|pixel|spacer\.gif|1x1/i.test(raw)) continue;
    let absolute: URL;
    try {
      absolute = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (absolute.protocol !== "https:") continue;
    const originalUrl = absolute.toString();
    if (seen.has(originalUrl) || originalUrl.includes("demo-assets")) continue;
    seen.add(originalUrl);
    const fileName = decodeURIComponent(absolute.pathname.split("/").pop() || "image");
    found.push({ originalUrl, fileName });
  }
  return found;
}

export function extractOfficialPromoImages(html: string, pageUrl: string): ExtractedOfficialImage[] {
  if (!officialToolsPageAllowed(pageUrl)) return [];
  const headings = [...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi)];
  const images: ExtractedOfficialImage[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const section = SECTION_HEADINGS[headingText(heading[1] || "")];
    if (!section || heading.index === undefined) continue;
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? html.length;
    for (const image of imageSources(html.slice(start, end), pageUrl)) {
      if (seen.has(image.originalUrl)) continue;
      seen.add(image.originalUrl);
      images.push({ sourcePage: pageUrl, section, ...image });
    }
  }
  return images;
}
