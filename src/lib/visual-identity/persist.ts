import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodePng } from "@/lib/visual-concept/compose";
import { localMediaRoot } from "@/lib/storage/local";
import {
  extractVisualIdentity,
  isFrameworkStylesheet,
  presentationStyle,
  VISUAL_IDENTITY_VERSION,
  type VisualIdentity,
} from "@/lib/visual-identity/extract";
import type { SourceVisual } from "@/lib/visual-identity/types";

export type { SourceVisual };

export function sourceVisualForUrl(sourceUrl: string | null | undefined): SourceVisual | null {
  const identity = readPersistedVisualIdentity(sourceUrl);
  if (!identity) return null;
  return { character: identity.character, style: presentationStyle(identity) };
}

function identityRoot(): string {
  return path.join(process.cwd(), "data", "visual-identity", `v${VISUAL_IDENTITY_VERSION}`);
}

export function visualIdentityPath(sourceUrl: string): string {
  const key = createHash("sha256").update(sourceUrl.trim()).digest("hex").slice(0, 24);
  return path.join(identityRoot(), `${key}.json`);
}

export function readPersistedVisualIdentity(sourceUrl: string | null | undefined): VisualIdentity | null {
  const url = sourceUrl?.trim();
  if (!url) return null;
  const file = visualIdentityPath(url);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as VisualIdentity;
    if (parsed.version !== VISUAL_IDENTITY_VERSION || parsed.sourceUrl.trim() !== url) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stylesheetLinks(html: string, pageUrl: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/rel\s*=\s*["'][^"']*stylesheet/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const url = new URL(href, pageUrl).toString();
    if (isFrameworkStylesheet(url)) continue;
    links.push(url);
  }
  return links;
}

function packshotFromFacts(productImageUrl: string | null | undefined): { rgba: Buffer; width: number; height: number } | null {
  const url = productImageUrl?.trim() || "";
  const name = url.startsWith("/media/product/") ? url.slice("/media/product/".length) : "";
  if (!name || name.includes("..") || name.includes("/") || name.includes("\\")) return null;
  const file = path.join(localMediaRoot(), name);
  if (!existsSync(file)) return null;
  const buffer = readFileSync(file);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") return null;
  try {
    return decodePng(buffer);
  } catch {
    return null;
  }
}

export async function persistVisualIdentity(input: {
  sourceUrl: string;
  productImageUrl?: string | null;
  fetchImpl?: typeof fetch;
}): Promise<VisualIdentity | null> {
  const sourceUrl = input.sourceUrl.trim();
  const fetchImpl = input.fetchImpl || fetch;
  const page = await fetchImpl(sourceUrl, { redirect: "follow" });
  if (!page.ok) return null;
  const html = await page.text();
  const stylesheets: Array<{ url: string; css: string }> = [];
  for (const url of stylesheetLinks(html, sourceUrl)) {
    const response = await fetchImpl(url, { redirect: "follow" });
    if (!response.ok) continue;
    stylesheets.push({ url, css: await response.text() });
  }
  const identity = extractVisualIdentity({
    sourceUrl,
    html,
    stylesheets,
    productImage: packshotFromFacts(input.productImageUrl),
  });
  if (!identity) return null;
  const file = visualIdentityPath(sourceUrl);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(identity, null, 2));
  return identity;
}
