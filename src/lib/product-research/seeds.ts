import { inspectPublicHttpsUrl } from "@/lib/real-product-assets/ssrf";
import { classifySubmittedUrl } from "@/lib/campaign-sources/classify";

const HOP_HOST = /(^|\.)hop\.clickbank\.net$/i;
const PROGRAM_HOST = /(^|\.)(clickbank\.net|digistore24|jvzoo|warriorplus)$/i;

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isHopLink(url: string): boolean {
  const host = hostnameOf(url);
  return Boolean(host && HOP_HOST.test(host));
}

export function isAffiliateProgramUrl(url: string): boolean {
  const host = hostnameOf(url);
  return Boolean(host && (HOP_HOST.test(host) || PROGRAM_HOST.test(host)));
}

export type SeedSkip = { url: string; reason: string; status: string };

export function resolveResearchSeeds(input: {
  productUrl?: string | null;
  sourceUrl?: string | null;
  affiliateUrl?: string | null;
  affiliateResourceUrl?: string | null;
}): { seeds: string[]; rejection: string | null; skipped: SeedSkip[] } {
  const seeds: string[] = [];
  const seen = new Set<string>();
  const skipped: SeedSkip[] = [];
  const rejected: string[] = [];

  for (const raw of [input.productUrl, input.sourceUrl, input.affiliateResourceUrl]) {
    const value = raw?.trim() ?? "";
    if (!value) continue;
    const safe = inspectPublicHttpsUrl(value);
    if (!safe.ok) {
      skipped.push({ url: value, reason: safe.reason, status: "BLOCKED" });
      rejected.push(safe.reason);
      continue;
    }
    const href = safe.url.toString();
    const purpose = classifySubmittedUrl(href);
    if (!purpose.fetchable) {
      skipped.push({ url: href, reason: purpose.notes[0] ?? purpose.sourceStatus, status: purpose.sourceStatus });
      rejected.push(purpose.notes[0] ?? purpose.sourceStatus);
      continue;
    }
    if (isHopLink(href) || isAffiliateProgramUrl(href)) {
      const reason = "A HopLink or affiliate-program host is not a product page and was not used as a research seed.";
      skipped.push({ url: href, reason, status: "RESTRICTED" });
      rejected.push(reason);
      continue;
    }
    if (!seen.has(href)) {
      seen.add(href);
      seeds.push(href);
    }
  }

  const hop = input.affiliateUrl?.trim() ?? "";
  if (hop) {
    const purpose = classifySubmittedUrl(hop, "TRACKING_HOPLINK");
    skipped.push({
      url: hop,
      reason: purpose.notes[0] ?? "The campaign HopLink was not used as a research page.",
      status: purpose.sourceStatus,
    });
    rejected.push("The campaign HopLink was not used as a research page.");
  }

  if (seeds.length === 0) {
    return {
      seeds: [],
      skipped,
      rejection:
        rejected[0] ??
        "Informe uma URL https pública da página do produto ou da oferta para iniciar a pesquisa. A pesquisa não inventa endereços e não usa um HopLink sem validação.",
    };
  }
  return { seeds, skipped, rejection: null };
}
