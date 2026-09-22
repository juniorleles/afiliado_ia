"use client";

import { useEffect, useState } from "react";
import { PresellCta } from "@/components/presell/presell-cta";
import {
  stickyCtaShouldShow,
  STICKY_COLLISION_PADDING_PX,
  STICKY_SCROLL_INTENT_PX,
} from "@/lib/creative/sticky";

export function StickyCtaBar(props: {
  href: string;
  label: string;
  campaignId: number;
  trackClicks: boolean;
  clickId?: string;
  compact?: boolean;
  requireScrollIntentPx?: number;
  collisionPaddingPx?: number;
  disableAffiliateNavigation?: boolean;
}) {
  const [show, setShow] = useState(false);
  const intentPx = props.requireScrollIntentPx ?? STICKY_SCROLL_INTENT_PX;
  const pad = props.collisionPaddingPx ?? STICKY_COLLISION_PADDING_PX;

  useEffect(() => {
    const read = () => {
      const intersecting = (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || 0;
        return rect.bottom > 48 && rect.top < vh - 48 && rect.width > 0 && rect.height > 0;
      };
      const vh = window.innerHeight || 0;
      const zoneTop = Math.max(0, vh - pad);
      const contentInStickyZone = [
        ...document.querySelectorAll(
          [
            ".ps-hero-title",
            ".ps-hero-summary",
            ".ps-h2",
            ".ps-body-lg",
            ".ps-feature-module",
            ".ps-fact-lead",
            ".ps-overview-bridge-pull",
            "[data-overview-bridge]",
          ].join(","),
        ),
      ].some((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return false;
        return rect.bottom > zoneTop && rect.top < vh;
      });
      setShow(
        stickyCtaShouldShow({
          heroCtaVisible: intersecting('[data-cta-position="hero"]'),
          otherPrimaryCtaVisible:
            intersecting('[data-cta-position="final"]') ||
            intersecting('[data-cta-position="guarantee"]') ||
            intersecting('[data-cta-position="middle"]'),
          guaranteeVisible: intersecting('[data-scene="GUARANTEE_STATEMENT_SCENE"]'),
          footerVisible: intersecting("footer"),
          disclosureVisible: intersecting("[data-trust-disclosure]"),
          contentInStickyZone,
          scrolledPastIntent: window.scrollY >= intentPx,
        }),
      );
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    const timer = window.setInterval(read, 400);
    return () => {
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
      window.clearInterval(timer);
    };
  }, [intentPx, pad]);

  return (
    <div
      className={`ps-sticky-cta md:hidden ${props.compact === false ? "" : "ps-sticky-cta-compact"} ${show ? "ps-sticky-cta-on" : "ps-sticky-cta-off"}`}
      data-sticky-visible={show ? "1" : "0"}
      aria-hidden={show ? undefined : true}
      style={{ ["--ps-sticky-pad" as string]: `${pad}px` }}
    >
      <PresellCta
        href={props.href}
        label={props.label}
        position="sticky"
        campaignId={props.campaignId}
        trackClicks={props.trackClicks}
        clickId={props.clickId}
        layout="sticky"
        disableAffiliateNavigation={props.disableAffiliateNavigation}
      />
    </div>
  );
}
