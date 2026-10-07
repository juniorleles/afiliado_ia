/**
 * Host record domain: SERP structure reader.
 *
 * Copies structural fields from result blocks that the page already marked.
 * A marker attribute is copied as text. Missing markers stay empty. This
 * module does not request a page and does not choose an order.
 */
import type { SerpRecord } from "./serp-types";

export interface SerpParser {
  parse(html: string): SerpRecord[];
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function attr(tag: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, "i").exec(tag);
  return match ? decodeEntities(match[1] ?? "") : null;
}

function blocksOf(html: string): string[] {
  const starts: number[] = [];
  const re = /<([a-z0-9]+)[^>]*\sdata-serp=["']result["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) starts.push(match.index);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function openingTag(block: string): string {
  return /^<[^>]*>/.exec(block)?.[0] ?? "";
}

function fieldText(block: string, name: string): string | null {
  const match = new RegExp(`data-field=["']${name}["'][^>]*>([\\s\\S]*?)<\\/`, "i").exec(block);
  if (!match) return null;
  const text = stripTags(match[1] ?? "");
  return text === "" ? null : text;
}

function fieldHref(block: string, name: string): string | null {
  const tag = new RegExp(`<[^>]*data-field=["']${name}["'][^>]*>`, "i").exec(block)?.[0];
  if (!tag) return null;
  const href = attr(tag, "href");
  return href === null || href.trim() === "" ? null : href;
}

function statedPosition(tag: string): number | null {
  const raw = attr(tag, "data-position");
  if (raw === null || !/^[1-9][0-9]*$/.test(raw)) return null;
  return Number(raw);
}

function marker(tag: string, name: string): string | null {
  return attr(tag, name);
}

export function createSerpParser(): SerpParser {
  return {
    parse(html) {
      return blocksOf(html).map((block) => {
        const tag = openingTag(block);
        return {
          title: fieldText(block, "title"),
          url: fieldHref(block, "title") ?? fieldHref(block, "url"),
          description: fieldText(block, "description"),
          position: statedPosition(tag),
          resultType: marker(tag, "data-result-type"),
          sponsoredMarker: marker(tag, "data-sponsored-marker"),
          organicMarker: marker(tag, "data-organic-marker"),
          resultMetadata: marker(tag, "data-result-metadata"),
          origin: "OBSERVED",
          provenance: "DIRECT_SOURCE",
        };
      });
    },
  };
}
