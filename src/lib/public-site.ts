import { isProduction } from "@/lib/env";

export const PUBLIC_FOOTER_LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
] as const;

/** Affiliate CTA: same-tab navigation, labeled as sponsored. No target=_blank. */
export const AFFILIATE_CTA_REL = "nofollow sponsored";

export const AFFILIATE_DISCLOSURE_TEXT = "Disclosure: I may earn a commission if you purchase through links on this page.";

export const HEALTH_DISCLAIMER_TEXT =
  "This content is for informational purposes and is not a substitute for professional medical advice.";

export function getPublicSiteName(): string {
  const fromEnv = process.env.PUBLIC_SITE_NAME?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : "Product Reviews";
}

/** Portal navigation. PUBLIC_FOOTER_LINKS stays the legal set the presell footer renders. */
export const PORTAL_NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/reviews", label: "Reviews" },
  { href: "/about", label: "About" },
  { href: "/editorial-policy", label: "Editorial Policy" },
] as const;

export const PORTAL_LEGAL_LINKS = [
  { href: "/affiliate-disclosure", label: "Affiliate Disclosure" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms" },
  { href: "/contact", label: "Contact" },
] as const;

/** Null when the operator has not configured an address; never substitute a placeholder. */
export function getPublicContactEmail(): string | null {
  const fromEnv = process.env.PUBLIC_CONTACT_EMAIL?.trim();
  return fromEnv && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEnv) ? fromEnv : null;
}

/**
 * Absolute origin for canonical URLs. PUBLIC_SITE_URL in production;
 * localhost in development so local pages still emit a canonical.
 */
export function getPublicSiteUrl(): string {
  const fromEnv = (process.env.PUBLIC_SITE_URL || process.env.APP_BASE_URL)?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (isProduction()) return "https://invalid.local";
  return "http://localhost:3000";
}

export function publicAbsoluteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicSiteUrl()}${normalized}`;
}

/**
 * Site-wide health/supplement disclaimer. Campaign categories do not exist
 * in this codebase, so this cannot default per-category. Set
 * PUBLIC_HEALTH_DISCLAIMER=false to hide it.
 */
export function isHealthDisclaimerEnabled(): boolean {
  const raw = process.env.PUBLIC_HEALTH_DISCLAIMER?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return true;
}

export const TRUST_EDITORIAL = {
  heading: "How we review products",
  paragraphs: [
    "This page restates product information from the listing and related public sources. It is not an independent laboratory or clinical test.",
    "Some links on this page are affiliate links. We may earn a commission if you purchase through them. That does not change how we describe a product, and it does not replace your own judgment about whether it fits your needs.",
  ],
} as const;
