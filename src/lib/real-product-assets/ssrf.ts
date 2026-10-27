import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)$/i;
const PRIVATE_IP =
  /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;
const BLOCKED_HOST_SUFFIX = /(\.local|\.internal|\.localhost)$/i;

export function inspectPublicHttpsUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "The URL is not parseable." };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "Only HTTPS URLs are fetched." };
  if (url.username || url.password) return { ok: false, reason: "URLs with credentials are rejected." };
  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOSTS.test(host) || BLOCKED_HOST_SUFFIX.test(host)) {
    return { ok: false, reason: "Local and private hosts are blocked." };
  }
  if (PRIVATE_IP.test(host)) return { ok: false, reason: "Private IP literals are blocked." };
  if (url.hostname === "metadata.google.internal") return { ok: false, reason: "Metadata hosts are blocked." };
  return { ok: true, url };
}

export function isPrivateAddress(address: string): boolean {
  const value = address.replace(/^\[|\]$/g, "");
  if (value === "::1" || value.toLowerCase() === "0:0:0:0:0:0:0:1") return true;
  if (value.toLowerCase().startsWith("fe80:") || value.toLowerCase().startsWith("fc") || value.toLowerCase().startsWith("fd")) {
    return true;
  }
  return PRIVATE_IP.test(value);
}

export async function inspectResolvedPublicHttpsUrl(
  raw: string,
): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> {
  const first = inspectPublicHttpsUrl(raw);
  if (!first.ok) return first;
  const host = first.url.hostname;
  if (isIP(host)) {
    if (isPrivateAddress(host)) return { ok: false, reason: "Private IP literals are blocked." };
    return first;
  }
  try {
    const resolved = await lookup(host, { all: true });
    if (!resolved.length) return { ok: false, reason: "The host could not be resolved." };
    if (resolved.some((item) => isPrivateAddress(item.address))) {
      return { ok: false, reason: "The host resolved to a private address." };
    }
  } catch {
    return { ok: false, reason: "The host could not be resolved." };
  }
  return first;
}

export function isSafePublicHttpsUrl(raw: string): boolean {
  return inspectPublicHttpsUrl(raw).ok;
}

export function stripUnverifiedHop(url: string): { href: string; hopPlaceholder: boolean } {
  try {
    const parsed = new URL(url);
    const hop = parsed.searchParams.get("hop");
    const placeholder = Boolean(hop && /^z+$/i.test(hop));
    if (placeholder) parsed.searchParams.delete("hop");
    return { href: parsed.toString(), hopPlaceholder: placeholder };
  } catch {
    return { href: url, hopPlaceholder: false };
  }
}
