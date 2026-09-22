/**
 * Product-name-driven search queries.
 * Domain reconstruction is never the primary strategy.
 */

export function productNameSearchQueries(productName: string): string[] {
  const name = productName.replace(/\s+/g, " ").trim();
  if (!name) return [];
  return [
    name,
    `${name} ingredients`,
    `${name} supplement facts`,
    `${name} official`,
    `${name} guarantee`,
  ];
}

export function isDomainReconstructionQuery(query: string, originalUrl: string): boolean {
  try {
    const host = new URL(originalUrl).hostname.replace(/^www\./, "");
    const q = query.toLowerCase();
    if (q.includes(`site:${host}`)) return true;
    if (host && q.includes(host) && !q.includes(productNameFromQuery(query).toLowerCase())) return true;
  } catch {
    return false;
  }
  return false;
}

function productNameFromQuery(query: string): string {
  return query.replace(/\s+(ingredients|supplement facts|official|guarantee)$/i, "").trim();
}

export function productNameFromUrlPath(url: string): string | null {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    const words = last.replace(/[-_]+/g, " ").replace(/\.(html?|php)$/i, "").trim();
    const parts = words.split(/\s+/).filter(Boolean);
    if (parts.length < 2 || words.length < 8) return null;
    if (/^(product|item|p|shop|store|cart|buy)$/i.test(words)) return null;
    return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
  } catch {
    return null;
  }
}
