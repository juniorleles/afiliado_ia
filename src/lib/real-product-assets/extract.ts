import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";

export type ExtractedImage = {
  url: string;
  sourcePage: string;
  fileName: string;
  alt: string | null;
};

const IMAGE_EXT = /\.(?:jpe?g|png|webp|avif|gif)(?:$|\?)/i;
const MAX_IMAGES = 40;

function absoluteHttps(raw: string, pageUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) return null;
  try {
    const url = new URL(trimmed, pageUrl);
    const safe = inspectPublicHttpsUrl(url.toString());
    return safe.ok ? safe.url.toString() : null;
  } catch {
    return null;
  }
}

function fileNameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "image");
  } catch {
    return "image";
  }
}

function push(seen: Set<string>, out: ExtractedImage[], url: string, pageUrl: string, alt: string | null) {
  if (seen.has(url) || out.length >= MAX_IMAGES) return;
  seen.add(url);
  out.push({ url, sourcePage: pageUrl, fileName: fileNameOf(url), alt });
}

export function extractPageImages(html: string, pageUrl: string): ExtractedImage[] {
  const page = inspectPublicHttpsUrl(pageUrl);
  if (!page.ok) return [];
  const origin = page.url.toString();
  const out: ExtractedImage[] = [];
  const seen = new Set<string>();

  const img = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = img.exec(html))) {
    const tag = match[1] || "";
    const src = /(?:src|data-src)\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(tag);
    const alt = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const raw = src?.[1] || src?.[2] || "";
    const href = absoluteHttps(raw, origin);
    if (href) push(seen, out, href, origin, (alt?.[1] || alt?.[2] || "").trim() || null);
    const srcset = /\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(tag);
    for (const part of (srcset?.[1] || srcset?.[2] || "").split(",")) {
      const candidate = absoluteHttps(part.trim().split(/\s+/)[0] || "", origin);
      if (candidate) push(seen, out, candidate, origin, (alt?.[1] || alt?.[2] || "").trim() || null);
    }
  }

  const meta = /<(?:meta|link)\b([^>]*)>/gi;
  while ((match = meta.exec(html))) {
    const tag = match[1] || "";
    if (!/property=["']og:image|name=["']twitter:image|rel=["']image_src/i.test(tag)) continue;
    const content = /(?:content|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(tag);
    const href = absoluteHttps(content?.[1] || content?.[2] || "", origin);
    if (href) push(seen, out, href, origin, null);
  }

  const anchors = /<a\b([^>]*)>/gi;
  while ((match = anchors.exec(html))) {
    const hrefRaw = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)')/i.exec(match[1] || "");
    const raw = hrefRaw?.[1] || hrefRaw?.[2] || "";
    if (!IMAGE_EXT.test(raw)) continue;
    const href = absoluteHttps(raw, origin);
    if (href) push(seen, out, href, origin, null);
  }

  return out;
}

export function productKeyFromName(name: string): string {
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return key || "product";
}
