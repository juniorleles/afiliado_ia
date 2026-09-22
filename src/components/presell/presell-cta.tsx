import type { CtaPosition } from "@/lib/analytics";
import { generateClickId } from "@/lib/analytics";
import { attachClickBankExtclid } from "@/lib/clickbank-hop";
import { AffiliateCta } from "@/components/affiliate-cta";

export function outboundCta(baseHref: string, trackClicks: boolean): { href: string; clickId?: string } {
  if (!trackClicks) return { href: baseHref };
  const clickId = generateClickId();
  return { href: attachClickBankExtclid(baseHref, clickId), clickId };
}

export function PresellCta(props: {
  href: string;
  label: string;
  position: CtaPosition;
  campaignId: number;
  trackClicks: boolean;
  clickId?: string;
  layout?: "block" | "compact" | "sticky";
  disableAffiliateNavigation?: boolean;
}) {
  return <AffiliateCta {...props} />;
}
