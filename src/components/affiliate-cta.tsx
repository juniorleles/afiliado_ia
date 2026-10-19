"use client";

import { type MouseEvent } from "react";
import { AFFILIATE_CTA_REL } from "@/lib/public-site";
import { isValidClickId, type CtaPosition } from "@/lib/analytics";
import { attachClickBankExtclid } from "@/lib/clickbank-hop";
import { VALIDATION_SAFE_HREF } from "@/lib/validation/constants";

type Props = {
  href: string;
  label: string;
  position: CtaPosition;
  campaignId: number;
  trackClicks?: boolean;
  clickId?: string;
  layout?: "block" | "compact" | "sticky" | "inline";
  disableAffiliateNavigation?: boolean;
  appearance?: "default" | "theme";
};

export function AffiliateCta({
  href,
  label,
  position,
  campaignId,
  trackClicks = false,
  clickId,
  layout = "block",
  disableAffiliateNavigation = false,
  appearance = "default",
}: Props) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (disableAffiliateNavigation) {
      event.preventDefault();
      return;
    }
    if (!trackClicks) return;
    try {
      const resolvedClickId =
        clickId && isValidClickId(clickId)
          ? clickId
          : typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : "";
      try {
        const nextHref = attachClickBankExtclid(event.currentTarget.href, resolvedClickId);
        if (nextHref !== event.currentTarget.href) {
          event.currentTarget.href = nextHref;
        }
      } catch {
        // Keep the original href if hop rewriting fails.
      }
      const body = JSON.stringify({
        campaignId,
        ctaPosition: position,
        ...(resolvedClickId ? { clickId: resolvedClickId } : {}),
      });
      const blob = new Blob([body], { type: "application/json" });
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon("/api/track/cta", blob);
      } else {
        void fetch("/api/track/cta", {
          method: "POST",
          body,
          keepalive: true,
          headers: { "content-type": "application/json" },
        }).catch(() => {});
      }
    } catch {
      // Navigation must continue even if measurement fails.
    }
  }

  const wrapClass =
    layout === "inline"
      ? ""
      : layout === "sticky"
      ? "w-full"
      : layout === "compact"
        ? "my-6 flex justify-center"
        : "my-10 flex justify-center";
  const themeButton = "bg-[var(--ps-accent,#1e4f48)] text-[var(--ps-on-accent,#f4f1ea)] hover:bg-[var(--ps-accent-strong,#163d38)] focus:outline-none focus:ring-2 focus:ring-[var(--ps-accent,#1e4f48)]";
  const linkClass = layout === "inline"
    ? "psp-cta"
    : appearance === "theme"
    ? layout === "sticky"
      ? `flex w-full items-center justify-center rounded-full px-4 py-3 text-base font-medium ${themeButton}`
      : `rounded-full px-6 py-3 text-base font-medium transition ${themeButton}`
    : layout === "sticky"
      ? "flex w-full items-center justify-center rounded-md bg-emerald-500 px-4 py-3 text-base font-medium text-zinc-950 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
      : "rounded-md bg-emerald-500 px-6 py-3 text-base font-medium text-zinc-950 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300";

  if (layout === "inline") {
    return (
      <a
        href={disableAffiliateNavigation ? VALIDATION_SAFE_HREF : href}
        rel={AFFILIATE_CTA_REL}
        data-cta-position={position}
        data-validation-cta={disableAffiliateNavigation ? "disabled" : undefined}
        onClick={handleClick}
        className={linkClass}
      >
        {label}
      </a>
    );
  }

  return (
    <div className={wrapClass}>
      <a
        href={disableAffiliateNavigation ? VALIDATION_SAFE_HREF : href}
        rel={AFFILIATE_CTA_REL}
        data-cta-position={position}
        data-validation-cta={disableAffiliateNavigation ? "disabled" : undefined}
        onClick={handleClick}
        className={linkClass}
      >
        {label}
      </a>
    </div>
  );
}
