import { classifyAssetCandidate } from "@/lib/assets/classify";
import type { AssetCandidate, AssetDiscoverySource } from "@/lib/assets/types";

function decodeAttr(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function attr(tag: string, name: string): string {
  return decodeAttr(tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, "i"))?.[1] || "").trim();
}

export function normalizeImageUrl(src: string, pageUrl: string): string | null {
  const trimmed = src.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed || trimmed.startsWith("data:")) return null;
  try {
    const resolved = new URL(trimmed, pageUrl || "https://example.invalid");
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    resolved.pathname = resolved.pathname.replace(/\/{2,}/g, "/");
    return resolved.href;
  } catch {
    return null;
  }
}

function parseSrcset(srcset: string, pageUrl: string): Array<{ url: string; width: number }> {
  return srcset
    .split(",")
    .map((part) => part.trim())
    .map((part) => {
      const [src, size] = part.split(/\s+/);
      const url = src ? normalizeImageUrl(decodeAttr(src), pageUrl) : null;
      const width = size && size.endsWith("w") ? Number.parseInt(size, 10) : 0;
      return url ? { url, width: Number.isFinite(width) ? width : 0 } : null;
    })
    .filter((item): item is { url: string; width: number } => Boolean(item));
}

function jsonLdImages(html: string, pageUrl: string): Array<{ url: string; hint: string }> {
  const blocks = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const urls: Array<{ url: string; hint: string }> = [];
  for (const block of blocks) {
    try {
      const json = JSON.parse(block[1] || "null") as unknown;
      const visit = (value: unknown, hint: string) => {
        if (!value) return;
        if (typeof value === "string") {
          const url = normalizeImageUrl(value, pageUrl);
          if (url) urls.push({ url, hint });
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((item) => visit(item, hint));
          return;
        }
        if (typeof value === "object") {
          const rec = value as Record<string, unknown>;
          const type = String(rec["@type"] || "");
          if (rec.image) visit(rec.image, "jsonld-image");
          if (rec.url && /ImageObject/i.test(type)) visit(rec.url, "jsonld-imageobject");
        }
      };
      visit(json, "jsonld");
    } catch {
      /* ignore malformed json-ld */
    }
  }
  return urls;
}

function surroundingHint(html: string, index: number): string {
  const start = Math.max(0, index - 160);
  const end = Math.min(html.length, index + 80);
  return html.slice(start, end);
}

function toCandidate(partial: {
  url: string;
  source: AssetDiscoverySource;
  alt?: string;
  title?: string;
  width?: number;
  height?: number;
  tagHtml?: string;
  className?: string;
  parentHint?: string;
}): AssetCandidate {
  const classified = classifyAssetCandidate({
    url: partial.url,
    alt: partial.alt,
    title: partial.title,
    width: partial.width,
    height: partial.height,
    tagHtml: partial.tagHtml,
    className: partial.className,
    parentHint: partial.parentHint,
    source: partial.source,
  });
  return {
    url: partial.url,
    alt: partial.alt || "",
    title: partial.title || "",
    width: partial.width || 0,
    height: partial.height || 0,
    source: partial.source,
    tagHtml: partial.tagHtml || "",
    className: partial.className || "",
    parentHint: partial.parentHint || "",
    role: classified.role,
    packshotScore: classified.packshotScore,
    rejected: classified.rejected,
    rejectReason: classified.rejectReason,
    classificationMethod: classified.classificationMethod,
    provenance: "DIRECT_SOURCE",
  };
}

const LAZY_SRC_ATTRS = ["data-src", "data-lazy-src", "data-original", "data-lazy", "data-bg"];

/**
 * Discover image candidates from supplied source HTML only.
 * Does not fetch third-party sites or bypass access restrictions.
 */
export function discoverSourceAssets(html: string, pageUrl = ""): AssetCandidate[] {
  const out: AssetCandidate[] = [];
  const push = (candidate: AssetCandidate) => {
    out.push(candidate);
  };

  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og?.[1]) {
    const url = normalizeImageUrl(decodeAttr(og[1]).trim(), pageUrl);
    if (url) {
      push(
        toCandidate({
          url,
          source: "og",
          alt: "og:image",
          tagHtml: og[0],
          parentHint: "open-graph",
        }),
      );
    }
  }

  const twitter =
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  if (twitter?.[1]) {
    const url = normalizeImageUrl(decodeAttr(twitter[1]).trim(), pageUrl);
    if (url) {
      push(
        toCandidate({
          url,
          source: "twitter",
          alt: "twitter:image",
          tagHtml: twitter[0],
          parentHint: "twitter-card",
        }),
      );
    }
  }

  for (const item of jsonLdImages(html, pageUrl)) {
    push(toCandidate({ url: item.url, source: "jsonld", alt: "jsonld", parentHint: item.hint }));
  }

  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const tagHtml = tag[0];
    const src = attr(tagHtml, "src");
    const srcset = attr(tagHtml, "srcset") || attr(tagHtml, "data-srcset");
    const alt = attr(tagHtml, "alt");
    const title = attr(tagHtml, "title");
    const className = attr(tagHtml, "class");
    const width = Number.parseInt(attr(tagHtml, "width"), 10) || 0;
    const height = Number.parseInt(attr(tagHtml, "height"), 10) || 0;
    const parentHint = surroundingHint(html, tag.index ?? 0);
    if (srcset) {
      const variants = parseSrcset(srcset, pageUrl);
      const best = variants.sort((a, b) => b.width - a.width)[0];
      if (best) {
        push(
          toCandidate({
            url: best.url,
            source: "srcset",
            alt,
            title,
            width: best.width || width,
            height,
            tagHtml,
            className,
            parentHint,
          }),
        );
      }
    }
    const lazySrc = LAZY_SRC_ATTRS.map((name) => attr(tagHtml, name)).find(Boolean) || "";
    const srcs = [src, lazySrc].filter(Boolean);
    for (const raw of srcs) {
      const url = normalizeImageUrl(raw, pageUrl);
      if (!url) continue;
      push(
        toCandidate({
          url,
          source: lazySrc && raw === lazySrc ? "lazy" : "img",
          alt,
          title,
          width,
          height,
          tagHtml,
          className,
          parentHint,
        }),
      );
    }
  }

  for (const source of html.matchAll(/<source\b[^>]*>/gi)) {
    const tagHtml = source[0];
    const srcset = attr(tagHtml, "srcset") || attr(tagHtml, "data-srcset");
    if (!srcset) continue;
    const best = parseSrcset(srcset, pageUrl).sort((a, b) => b.width - a.width)[0];
    if (best) {
      push(
        toCandidate({
          url: best.url,
          source: "picture",
          width: best.width,
          tagHtml,
          parentHint: surroundingHint(html, source.index ?? 0),
        }),
      );
    }
  }

  for (const match of html.matchAll(/background-image\s*:\s*url\(\s*(['"]?)([^)"']+)\1\s*\)/gi)) {
    const url = normalizeImageUrl(match[2], pageUrl);
    if (!url) continue;
    push(
      toCandidate({
        url,
        source: "css",
        parentHint: match[0],
        tagHtml: match[0],
      }),
    );
  }

  const seen = new Set<string>();
  return out.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

export function summarizeDiscovery(candidates: AssetCandidate[]) {
  const rejected = candidates.filter((item) => item.rejected);
  const byRole: Record<string, number> = {};
  for (const item of candidates) {
    byRole[item.role] = (byRole[item.role] || 0) + 1;
  }
  return {
    total: candidates.length,
    rejected: rejected.length,
    byRole,
    rejectedReasons: rejected.map((item) => item.rejectReason).filter(Boolean),
  };
}
