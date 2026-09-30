/**
 * Shared HTML-to-text helpers for deterministic extraction.
 * Visible text only: comments, scripts and styles are not evidence.
 */

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function cleanHtmlText(html: string): string {
  return decodeHtmlEntities(stripTags(html)).trim();
}

export function stripHiddenMarkup(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");
}

export function extractTaggedTexts(html: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  for (const match of html.matchAll(re)) {
    const text = cleanHtmlText(match[1] ?? "");
    if (text) out.push(text);
  }
  return out;
}

export function extractListItems(html: string): string[] {
  const items: string[] = [];
  for (const match of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = cleanHtmlText(match[1] ?? "");
    if (text) items.push(text);
  }
  return items;
}

export function extractParagraphs(html: string): string[] {
  return extractTaggedTexts(html, "p");
}

export function extractHeadings(html: string): string[] {
  const out: string[] = [];
  for (let level = 1; level <= 6; level += 1) {
    out.push(...extractTaggedTexts(html, `h${level}`));
  }
  return out;
}

export function extractTableCells(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
    const text = cleanHtmlText(match[1] ?? "");
    if (text) out.push(text);
  }
  return out;
}

export function collapseText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
