const OFFICIAL_TITLE =
  /\bofficial(?:\s+(?:web\s*)?site|\s+website|\s+usa|\s+page|\s+store)?\b/i;
const DISCOUNT_TITLE = /\bget\s+\d+\s*%\s*off(?:\s+today)?\b|\b\d+\s*%\s*off today\b|\bbuy now\b|\blimited offer\b/i;
const PROMO_LABEL = /\b(official|usa|shop|store|buy|get|deal|offer|coupon|discount|sale)\b/i;

export function isPromotionalTitle(title: string): boolean {
  return OFFICIAL_TITLE.test(title) || DISCOUNT_TITLE.test(title);
}

export function isPromotionalHost(host: string): boolean {
  const sld = registrableLabel(host);
  const spaced = sld.replace(/[-_]/g, " ");
  if (PROMO_LABEL.test(spaced)) return true;
  if (/official|coupon|discount/i.test(sld)) return true;
  if (/(?:^|[a-z])(?:usa|shop|store|official)$/i.test(sld)) return true;
  if (/^(?:get|buy|shop|official)/i.test(sld)) return true;
  return false;
}

export function promotionalPatternKey(title: string): string | null {
  if (OFFICIAL_TITLE.test(title)) return "OFFICIAL_SITE";
  if (DISCOUNT_TITLE.test(title)) return "PERCENT_OFF_TODAY";
  return null;
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function registrableLabel(host: string): string {
  const noWww = host.replace(/^www\./i, "").toLowerCase();
  const parts = noWww.split(".").filter(Boolean);
  if (parts.length <= 1) return parts[0] || "";
  if (parts.length >= 3 && parts[parts.length - 2]!.length <= 3) {
    return parts.slice(0, -2).join("");
  }
  return parts.slice(0, -1).join("");
}

export function compactHostLabel(host: string): string {
  return registrableLabel(host).replace(/[^a-z0-9]/g, "");
}
